import puppeteer from 'puppeteer';

export interface Lead {
    id: string;
    companyName: string;
    website: string;
    description?: string;
    industry?: string;
    // Step 3 Extended Fields
    username?: string;
    bio?: string;
    followerCount?: string;
    niche?: string;
    contactEmail?: string;
    // Status tracking
    status: 'scraped' | 'analyzed';
    analysisDate?: string;

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
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    await page.goto('https://microlaunch.net/', { waitUntil: 'networkidle2' });

    // Wait for the deals/launches to load
    // Microlaunch has a list of links to products.
    // As an MVP for the scraper, we'll try to find any relevant product links and read their websites.

    const leads: Lead[] = [];

    // Example dummy logic: grab <a> tags that look like products. 
    // Customizing for Microlaunch layout:
    // usually there are links to product pages /products/[slug] or directly outward.
    const productLinks = await page.evaluate(() => {
        // Targeted selectors for Microlaunch
        const items = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/products/"]'));
        return items.map(a => {
            const titleEl = a.querySelector('h2, h3, .font-bold, .text-lg');
            return {
                title: titleEl?.textContent?.trim() || a.textContent?.trim(),
                url: (a as HTMLAnchorElement).href
            };
        })
            .filter(l => l.title && l.title.length > 2 && !l.url.includes('microlaunch.net/p/') && !l.url.includes('microlaunch.net/auth'));
    });

    // Unique domains
    const uniqueDomains = new Set<string>();

    for (const link of productLinks) {
        try {
            // Attempt to resolve the direct website if the link is a microlaunch product page
            // For now, we'll store the microlaunch link as the website if direct is not found
            const urlObj = new URL(link.url);
            if (uniqueDomains.has(urlObj.hostname)) continue;
            uniqueDomains.add(urlObj.hostname);

            leads.push({
                id: Math.random().toString(36).substr(2, 9),
                companyName: link.title || urlObj.hostname,
                website: link.url,
                industry: 'SaaS / Startup',
                description: 'Scraped from Microlaunch',
                status: 'scraped'
            });

            if (leads.length >= limit) break;
        } catch { }
    }

    await browser.close();
    return leads;
}
