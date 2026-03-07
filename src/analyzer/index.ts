import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import OpenAI from 'openai';
import { Lead } from '../scraper/microlaunch';

export interface LeadAnalysis {
    LeadScore: 'High Potential' | 'Medium Potential' | 'Low Potential';
    FunnelIssues: string[];
    GrowthInsight: string;
    OutreachMessage: string;
}

const fallbackResponse: LeadAnalysis = {
    LeadScore: 'Low Potential',
    FunnelIssues: ['Could not analyze funnel'],
    GrowthInsight: 'Consider improving page structure.',
    OutreachMessage: 'Hey! Found your project and would love to do a free UI/UX teardown for you. Let me know if you are interested.'
};

export async function analyzeLead(lead: Lead): Promise<LeadAnalysis> {
    const prompt = `
You are TitanLeap’s AI Expert Lead Acquisition Agent.
Analyze the following lead and output a structured JSON response identifying funnel weaknesses, providing a growth insight, and writing a highly personalized cold outreach message offering a free funnel audit.

COMPANY DETAILS:
Name: ${lead.companyName}
Website: ${lead.website}
Description: ${lead.description || 'Unknown'}
Industry: ${lead.industry || 'Unknown'}
`;

    // 1. Try Gemini API (Free Tier preferred)
    if (process.env.GEMINI_API_KEY) {
        console.log(`Analyzing funnel for ${lead.companyName} using Gemini Pro...`);
        try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({
                model: 'gemini-2.5-pro',
                generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: SchemaType.OBJECT,
                        properties: {
                            LeadScore: {
                                type: SchemaType.STRING,
                                enum: ['High Potential', 'Medium Potential', 'Low Potential'],
                            },
                            FunnelIssues: {
                                type: SchemaType.ARRAY,
                                items: { type: SchemaType.STRING },
                            },
                            GrowthInsight: {
                                type: SchemaType.STRING,
                            },
                            OutreachMessage: {
                                type: SchemaType.STRING,
                            },
                        },
                        required: ['LeadScore', 'FunnelIssues', 'GrowthInsight', 'OutreachMessage'],
                    }
                },
            });

            const result = await model.generateContent(prompt);
            const text = result.response.text();
            return JSON.parse(text) as LeadAnalysis;
        } catch (error) {
            console.error('Gemini Error:', error);
        }
    }

    // 2. Try OpenAI API (Fallback if provided)
    if (process.env.OPENAI_API_KEY) {
        console.log(`Analyzing funnel for ${lead.companyName} using OpenAI GPT-4o...`);
        try {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const promptOpenAI = prompt + `
OUTPUT JSON FORMAT REQUIRED:
{
  "LeadScore": "High Potential" | "Medium Potential" | "Low Potential",
  "FunnelIssues": ["problem 1", "problem 2", "problem 3"],
  "GrowthInsight": "A short growth insight (1 sentence).",
  "OutreachMessage": "Personalized DM offering free audit."
}`;

            const completion = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [{ role: 'system', content: promptOpenAI }],
                response_format: { type: 'json_object' }
            });

            const resultText = completion.choices[0].message.content;
            if (resultText) {
                return JSON.parse(resultText) as LeadAnalysis;
            }
        } catch (error) {
            console.error('OpenAI Error:', error);
        }
    }

    // Local fallback / Error
    console.log(`No valid API keys found for ${lead.companyName}, returning fallback data.`);
    return fallbackResponse;
}
