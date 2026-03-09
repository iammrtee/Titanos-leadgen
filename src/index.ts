import 'dotenv/config';
import { scrapeMicrolaunch } from './scraper/microlaunch';
import { addLeads } from './utils/db';

export async function runScraper(limit = 5): Promise<number> {
    console.log('Starting TitanLeap Discovery Protocol...');

    // 1. Scrape Leads
    console.log(`Scraping leads (limit: ${limit}) from Microlaunch...`);
    const rawLeads = await scrapeMicrolaunch(limit);
    console.log(`Scraped ${rawLeads.length} leads.`);

    // 2. Persist to DB (Step 10: Deduplicate)
    const addedCount = await addLeads(rawLeads);
    console.log(`Added ${addedCount} new unique leads to the database.`);

    return addedCount;
}

// Automatically run if CLI
if (typeof require !== 'undefined' && require.main === module) {
    runScraper().catch(console.error);
}
