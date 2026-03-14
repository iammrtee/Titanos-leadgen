import { scrapeUniversal } from './scraper/universal';
import { addLeads, getTodaysLeadCount } from './utils/db';

const DAILY_LIMIT = 500;

export async function runScraper(targetUrl: string, limit = 5): Promise<number> {
    console.log(`\n--- [TITANLEAP DISCOVERY PROTOCOL START] ---`);
    console.log(`Target: ${targetUrl} | Limit: ${limit}`);

    // Check Daily Quota
    const currentCount = await getTodaysLeadCount();
    if (currentCount >= DAILY_LIMIT) {
        console.warn(`[Quota] Daily limit reached (${currentCount}/${DAILY_LIMIT}). Aborting discovery.`);
        throw new Error(`Daily lead limit reached (${DAILY_LIMIT}). Try again tomorrow.`);
    }
    
    console.log(`[Quota] Daily progress: ${currentCount}/${DAILY_LIMIT} leads.`);

    // 1. Scrape Leads
    const rawLeads = await scrapeUniversal(targetUrl, limit);
    console.log(`[Discovery] Extraction phase complete. Scraped ${rawLeads.length} leads.`);

    // 2. Persist to DB (Step 10: Deduplicate)
    const addedCount = await addLeads(rawLeads);
    console.log(`[Database] Added ${addedCount} new unique leads to the system.`);
    console.log(`--- [TITANLEAP DISCOVERY PROTOCOL END] ---\n`);

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
