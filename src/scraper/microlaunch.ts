import puppeteer from 'puppeteer';

export interface Lead {
    companyName: string;
    website: string;
    founderName?: string;
    founderLinkedIn?: string;
    founderTwitter?: string;
    founderEmail?: string;
    description?: string;
    industry?: string;
}

export async function scrapeMicrolaunch(limit = 5): Promise<Lead[]> {
    const browser = await puppeteer.launch({ headless: true });
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
        return Array.from(document.querySelectorAll('a[href^="http"]'))
            .map(a => ({ title: a.textContent?.trim(), url: (a as HTMLAnchorElement).href }))
            .filter(l => l.title && l.title.length > 2 && !l.url.includes('microlaunch'));
    });

    // Unique domains
    const uniqueDomains = new Set<string>();

    for (const link of productLinks) {
        try {
            const urlObj = new URL(link.url);
            if (uniqueDomains.has(urlObj.hostname)) continue;
            uniqueDomains.add(urlObj.hostname);

            leads.push({
                companyName: link.title || urlObj.hostname,
                website: link.url,
                industry: 'SaaS / Creator Economy',
                description: 'Scraped from Microlaunch'
            });

            if (leads.length >= limit) break;
        } catch { }
    }

    await browser.close();
    return leads;
}
