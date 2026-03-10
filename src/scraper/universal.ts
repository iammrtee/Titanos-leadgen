import puppeteer from 'puppeteer';
import { Lead } from './microlaunch';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import 'dotenv/config';

async function resolveWithAI(page: any, context: string): Promise<string | null> {
    if (!process.env.GEMINI_API_KEY) return null;
    
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: SchemaType.OBJECT,
                    properties: {
                        websiteUrl: { type: SchemaType.STRING }
                    },
                    required: ['websiteUrl']
                }
            }
        });

        const prompt = `
        You are a web scraper assistant. Given the following list of links and text from a product directory page, 
        identify the ACTUAL external website URL of the product. 
        
        CRITICAL RULES:
        1. EXCLUDE social media (twitter, linkedin, facebook, github, discord, youtube, instagram, reddit).
        2. EXCLUDE the directory's own domain or hostname.
        3. EXCLUDE junk links (cloudflare, captcha, login, register, signup).
        
        PAGE CONTEXT:
        ${context}
        
        Return the URL in JSON format: {"websiteUrl": "..."}. If the external website is not found, return {"websiteUrl": ""}.
        `;

        const result = await model.generateContent(prompt);
        const response = JSON.parse(result.response.text());
        return response.websiteUrl || null;
    } catch (err) {
        console.error('[AI Resolver Error]', err);
        return null;
    }
}

