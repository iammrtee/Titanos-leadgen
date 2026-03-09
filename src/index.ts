import { scrapeUniversal } from './scraper/universal';
import { addLeads } from './utils/db';

export async function runScraper(targetUrl: string, limit = 5): Promise<number> {
    console.log(`Starting TitanLeap Discovery Protocol on: ${targetUrl}`);

    // 1. Scrape Leads
    console.log(`Scraping leads (limit: ${limit}) from source...`);
    const rawLeads = await scrapeUniversal(targetUrl, limit);
    console.log(`Scraped ${rawLeads.length} leads.`);

    // 2. Persist to DB (Step 10: Deduplicate)
    const addedCount = await addLeads(rawLeads);
    console.log(`Added ${addedCount} new unique leads to the database.`);

    return addedCount;
}

// Automatically run if CLI
if (typeof require !== 'undefined' && require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Usage: npx tsx src/index.ts <url> [limit]');
        process.exit(1);
    }
    const url = args[0];
    const limit = args[1] ? parseInt(args[1]) : 5;
    runScraper(url, limit).catch(console.error);
}
