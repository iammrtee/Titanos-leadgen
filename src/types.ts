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
