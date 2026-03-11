import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import puppeteer from 'puppeteer';
import { Lead } from '../scraper/microlaunch';

export interface LeadAnalysis {
    Industry: string;
    CompanyDescription: string;
    CompanySize: string;
    MainProduct: string;
    MarketingPresence: string;
    LeadScore: string;
    ScoreJustification: string;
    FunnelIssues: string[];
    GrowthInsight: string;
    OutreachMessage: string;
}

const fallbackResponse: LeadAnalysis = {
    Industry: 'B2B Software',
    CompanyDescription: 'Potential startup in discovery phase.',
    CompanySize: 'Startup / Small',
    MainProduct: 'Website / Software',
    MarketingPresence: 'Identified online visibility.',
    LeadScore: 'Medium Potential',
    ScoreJustification: 'Automatic evaluation based on directory listing.',
    FunnelIssues: ['Potential landing page optimization needed', 'Messaging could be clearer'],
    GrowthInsight: 'Focus on high-converting CTAs.',
    OutreachMessage: 'Hey! I noticed your project and love the concept. I did a quick audit of your marketing funnel and found a few low-hanging fruits that could boost your conversion by 20-30%. Would you be open to a free TitanLeap funnel audit?'
};

async function getWebsiteContext(url: string): Promise<string> {
    if (!url.startsWith('http')) return 'No website available.';

    let browser;
    try {
        console.log(`[Enrichment] Attempting browser launch for analysis...`);
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        console.log(`[Enrichment] Browser launched: ${browser.process()?.pid}`);
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Quick visit to homepage to get text context
        console.log(`[Enrichment] Fetching context from ${url}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Extract plain text and metadata
        const context = await page.evaluate(() => {
            const bodyText = document.body.innerText.split('\n').map(s => s.trim()).filter(s => s.length > 20).slice(0, 50).join('\n');
            const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
            const title = document.title;
            return `Title: ${title}\nDescription: ${metaDesc}\n\nContent Snippet:\n${bodyText}`;
        });

        return context;
    } catch (err) {
        console.warn(`[Enrichment] Could not fetch website context: ${err}`);
        return 'Website content unreachable.';
    } finally {
        if (browser) await browser.close();
    }
}

export async function analyzeLead(lead: Lead): Promise<LeadAnalysis> {
    // Stage 4: Real-world enrichment by visiting the site
    const webContext = await getWebsiteContext(lead.website);

    const systemPrompt = `
SYSTEM:
You are TitanLeap’s AI Lead Acquisition Agent.
Your job is to automatically analyze companies that could benefit from TitanLeap’s services.

TitanLeap specializes in:
• funnel optimization
• marketing systems
• conversion optimization
• content systems
• growth strategy

FOLLOW THESE EXACT STEPS FOR THE OUTPUT:

STEP 4 — ENRICH LEAD DATA: Use the provided context to identify Industry, Description, Size, Product, Marketing presence.
STEP 5 — ANALYZE LEAD QUALIFICATION: Assign Lead Score (High/Medium/Low Potential). 
High potential examples: SaaS startups with weak landing pages, Ecommerce with poor conversion, Agencies with no content, Businesses with unclear positioning.
STEP 6 — IDENTIFY FUNNEL OR MARKETING WEAKNESS: Identify 1-3 specific problems (unclear CTA, weak messaging, slow load, etc.).
STEP 7 — GENERATE TITANLEAP GROWTH INSIGHT: Concise actionable suggestion.
STEP 8 — GENERATE PERSONALIZED OUTREACH MESSAGE: 3-5 sentences. Observation -> Problem -> Opportunity -> Offer Free Audit -> Invite Response.

Always produce clean structured JSON output.
`;

    const userPrompt = `
LEAD TO ANALYZE:
Company Name: ${lead.companyName}
Website URL: ${lead.website}
Directory Bio: ${lead.description || 'Unknown'}

WEBSITE CONTENT SNIPPET:
${webContext}
`;

    if (process.env.GEMINI_API_KEY) {
        console.log(`[Analyzing] ${lead.companyName} using 10-Step Protocol...`);
        try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({
                model: 'gemini-2.5-flash',
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: SchemaType.OBJECT,
                        properties: {
                            Industry: { type: SchemaType.STRING },
                            CompanyDescription: { type: SchemaType.STRING },
                            CompanySize: { type: SchemaType.STRING },
                            MainProduct: { type: SchemaType.STRING },
                            MarketingPresence: { type: SchemaType.STRING },
                            LeadScore: { type: SchemaType.STRING },
                            ScoreJustification: { type: SchemaType.STRING },
                            FunnelIssues: {
                                type: SchemaType.ARRAY,
                                items: { type: SchemaType.STRING }
                            },
                            GrowthInsight: { type: SchemaType.STRING },
                            OutreachMessage: { type: SchemaType.STRING }
                        },
                        required: [
                            'Industry', 'CompanyDescription', 'CompanySize', 'MainProduct',
                            'MarketingPresence', 'LeadScore', 'ScoreJustification',
                            'FunnelIssues', 'GrowthInsight', 'OutreachMessage'
                        ],
                    }
                },
            });

            const result = await model.generateContent([systemPrompt, userPrompt]);
            return JSON.parse(result.response.text()) as LeadAnalysis;
        } catch (error) {
            console.error('[Gemini Error]', error);
        }
    }

    return fallbackResponse;
}
