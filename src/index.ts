import 'dotenv/config';
import { scrapeMicrolaunch } from './scraper/microlaunch';
import { analyzeLead } from './analyzer/index';
import { exportToCsv } from './utils/csv';

export async function runScraper(): Promise<string | null> {
    console.log('Starting TitanLeap Lead Acquisition Protocol...');

    // 1. Scrape Leads
    console.log('Scraping leads from Microlaunch...');
    const rawLeads = await scrapeMicrolaunch();
    console.log(`Found ${rawLeads.length} leads.`);

    const enrichedLeads = [];

    // 2. Analyze & Enrich Leads
    for (const lead of rawLeads) {
        try {
            console.log(`Analyzing funnel for ${lead.companyName} (${lead.website})...`);
            const analysis = await analyzeLead(lead);

            enrichedLeads.push({
                ...lead,
                ...analysis
            });
            // Delay to avoid rate limits
            await new Promise(r => setTimeout(r, 2000));
        } catch (err) {
            console.error(`Failed to analyze lead ${lead.companyName}:`, err);
        }
    }

    // 3. Export Leads
    if (enrichedLeads.length > 0) {
        const filename = `leads_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
        await exportToCsv(enrichedLeads, filename);
        console.log(`Successfully exported ${enrichedLeads.length} leads to ${filename}`);
        return filename;
    } else {
        console.log('No leads analyzed successfully.');
        return null;
    }
}

// Automatically run if CLI
if (require.main === module) {
    runScraper().catch(console.error);
}
