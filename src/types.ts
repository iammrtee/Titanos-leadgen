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
    founderNames?: string[];
    contactEmail?: string;
    emailStatus?: 'extracted' | 'predicted' | 'form-only';
    contactPage?: string;
    linkedin?: string;
    twitter?: string;
    instagram?: string;

    // Intent & Signals
    techStack?: string[];
    teamSize?: string;
    hasPricing?: boolean;
    hasBlog?: boolean;
    hasSocialProof?: boolean;
    
    // Metadata & Scoring
    launchDate?: string;
    domainAge?: string;
    trafficEstimate?: string;
    lastUpdated?: string;
    indexedPages?: number;
    score?: number;
    tier?: 'High' | 'Mid' | 'Low';
    
    // Legacy Analysis Fields
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
