import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Lead } from '../types';
import { calculateLeadScore } from '../utils/scoring';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

puppeteer.use(StealthPlugin());

async function resolveWithAI(page: any, context: string, targetName: string): Promise<string | null> {
    if (!process.env.GEMINI_API_KEY) return null;
    
    // Corrected model name for stability
    const modelName = 'gemini-1.5-flash';
    
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // Try multiple model strings as subsets of the API are sensitive to exact names
        const modelNames = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
        let model: any;
        
        for (const name of modelNames) {
            try {
                // The SDK handles models/ prefix, but some environments behave better with different strings
                model = genAI.getGenerativeModel({ model: name });
                break;
            } catch (e) {
                continue;
            }
        }

        if (!model) return null;

        const modelWithConfig = genAI.getGenerativeModel({
            model: model.model,
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: SchemaType.OBJECT,
                    properties: {
                        websiteUrl: { type: SchemaType.STRING },
                        companyName: { type: SchemaType.STRING }
                    },
                    required: ['websiteUrl']
                }
            }
        });

        const prompt = `
        You are a web scraper assistant for TitanLeap. 
        Targeting Product Data for: "${targetName}"
        
        Given the following list of links and text from a detail page, 
        identify the ACTUAL external website URL of the product.
        
        CRITICAL RULES:
        1. EXCLUDE social media (twitter, x.com, linkedin, facebook, github, discord, youtube, instagram, reddit).
        2. EXCLUDE directory domains (microlaunch.net, producthunt.com, indiehackers.com, betalist.com, 1000.tools, alternativeto.net).
        3. EXCLUDE junk links (cloudflare, captcha, login, register, signup, cookies, privacy).
        4. Focus on buttons or links that say "Visit", "Website", "Get started", "Try", "Launch".
        5. The URL MUST be a full external website (e.g. https://product.com).
        
        PAGE DATA:
        ${context}
        
        Return in JSON format: {"websiteUrl": "https://...", "companyName": "..."}. 
        If no external website is found, return {"websiteUrl": ""}.
        `;

        const result = await model.generateContent(prompt);
        const response = JSON.parse(result.response.text());
        return response.websiteUrl || null;
    } catch (err: any) {
        console.error(`[AI Resolver Error] ${modelName}:`, err.message);
        return null;
    }
}

async function scrapeLinkedInProfile(page: any, profileUrl: string): Promise<Partial<Lead>> {
    console.log(`[LinkedIn] Attempting enrichment for: ${profileUrl}`);
    try {
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await new Promise(r => setTimeout(r, 2000));

        const data = await page.evaluate(() => {
            const getTxt = (sel: string) => document.querySelector(sel)?.textContent?.trim() || '';
            
            // Public profile selectors
            const name = getTxt('h1');
            const description = getTxt('.top-card-layout__headline');
            const employees = getTxt('.face-pile__text'); // "X associates"
            
            // Company specific
            const industry = getTxt('.top-card-layout__second-subline');
            
            return {
                companyName: name,
                description,
                teamSize: employees,
                industry
            };
        });

        console.log(`[LinkedIn] Success: Found ${data.companyName}`);
        return data;
    } catch (err: any) {
        console.warn(`[LinkedIn] Enrichment failed for ${profileUrl}: ${err.message}`);
        return {};
    }
}

async function predictEmailWithAI(domain: string, companyName: string): Promise<string | null> {
    if (!process.env.GEMINI_API_KEY) return null;
    const modelName = 'gemini-1.5-flash';
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: SchemaType.OBJECT,
                    properties: {
                        email: { type: SchemaType.STRING }
                    },
                    required: ['email']
                }
            }
        });

        const prompt = `
        Predict the most likely general contact email for ${companyName} (${domain}).
        Use standard SaaS conventions: hello@, contact@, support@, info@.
        Return JSON: {"email": "..."}
        `;

        const result = await model.generateContent(prompt);
        const response = JSON.parse(result.response.text());
        return response.email || null;
    } catch (err: any) {
        console.error(`[AI Email Prediction Error]:`, err.message);
        return null;
    }
}

