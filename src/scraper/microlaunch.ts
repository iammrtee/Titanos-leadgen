import puppeteer from 'puppeteer';

export interface Lead {
    id: string;
    companyName: string;
    website: string;
    description?: string;
    industry?: string;
    status: 'scraped' | 'analyzed';
    analysisDate?: string;
    createdAt?: string;

    // Contact & Socials
    founderName?: string;
    contactEmail?: string;
    linkedin?: string;
    twitter?: string;
    instagram?: string;

    // Analysis Fields (Step 9)
    Industry?: string;
    CompanyDescription?: string;
    CompanySize?: string;
    MainProduct?: string;
    MarketingPresence?: string;
    LeadScore?: string;
    ScoreJustification?: string;
    FunnelIssues?: string[];
    GrowthInsight?: string;
    OutreachMessage?: string;
}

export async function scrapeMicrolaunch(limit = 5): Promise<Lead[]> {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });

    console.log(`[Discovery] Navigating to Microlaunch...`);
    await page.goto('https://microlaunch.net/', { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for the deals/launches to load
    console.log('[Discovery] Wait for content...');
    await new Promise(r => setTimeout(r, 2000));

    // Example dummy logic: grab <a> tags that look like products. 
    // Customizing for Microlaunch layout:
    // usually there are links to product pages /products/[slug] or directly outward.
    const productLinks = await page.evaluate(() => {
        // Targeted selectors for Microlaunch product links
        // They usually follow the pattern /p/product-name
        const items = Array.from(document.querySelectorAll('a[href*="/p/"]'));
        return items.map(a => {
            const titleEl = a.querySelector('h2, h3, .font-bold, .text-lg');
            return {
                title: titleEl?.textContent?.trim() || a.textContent?.trim(),
                url: (a as HTMLAnchorElement).href
            };
        })
            .filter(l => l.title && l.title.length > 2 && l.url.includes('/p/'));
    });

    console.log(`Found ${productLinks.length} potential product links on homepage.`);

    // Unique domains
    const uniqueDomains = new Set<string>();
    const leads: Lead[] = [];

    for (const link of productLinks) {
        if (leads.length >= limit) break;

        try {
            console.log(`Opening product page: ${link.url}`);
            const productPage = await browser.newPage();
            // Set a reasonable timeout
            await productPage.goto(link.url, { waitUntil: 'networkidle2', timeout: 30000 });

            // Find the external website link
            // Usually has text like "Website", "Visit", or is a specific button
            const externalUrl = await productPage.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                // Look for links that aren't microlaunch and contain "Website" or "Visit"
                const websiteLink = links.find(a => {
                    const text = a.textContent?.toLowerCase() || '';
                    const href = a.href.toLowerCase();
                    return (text.includes('website') || text.includes('visit')) &&
                        !href.includes('microlaunch.net') &&
                        href.startsWith('http');
                });
                return websiteLink ? websiteLink.href : null;
            });

            await productPage.close();

            const finalWebsite = externalUrl || link.url;
            const urlObj = new URL(finalWebsite);

            if (uniqueDomains.has(urlObj.hostname)) continue;
            uniqueDomains.add(urlObj.hostname);

            leads.push({
                id: Math.random().toString(36).substr(2, 9),
                companyName: link.title || urlObj.hostname,
                website: finalWebsite,
                industry: 'SaaS / Startup',
                description: 'Deep-scraped from Microlaunch',
                status: 'scraped'
            });

        } catch (err) {
            console.error(`Error scraping product page ${link.url}:`, err);
        }
    }

    await browser.close();
    return leads;
}
