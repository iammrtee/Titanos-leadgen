import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import OpenAI from 'openai';
import { Lead } from '../scraper/microlaunch';

export interface LeadAnalysis {
    // Step 4: Enrichment
    Industry: string;
    CompanyDescription: string;
    CompanySize: 'Startup' | 'Small' | 'Growing';
    MainProduct: string;
    MarketingPresence: string;
    // Step 5: Scoring
    LeadScore: 'High Potential' | 'Medium Potential' | 'Low Potential';
    ScoreJustification: string;
    // Step 6: Weaknesses
    FunnelIssues: string[]; // 1-3 specific problems
    GrowthInsight: string;
    OutreachMessage: string;
}

const fallbackResponse: LeadAnalysis = {
    Industry: 'Unknown',
    CompanyDescription: 'Unknown',
    CompanySize: 'Startup',
    MainProduct: 'Unknown',
    MarketingPresence: 'Minimal',
    LeadScore: 'Low Potential',
    ScoreJustification: 'Insufficient data for analysis.',
    FunnelIssues: ['Could not identify funnel weaknesses'],
    GrowthInsight: 'Consider improving page structure.',
    OutreachMessage: 'Hey! Found your project and would love to do a free UI/UX teardown for you.'
};

export async function analyzeLead(lead: Lead): Promise<LeadAnalysis> {
    const systemPrompt = `
You are TitanLeap’s AI Lead Acquisition Agent.
Your job is to analyze companies that could benefit from TitanLeap’s services (funnel optimization, marketing systems, conversion, content, growth strategy).

FOLLOW THIS WORKFLOW:
STEP 4: ENRICH DATA - Analyze the company website/presence to find industry, size, and main product.
STEP 5: QUALIFY - Assign Lead Score (High/Medium/Low). High Potential examples: SaaS with weak landing pages, Ecommerce with poor conversion, Agencies with no content.
STEP 6: WEAKNESSES - Identify 1-3 specific problems (unclear CTA, weak messaging, slow load, etc.).
STEP 7: GROWTH INSIGHT - Provide a short actionable insight.
STEP 8: OUTREACH - Write a 3-5 sentence personalized message using: Observation -> Problem -> Opportunity -> Offer Free Audit -> Invite Response.

Rules:
- Professional but friendly tone.
- Avoid spam language.
- Mention company name: ${lead.companyName}.
`;

    const userPrompt = `
LEAD DATA TO ANALYZE:
Company: ${lead.companyName}
Website: ${lead.website}
Description: ${lead.description || lead.bio || 'Unknown'}
Industry: ${lead.industry || lead.niche || 'Unknown'}
Social: ${lead.username ? `@${lead.username}` : 'None'}
`;

    if (process.env.GEMINI_API_KEY) {
        console.log(`Deep analyzing ${lead.companyName} using TitanLeap Agent (Gemini)...`);
        try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({
                model: 'gemini-1.5-flash', // Flash is fast and cheap for this
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
            const text = result.response.text();
            return JSON.parse(text) as LeadAnalysis;
        } catch (error) {
            console.error('Gemini Agent Error:', error);
        }
    }

    return fallbackResponse;
}