export async function scrapeUniversal(url: string, limit = 5): Promise<Lead[]> {
    // URL Normalization & High-Density Redirects
    let targetUrl = url.toLowerCase().startsWith('http') ? url : `https://${url}`;
    const root = new URL(targetUrl).hostname.replace('www.', '');
    
    if (root === 'microlaunch.net' && !targetUrl.includes('/launches')) {
        targetUrl = 'https://microlaunch.net/launches';
        console.log(`[Discovery] Optimized path: ${targetUrl}`);
    } else if (root === '1000.tools' && !targetUrl.includes('/category')) {
        targetUrl = 'https://1000.tools/category/featured'; 
        console.log(`[Discovery] Optimized path: ${targetUrl}`);
    } else if (root === 'producthunt.com' && targetUrl === 'https://producthunt.com') {
        targetUrl = 'https://producthunt.com/all';
    }

    console.log(`[Discovery] Targeting: ${targetUrl} (Limit: ${limit})`);
    
    let browser;
    try {
        const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(process.cwd(), 'dist', 'puppeteer_cache');
        console.log(`[Universal Scraper] Cache Dir: ${cacheDir}`);
        
        // Explicit binary resolution for Docker/Render
        const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        const browserlessUrl = process.env.BROWSERLESS_URL;
        
        if (browserlessUrl) {
            console.log(`[Universal Scraper] Connecting to Browserless: ${browserlessUrl}`);
            browser = await puppeteer.connect({ browserWSEndpoint: browserlessUrl });
        } else {
            console.log(`[Universal Scraper] Attempting local browser launch...`);
            // On Windows, if PUPPETEER_EXECUTABLE_PATH is null, puppeteer.launch() 
            // will automatically find the installed browser.
            // On Render (Linux), it's usually provided via env var.
            browser = await puppeteer.launch({
                executablePath: executablePath || undefined,
                headless: true,
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox', 
                    '--disable-dev-shm-usage',
                    '--disable-gpu'
                ]
            });
        }
        console.log(`[Universal Scraper] Browser instance ready`);
    } catch (e: any) {
        throw new Error(`Browser launch failed: ${e.message}`);
    }

    const page = await browser.newPage();
    
    // EXPOSE BROWSER LOGS TO SERVER
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('[DOM Discovery]') || text.includes('[Extraction]')) {
            console.log(`[BROWSER] ${text}`);
        }
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    console.log(`[Universal Scraper] Navigating to source...`);
    try {
        // More aggressive navigation for background scraping
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        // HEAVY WAIT FOR CLOUDFLARE
        console.log(`[Universal Scraper] Waiting for security clearing...`);
        await new Promise(r => setTimeout(r, 12000)); 
    } catch (err: any) {
        console.warn(`[Universal Scraper] Navigation warning: ${err.message}`);
    }

    // Heavy scroll with better timing
    // Heavy scroll with dynamic load-more triggering
    await page.evaluate(async () => {
        let totalHeight = 0;
        const distance = 600;
        const maxScroll = 12000;
        
        while (totalHeight < maxScroll) {
            window.scrollBy(0, distance);
            totalHeight += distance;
            await new Promise(r => setTimeout(r, 200));

            // Trigger "Load More" buttons if they appear (common on directories)
            const buttons = Array.from(document.querySelectorAll('button, a, span'))
                .filter(el => {
                    const t = el.textContent?.toLowerCase() || '';
                    return (t.includes('load more') || t.includes('show more') || t.includes('view more')) &&
                           (el as HTMLElement).offsetParent !== null;
                });
            
            if (buttons.length > 0) {
                (buttons[0] as HTMLElement).click();
                await new Promise(r => setTimeout(r, 600));
            }

            // Early exit if we reached the actual bottom
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
                // If we hit bottom but no load more button clicked, we might really be at the end
                break;
            }
        }
    });

    console.log('[Universal Scraper] Discovery Phase: Analyzing DOM for product structures...');

    const baseDomain = new URL(url).hostname.replace('www.', '');
    const allPotentialLinks: { title: string, url: string, confidence: number }[] = [];
    let currentPage = 1;
    let maxPages = limit > 50 ? 5 : 2; 

    while (currentPage <= maxPages && allPotentialLinks.length < limit * 2.5) {
        if (currentPage > 1) {
            let nextUrl = url;
            if (url.includes('microlaunch.net')) {
                nextUrl = url.includes('?') ? `${url}&page=${currentPage}` : `${url}?page=${currentPage}`;
            } else if (url.includes('producthunt.com')) {
                // Product hunt uses infinitely scroll, we already scrolled, but if it had pagination:
                break;
            } else {
                break; 
            }
            console.log(`[Universal Scraper] Navigating to page ${currentPage}: ${nextUrl}`);
            try {
                await page.goto(nextUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await new Promise(r => setTimeout(r, 4000));
            } catch (err) { break; }
        }

        const pageLinks = await page.evaluate((baseDomain) => {
            const results: { title: string, url: string, confidence: number }[] = [];
            const seenOnPage = new Set<string>();
            const dirPatterns = ['/p/', '/product/', '/company/', '/startup/', '/app/', '/tools/', '/software/', '/apps/', '/tool/', '/projects/', '/directory/', '/launch/'];
            const blacklist = ['/stories', '/browse', '/trends', '/hall-of-fame', '/partners', '/community', '/deals', '/blog', '/news', '/podcast', '/pricing', '/premium', '/about', '/contact', '/login', '/signup', '/terms', '/privacy', '/hq', '/account', '/search', '/faq', '/help'];
            
            const anchors = Array.from(document.querySelectorAll('a'));
            for (const a of anchors) {
                const href = a.href;
                const lowerHref = href.toLowerCase();
                if (!href || !href.startsWith('http') || seenOnPage.has(href)) continue;
                if (blacklist.some(p => lowerHref.includes(p))) continue;
                
                const isInternal = href.includes(baseDomain);
                const isSocial = ['twitter.com', 'facebook.com', 'linkedin.com', 'youtube.com', 'instagram.com', 'github.com', 'discord.gg', 'x.com'].some(s => lowerHref.includes(s));
                if (isSocial) continue;

                let confidence = 0;
                // 1. Path Pattern Matching
                const isProductPath = ['/p/', '/product/', '/launch/', '/startup/', '/app/', '/tools/', '/tool/'].some(p => lowerHref.includes(p));
                if (isProductPath) confidence += 50;

                // 2. Depth Scoring
                const pathParts = new URL(href).pathname.split('/').filter(Boolean);
                if (pathParts.length >= 1 && pathParts.length <= 2) confidence += 20;

                // 3. Parental Context (Card Detect)
                const parent = a.closest('div, article, li, section, tr, [class*="item"], [class*="card"]');
                const pClass = (parent?.className || '').toLowerCase();
                const pId = (parent?.id || '').toLowerCase();
                if (['card', 'item', 'product', 'post', 'startup', 'entry', 'flex', 'grid', 'list'].some(k => pClass.includes(k) || pId.includes(k))) {
                    confidence += 40;
                }
                
                // 4. Content Bonus
                const hasImg = !!a.querySelector('img') || !!parent?.querySelector('img');
                if (hasImg) confidence += 10;
                const hasRating = (parent?.textContent || '').includes('★') || (parent?.textContent || '').match(/\d\.\d/);
                if (hasRating) confidence += 10;

                if (confidence >= 35) { // Lower threshold for higher yield
                    seenOnPage.add(href);
                    results.push({ 
                        title: (a.textContent || a.getAttribute('aria-label') || '').trim().split('\n')[0].substring(0, 60) || 'Unknown Lead', 
                        url: href, 
                        confidence 
                    });
                }
            }
            return results;
        }, baseDomain);

        allPotentialLinks.push(...pageLinks);
        console.log(`[Universal Scraper] Page ${currentPage} found ${pageLinks.length} candidates.`);
        currentPage++;
    }

    const uniquePotentialLinks = Array.from(new Map(allPotentialLinks.map(l => [l.url, l])).values())
        .sort((a, b) => b.confidence - a.confidence);

    console.log(`[Universal Scraper] Total Unique Candidates: ${uniquePotentialLinks.length}`);
    
    const uniqueDomains = new Set<string>();
    const leads: Lead[] = [];

    // Parallel Booster: Hardened for Scaling (Safe Batching)
    const chunks: any[][] = [];
    const processingLinks = uniquePotentialLinks.slice(0, limit);
    for (let i = 0; i < processingLinks.length; i += 2) { // Smaller batches (2) for stability on limited RAM
        chunks.push(processingLinks.slice(i, i + 2));
    }

    // Discovery Fallback & Sequential Extraction
    const candidateLinks = uniquePotentialLinks.slice(0, limit);
    console.log(`[Discovery] Extraction Phase: Processing ${candidateLinks.length} leads sequentially for maximum stability.`);

    for (const link of candidateLinks) {
        if (leads.length >= limit) break;
        
        try {
            console.log(`[Deep Extraction] Opening: ${link.title} (${link.url})`);
            const subPage = await browser.newPage();
            // Use a per-page timeout and navigation strategy
            try {
                await subPage.goto(link.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
                await new Promise(r => setTimeout(r, 2000));

                const extraction = await subPage.evaluate(() => {
                    const anchors = Array.from(document.querySelectorAll('a'));
                    const hostname = window.location.hostname.replace('www.', '').toLowerCase();
                    const bodyText = document.body.innerText;
                    
                    const getEmail = (text: string) => {
                        const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                        return match ? match[0] : null;
                    };

                    const isSocial = (h: string) => ['twitter.com', 'facebook.com', 'linkedin.com', 'youtube.com', 'instagram.com', 'github.com', 'discord.gg', 'x.com', 'producthunt.com', 'microlaunch.net'].some(s => h.includes(s));

                    const candidates = anchors.filter(a => {
                        const h = a.href.toLowerCase();
                        return !h.includes(hostname) && h.startsWith('http') && !isSocial(h);
                    });

                    candidates.sort((a, b) => {
                        const tA = (a.innerText || '').toLowerCase();
                        const tB = (b.innerText || '').toLowerCase();
                        const kw = ['visit', 'website', 'launch', 'demo', 'app', 'try', 'get', 'product'];
                        const aS = kw.some(k => tA.includes(k)) ? 10 : 0;
                        const bS = kw.some(k => tB.includes(k)) ? 10 : 0;
                        return bS - aS;
                    });

                    const linkedin = anchors.find(a => a.href.includes('linkedin.com/company') || a.href.includes('linkedin.com/in/'))?.href;
                    const twitter = anchors.find(a => a.href.includes('twitter.com/') || a.href.includes('x.com/'))?.href;
                    
                    return { 
                        url: candidates[0]?.href || null, 
                        linkedin, 
                        twitter, 
                        email: getEmail(bodyText), 
                        title: document.querySelector('h1')?.innerText?.trim() || null,
                        desc: document.querySelector('meta[name="description"]')?.getAttribute('content') || null
                    };
                });

                let finalWebsite = extraction.url;
                let finalName = extraction.title || link.title;
                let finalEmail = extraction.email;
                let finalLinkedin = extraction.linkedin;
                let finalTwitter = extraction.twitter;
                let finalIndustry = 'SaaS / Startup';

                // LinkedIn & AI Lane
                if (finalLinkedin) {
                    const lData = await scrapeLinkedInProfile(subPage, finalLinkedin);
                    if (lData.companyName) finalName = lData.companyName;
                    if (lData.description) extraction.desc = lData.description;
                    if (lData.industry) finalIndustry = lData.industry;
                }

                if (finalWebsite) {
                    const domain = new URL(finalWebsite).hostname.replace('www.', '');
                    if (!uniqueDomains.has(domain)) {
                        uniqueDomains.add(domain);
                        
                        let emailStatus: Lead['emailStatus'] = finalEmail ? 'extracted' : undefined;
                        if (!finalEmail) {
                            const aiPredict = await predictEmailWithAI(domain, finalName);
                            if (aiPredict) {
                                finalEmail = aiPredict;
                                emailStatus = 'predicted';
                            }
                        }

                        const lead: Lead = {
                            id: Math.random().toString(36).substr(2, 9),
                            companyName: finalName,
                            website: finalWebsite,
                            industry: finalIndustry,
                            contactEmail: finalEmail || undefined,
                            emailStatus,
                            linkedin: finalLinkedin || undefined,
                            twitter: finalTwitter || undefined,
                            description: extraction.desc || `Scraped via TitanLeap Discovery`,
                            status: 'scraped',
                            createdAt: new Date().toISOString()
                        };

                        const { score, tier } = calculateLeadScore(lead);
                        leads.push({ ...lead, score, tier });
                        console.log(`[Extraction] SUCCESS: ${finalName} | Email: ${finalEmail || 'None'}`);
                    }
                }
            } finally {
                if (subPage && !subPage.isClosed()) await subPage.close().catch(() => {});
            }
        } catch (err) {
            console.warn(`[Extraction] Fallback for ${link.title}: Deep extraction failed.`);
            // Lead Fallback: Use discovery data as the lead if extraction fails
            if (!uniqueDomains.has(link.url) && leads.length < limit) {
                let fallbackEmail;
                let fallbackStatus;
                
                // Try AI Prediction on the fallback company name
                const predicted = await predictEmailWithAI('unknown', link.title);
                if (predicted) {
                    fallbackEmail = predicted;
                    fallbackStatus = 'predicted' as const;
                }

                const fallback: Lead = {
                    id: Math.random().toString(36).substr(2, 9),
                    companyName: link.title,
                    website: link.url,
                    contactEmail: fallbackEmail,
                    emailStatus: fallbackStatus,
                    status: 'scraped',
                    createdAt: new Date().toISOString(),
                    description: `Discovered on ${new URL(targetUrl).hostname}`
                };
                const { score, tier } = calculateLeadScore(fallback);
                leads.push({ ...fallback, score, tier });
                uniqueDomains.add(link.url);
            }
        }
    }

    await browser.close();
    return leads;
}