export async function scrapeUniversal(url: string, limit = 5): Promise<Lead[]> {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 1600 });

    console.log(`[Universal Scraper] Navigating to ${url}...`);
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (err) {
        console.warn(`[Universal Scraper] Network idle wait failed, proceeding anyway: ${err}`);
    }

    // Scroll to load lazy content
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 200;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= scrollHeight || totalHeight >= 4000) {
                    clearInterval(timer);
                    resolve(null);
                }
            }, 100);
        });
    });

    console.log('[Universal Scraper] Discovering potential product links...');

    const baseDomain = new URL(url).hostname;
    const potentialLinks = await page.evaluate((baseDomain) => {
        const results: { title: string, url: string, confidence: number, niche?: string }[] = [];
        const seenLinks = new Set();
        const seenCards = new Set();

        const cardSelectors = [
            'div[class*="card"]', 'div[class*="item"]', 'li', 'article', 'section', 'div[class*="row"]',
            // Microlaunch specific
            '.bg-card', '[class*="ProductCard"]',
            // Product Hunt specific
            '[data-test="post-item"]', 'div[class*="styles_item"]'
        ];
        const pathPatterns = ['/p/', '/product/', '/company/', '/startup/', '/app/', '/tools/'];
        const nameSelectors = 'h1, h2, h3, h4, [class*="title"], [class*="name"], [class*="font-bold"], b, strong';
        const genericKeywords = ['visit website', 'website', 'visit', 'get it', 'demo', 'view', 'check it out', 'more about', 'learn more'];

        // 1. Identify "Cards" - containers that likely hold a single startup
        const allCards = Array.from(document.querySelectorAll(cardSelectors.join(',')))
            .filter(card => {
                const text = card.textContent?.toLowerCase() || '';
                const isKnownCard = card.matches('.bg-card, [data-test="post-item"], [class*="ProductCard"]');
                const isGeneric = ['nav', 'header', 'footer', 'sidebar', 'menu'].some(tag => card.closest(tag)) || card.closest('header');
                const isAnnouncement = text.includes('the launch platform') || text.includes('submit your startup');
                return !isGeneric && !isAnnouncement && (text.length > 20 || isKnownCard) && ['visit', 'website', 'startup', 'product', '/', 'vote'].some((k: string) => text.includes(k));
            });

        for (const card of allCards) {
            // Find the best link in this card
            const anchors = Array.from(card.querySelectorAll('a'));
            let bestLink: HTMLAnchorElement | null = null;
            let maxConfidence = 0;

            for (const a of anchors) {
                const href = a.href;
                if (!href || !href.startsWith('http')) continue;

                const lowerHref = href.toLowerCase();
                const urlObj = new URL(href);
                const isDirectory = urlObj.hostname === baseDomain;

                let confidence = 0;
                if (pathPatterns.some(p => lowerHref.includes(p))) confidence += 50;
                if (isDirectory) confidence += 20;
                if (!isDirectory && !['twitter', 'linkedin', 'facebook', 'github', 'youtube', 'instagram', 'discord'].some(s => lowerHref.includes(s))) confidence += 60;

                if (confidence > maxConfidence) {
                    maxConfidence = confidence;
                    bestLink = a;
                }
            }

            if (bestLink && maxConfidence >= 40 && !seenLinks.has(bestLink.href)) {
                // Find the best name in this card
                const heading = card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="name"], [class*="font-bold"], b, strong');
                let title = heading?.textContent?.trim() || '';

                if (!title || genericKeywords.some((k: string) => title.toLowerCase().includes(k))) {
                    // Fallback: look for any text that isn't generic
                    const allTextElements = Array.from(card.querySelectorAll('div, span, p, a'));
                    for (const el of allTextElements) {
                        const t = el.textContent?.trim() || '';
                        if (t.length > 2 && t.length < 50 && !genericKeywords.some((k: string) => t.toLowerCase().includes(k))) {
                            title = t;
                            break;
                        }
                    }
                }

                if (title && title.length > 1) {
                    seenLinks.add(bestLink.href);
                    const nicheTags = Array.from(card.querySelectorAll('.tag, .category, .badge, [class*="badge"], [class*="tag"]'))
                        .map(el => el.textContent?.trim()).filter(t => t && t.length > 1 && t.length < 25).join(', ');

                    results.push({
                        title,
                        url: bestLink.href,
                        confidence: maxConfidence,
                        niche: nicheTags
                    });
                }
            }
        }

        // 2. Fallback for sites with no clear card structure (just list of links)
        if (results.length < 3) {
            const allAnchors = Array.from(document.querySelectorAll('a'));
            for (const a of allAnchors) {
                const href = a.href;
                if (!href || !href.startsWith('http') || seenLinks.has(href)) continue;

                // ... basic anchor logic here if needed ...
            }
        }

        return results.sort((a, b) => b.confidence - a.confidence);
    }, baseDomain);


    console.log(`[Universal Scraper] Found ${potentialLinks.length} candidates.`);

    const uniqueDomains = new Set<string>();
    const leads: Lead[] = [];

    for (const link of potentialLinks) {
        if (leads.length >= limit) break;

        try {
            const urlObj = new URL(link.url);
            const isDirectoryLink = urlObj.hostname === new URL(url).hostname;
            let finalWebsite = link.url;
            let finalName = link.title;

            if (isDirectoryLink) {
                console.log(`[Universal Scraper] Searching for direct website on: ${link.url}`);
                const subPage = await browser.newPage();
                try {
                    await subPage.goto(link.url, { waitUntil: 'load', timeout: 30000 });
                    await new Promise(r => setTimeout(r, 2000));

                    const extraction = await subPage.evaluate(() => {
                        const anchors = Array.from(document.querySelectorAll('a'));
                        
                        // 1. Find Website URL
                        const external = anchors.find(a => {
                            const t = a.textContent?.toLowerCase() || '';
                            const h = a.href.toLowerCase();
                            const isExternal = !h.includes(window.location.hostname) && h.startsWith('http');
                            const hasKeyword = ['website', 'visit', 'try', 'demo', 'launch', 'app', 'go to'].some(k => t.includes(k));
                            return isExternal && hasKeyword;
                        });

                        const betterExternal = external || anchors.find(a => {
                            const h = a.href.toLowerCase();
                            const host = window.location.hostname.replace('www.', '').toLowerCase();
                            const isSocial = ['twitter', 'facebook', 'linkedin', 'youtube', 'instagram', 'github', 'discord', 'reddit'].some(s => h.includes(s));
                            const isJunk = ['cloudflare', 'captcha', 'bot-check', 'forbidden', 'access-denied'].some(j => h.includes(j));
                            return h.startsWith('http') && !h.includes(host) && !isSocial && !isJunk;
                        });

                        // 2. Find Socials
                        const linkedin = anchors.find(a => a.href.includes('linkedin.com/company') || a.href.includes('linkedin.com/in'))?.href;
                        const twitter = anchors.find(a => a.href.includes('twitter.com/') || a.href.includes('x.com/'))?.href;
                        const instagram = anchors.find(a => a.href.includes('instagram.com/'))?.href;

                        // 3. Find Email (Heuristic)
                        const emailLink = anchors.find(a => a.href.startsWith('mailto:'))?.href?.replace('mailto:', '');
                        const bodyText = document.body.innerText;
                        const emailMatch = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                        const email = emailLink || (emailMatch ? emailMatch[0] : null);

                        // 4. Find Founder/Name
                        const h1 = document.querySelector('h1')?.textContent?.trim();

                        return {
                            url: betterExternal ? betterExternal.href : null,
                            name: h1 || null,
                            linkedin,
                            twitter,
                            instagram,
                            email
                        };
                    });

                    if (extraction.url) {
                        const isJunk = ['cloudflare', 'captcha', 'bot-check', 'forbidden', 'access-denied'].some(j => extraction.url?.toLowerCase().includes(j));
                        if (isJunk) extraction.url = null;
                    }

                    if (!extraction.url) {
                        console.log(`[Universal Scraper] Heuristic failed for ${link.url}, attempting AI resolution...`);
                        const pageData = await subPage.evaluate(() => {
                            const links = Array.from(document.querySelectorAll('a')).map(a => ({ 
                                text: a.textContent?.trim(), 
                                href: a.href 
                            })).filter(l => {
                                const h = l.href.toLowerCase();
                                const host = window.location.hostname.replace('www.', '').toLowerCase();
                                const isSocial = ['twitter.com', 'facebook.com', 'linkedin.com', 'youtube.com', 'instagram.com', 'github.com', 'discord.gg', 'x.com'].some(s => h.includes(s));
                                return h.startsWith('http') && !h.includes(host) && !isSocial;
                            });
                            return `Links: ${JSON.stringify(links.slice(0, 15))}\n\nText: ${document.body.innerText.slice(0, 1000)}`;
                        });
                        const aiUrl = await resolveWithAI(subPage, pageData);
                        if (aiUrl) extraction.url = aiUrl;
                    }

                    if (extraction.url) finalWebsite = extraction.url;
                    if (extraction.name && (finalName.toLowerCase().includes('visit') || finalName.length < 3)) {
                        finalName = extraction.name;
                    }

                    // Map extra fields
                    (link as any).linkedin = extraction.linkedin;
                    (link as any).twitter = extraction.twitter;
                    (link as any).instagram = extraction.instagram;
                    (link as any).email = extraction.email;

                } catch (err) {
                    console.warn(`[Universal Scraper] Subpage error: ${link.url}. ${err}`);
                } finally {
                    await subPage.close();
                }
            }

            // Cleanup and Deduplicate... (rest of the loop)
            // [I need to make sure I push these extra fields into the lead object]

            // Cleanup and Deduplicate logic
            let isDuplicate = false;
            try {
                const finalUrlObj = new URL(finalWebsite);
                const finalHostname = finalUrlObj.hostname;
                const baseHostname = new URL(url).hostname;

                if (finalHostname !== baseHostname) {
                    // External link: deduplicate by hostname to avoid multiple pages from same product
                    if (uniqueDomains.has(finalHostname)) isDuplicate = true;
                    else uniqueDomains.add(finalHostname);
                } else {
                    // Directory link: deduplicate by the full URL
                    if (uniqueDomains.has(finalWebsite)) isDuplicate = true;
                    else uniqueDomains.add(finalWebsite);
                }
            } catch (e) {
                isDuplicate = true;
            }

            if (isDuplicate) continue;

            leads.push({
                id: Math.random().toString(36).substr(2, 9),
                companyName: finalName || link.title,
                website: finalWebsite,
                contactEmail: (link as any).email,
                linkedin: (link as any).linkedin,
                twitter: (link as any).twitter,
                instagram: (link as any).instagram,
                industry: link.niche || 'SaaS / Startup',
                description: `Discovered from ${url}`,
                status: 'scraped'
            });

        } catch (err) {
            console.error(`[Universal Scraper] Error processing lead candidate ${link.url}:`, err);
        }
    }

    await browser.close();
    return leads;
}
