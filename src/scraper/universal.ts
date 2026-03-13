import puppeteer from 'puppeteer';
import { Lead } from '../types';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

async function resolveWithAI(page: any, context: string, targetName: string): Promise<string | null> {
    if (!process.env.GEMINI_API_KEY) return null;
    
    // Corrected model name for stability
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

export async function scrapeUniversal(url: string, limit = 5): Promise<Lead[]> {
    console.log(`[Universal Scraper] Initiating protocol for: ${url}`);
    
    let browser;
    try {
        const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(process.cwd(), 'dist', 'puppeteer_cache');
        console.log(`[Universal Scraper] Cache Dir: ${cacheDir}`);
        
        // Explicit binary resolution for Docker/Render
        const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';
        const browserlessUrl = process.env.BROWSERLESS_URL;
        
        if (browserlessUrl) {
            console.log(`[Universal Scraper] Connecting to Browserless: ${browserlessUrl}`);
            browser = await puppeteer.connect({ browserWSEndpoint: browserlessUrl });
        } else {
            console.log(`[Universal Scraper] Attempting local browser launch: ${executablePath}`);
            browser = await puppeteer.launch({
                executablePath: executablePath,
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
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await new Promise(r => setTimeout(r, 4000)); 
    } catch (err: any) {
        console.warn(`[Universal Scraper] Navigation warning: ${err.message}`);
    }

    // Heavy scroll with better timing
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 500;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= scrollHeight || totalHeight >= 8000) {
                    clearInterval(timer);
                    resolve(null);
                }
            }, 150);
        });
    });

    console.log('[Universal Scraper] Discovery Phase: Analyzing DOM for product structures...');

    const baseDomain = new URL(url).hostname.replace('www.', '');
    const potentialLinks = await page.evaluate((baseDomain) => {
        const results: { title: string, url: string, confidence: number }[] = [];
        const seenLinks = new Set<string>();

        const allAnchors = Array.from(document.querySelectorAll('a'));
        // Broaden patterns for various directories
        const dirPatterns = ['/p/', '/product/', '/company/', '/startup/', '/app/', '/tools/', '/software/', '/apps/', '/tool/', '/deals/', '/launches/', '/projects/'];
        
        for (const a of allAnchors) {
            const href = a.href;
            if (!href || !href.startsWith('http') || seenLinks.has(href)) continue;

            const urlObj = new URL(href);
            const isInternal = urlObj.hostname.includes(baseDomain);
            const text = a.innerText.trim();
            const lowerHref = href.toLowerCase();

            if (['login', 'signup', 'pricing', 'about', 'join', 'contact', 'cookies', 'terms', 'privacy', 'blog', 'news', 'podcast'].some(k => text.toLowerCase().includes(k))) continue;
            
            let confidence = 0;
            // Pattern 1: Known directory segments
            if (isInternal && dirPatterns.some(p => urlObj.pathname.includes(p))) {
                confidence += 85;
            }

            // Pattern 2: Single-level slugs with metadata-like parent
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            const parentNode = a.closest('div, article, li, section, tr, td');
            const pClass = parentNode?.className.toLowerCase() || '';
            const pId = parentNode?.id.toLowerCase() || '';
            const isCard = pClass.includes('card') || pClass.includes('item') || pClass.includes('product') || pClass.includes('post') || pId.includes('product') || pClass.includes('flex');
            const hasHeading = a.querySelector('h1, h2, h3, h4, h5, h6, strong, b') || a.parentElement?.querySelector('h3, h4, h5, h6, strong, b');

            if (isInternal && pathParts.length === 1 && (isCard || hasHeading)) {
                confidence += 75;
            }

            // Pattern 3: Visual structure
            if (isCard) {
                confidence += 15;
            }

            // Direct external links (aggregators)
            if (!isInternal) {
                const isSocial = ['twitter.com', 'facebook.com', 'linkedin.com', 'youtube.com', 'instagram.com', 'github.com', 'discord.gg', 'x.com'].some(s => lowerHref.includes(s));
                const actionText = ['visit', 'website', 'get', 'try', 'launch', 'open'].some(k => text.toLowerCase().includes(k));
                if (!isSocial && actionText) confidence += 75;
            }

            if (baseDomain.includes('microlaunch') && lowerHref.includes('/p/')) {
                confidence = Math.max(confidence, 90);
            }

            // Fallback for image-based links or cards with little text
            const finalTitle = text || a.getAttribute('aria-label') || a.querySelector('img')?.getAttribute('alt') || 'Unknown Startup';

            if (confidence >= 60 && (finalTitle.length > 1 || confidence > 80)) {
                let title = finalTitle;
                const header = parentNode?.querySelector('h1, h2, h3, h4, h5, h6, strong, b, [class*="title"], [class*="name"]');
                if (header && header.textContent?.trim() && header.textContent.trim().length > 2) {
                    title = header.textContent.trim();
                }

                seenLinks.add(href);
                results.push({
                    title: title.split('\n')[0].substring(0, 70),
                    url: href,
                    confidence
                });
            }
        }
        return results.sort((a, b) => b.confidence - a.confidence);
    }, baseDomain);

    console.log(`[Universal Scraper] Discovery Results: Found ${potentialLinks.length} total candidates at ${url}`);
    if (potentialLinks.length > 0) {
        console.log(`[Universal Scraper] Top Candidate: ${potentialLinks[0].title} (${potentialLinks[0].url})`);
    }

    console.log(`[Universal Scraper] ${potentialLinks.length} candidates found. Starting extraction...`);

    const uniqueDomains = new Set<string>();
    const leads: Lead[] = [];

    for (const link of potentialLinks) {
        if (leads.length >= limit) break;

        try {
            console.log(`[Deep Extraction] Opening: ${link.title}`);
            const subPage = await browser.newPage();
            try {
                await subPage.goto(link.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
                await new Promise(r => setTimeout(r, 2000));

                const extraction = await subPage.evaluate(() => {
                    const anchors = Array.from(document.querySelectorAll('a'));
                    const hostname = window.location.hostname.replace('www.', '').toLowerCase();
                    
                    const candidates = anchors.filter(a => {
                        const h = a.href.toLowerCase();
                        const t = (a.innerText || a.getAttribute('aria-label') || '').toLowerCase();
                        const isExt = !h.includes(hostname) && h.startsWith('http');
                        const isSocial = ['twitter.com', 'facebook.com', 'linkedin.com', 'youtube.com', 'instagram.com', 'github.com', 'discord.gg', 'x.com', 'producthunt.com', 'microlaunch.net', 'google.com', 'apple.com', 'cloudflare.com', 'captcha', '1000.tools'].some(s => h.includes(s));
                        return isExt && !isSocial;
                    });

                    candidates.sort((a, b) => {
                        const tA = (a.innerText || '').toLowerCase();
                        const tB = (b.innerText || '').toLowerCase();
                        const kw = ['visit', 'website', 'launch', 'demo', 'app', 'try', 'get', 'product'];
                        const aS = kw.some(k => tA.includes(k)) ? 10 : 0;
                        const bS = kw.some(k => tB.includes(k)) ? 10 : 0;
                        return bS - aS;
                    });

                    const h1 = document.querySelector('h1')?.innerText?.trim();
                    const linkedin = anchors.find(a => a.href.includes('linkedin.com/company'))?.href;
                    const twitter = anchors.find(a => a.href.includes('twitter.com/') || a.href.includes('x.com/'))?.href;
                    const email = document.body.innerText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0];

                    return { url: candidates[0]?.href || null, linkedin, twitter, email, title: h1 || null };
                });

                let finalWebsite = extraction.url;
                let finalName = extraction.title || link.title;

                if (!finalWebsite) {
                    const pageData = await subPage.evaluate(() => {
                        const body = document.body.innerText.slice(0, 2000);
                        const links = Array.from(document.querySelectorAll('a')).map(a => ({t: a.innerText.trim(), h: a.href})).filter(l => l.h.startsWith('http')).slice(0, 30);
                        return `Links: ${JSON.stringify(links)}\n\nText: ${body}`;
                    });
                    finalWebsite = await resolveWithAI(subPage, pageData, link.title);
                }

                if (finalWebsite) {
                    const urlObj = new URL(finalWebsite);
                    const domain = urlObj.hostname.replace('www.', '');
                    if (!uniqueDomains.has(domain)) {
                        uniqueDomains.add(domain);
                        leads.push({
                            id: Math.random().toString(36).substr(2, 9),
                            companyName: finalName,
                            website: finalWebsite,
                            industry: 'SaaS / Startup',
                            contactEmail: extraction.email || undefined,
                            linkedin: extraction.linkedin || undefined,
                            twitter: extraction.twitter || undefined,
                            description: `Scraped via TitanLeap Discovery`,
                            status: 'scraped',
                            createdAt: new Date().toISOString()
                        });
                    }
                }
            } finally {
                await subPage.close();
            }
        } catch (err) {
            console.error(`[Deep Extraction] Failed subtask:`, err);
        }
    }

    await browser.close();
    return leads;
}
