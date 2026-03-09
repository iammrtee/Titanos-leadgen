import puppeteer from 'puppeteer';
import { Lead } from './microlaunch';

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
            const distance = 100;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= scrollHeight || totalHeight >= 3000) {
                    clearInterval(timer);
                    resolve(null);
                }
            }, 100);
        });
    });

    console.log('[Universal Scraper] Discovering potential product links...');

    const potentialLinks = await page.evaluate(() => {
        const results: { title: string, url: string, confidence: number }[] = [];
        const seen = new Set();

        // Strategy 1: Targeted path patterns
        const pathPatterns = ['/p/', '/product/', '/company/', '/startup/', '/app/', '/tools/'];

        // Strategy 2: Link keyword check
        const keywordPatterns = ['visit', 'website', 'try', 'get', 'demo', 'launch'];

        const anchors = Array.from(document.querySelectorAll('a'));

        for (const a of anchors) {
            const href = (a as HTMLAnchorElement).href;
            if (!href || !href.startsWith('http') || seen.has(href)) continue;

            let confidence = 0;
            const text = a.textContent?.trim() || '';
            const lowerText = text.toLowerCase();
            const lowerHref = href.toLowerCase();

            // Ignore navigation/legal/social common links
            if (lowerHref.includes('login') || lowerHref.includes('signin') ||
                lowerHref.includes('twitter.com') || lowerHref.includes('facebook.com') ||
                lowerHref.includes('privacy') || lowerHref.includes('terms')) continue;

            // Pattern Match
            if (pathPatterns.some(p => lowerHref.includes(p))) confidence += 50;
            if (keywordPatterns.some(k => lowerText.includes(k))) confidence += 30;

            // Heuristic: Titles often in H2/H3 or bold or specific card classes
            const parentCard = a.closest('div, li, section');
            const h2 = parentCard?.querySelector('h1, h2, h3, h4');
            const title = h2?.textContent?.trim() || text;

            if (title.length > 2 && confidence > 0) {
                seen.add(href);
                results.push({ title, url: href, confidence });
            }
        }

        return results.sort((a, b) => b.confidence - a.confidence);
    });

    console.log(`[Universal Scraper] Found ${potentialLinks.length} candidates.`);

    const uniqueDomains = new Set<string>();
    const leads: Lead[] = [];

    for (const link of potentialLinks) {
        if (leads.length >= limit) break;

        try {
            const urlObj = new URL(link.url);

            // If it's an internal link of a directory, try to visit it to find the real website
            const isDirectoryLink = urlObj.hostname === new URL(url).hostname;
            let finalWebsite = link.url;

            if (isDirectoryLink) {
                console.log(`[Universal Scraper] Resolving directory link: ${link.url}`);
                const subPage = await browser.newPage();
                await subPage.goto(link.url, { waitUntil: 'domcontentloaded', timeout: 20000 });

                const externalLink = await subPage.evaluate(() => {
                    const links = Array.from(document.querySelectorAll('a'));
                    const best = links.find(a => {
                        const t = a.textContent?.toLowerCase() || '';
                        const h = a.href.toLowerCase();
                        return (t.includes('website') || t.includes('visit')) &&
                            !h.includes(window.location.hostname) && h.startsWith('http');
                    });
                    return best ? best.href : null;
                });

                await subPage.close();
                if (externalLink) finalWebsite = externalLink;
            }

            const finalUrlObj = new URL(finalWebsite);
            if (uniqueDomains.has(finalUrlObj.hostname)) continue;
            uniqueDomains.add(finalUrlObj.hostname);

            leads.push({
                id: Math.random().toString(36).substr(2, 9),
                companyName: link.title || finalUrlObj.hostname,
                website: finalWebsite,
                industry: 'SaaS / Startup',
                description: `Discovered from ${url}`,
                status: 'scraped'
            });

        } catch (err) {
            console.error(`[Universal Scraper] Error resolving ${link.url}:`, err);
        }
    }

    await browser.close();
    return leads;
}
