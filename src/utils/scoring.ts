import { Lead } from '../types';

export function calculateLeadScore(lead: Partial<Lead>): { score: number, tier: 'High' | 'Mid' | 'Low' } {
    let score = 0;

    // Buying Intent (40%)
    if (lead.techStack && lead.techStack.length > 0) score += 20;
    if (lead.hasPricing) score += 10;
    if (lead.teamSize && lead.teamSize !== 'Solo') score += 5;
    if (lead.hasBlog) score += 5;

    // Contact Signals (35%)
    if (lead.linkedin) score += 15;
    if (lead.twitter) score += 5;
    if (lead.contactEmail || lead.contactPage) score += 15;

    // Momentum & Validation (25%)
    if (lead.hasSocialProof) score += 10;
    if (lead.trafficEstimate && lead.trafficEstimate !== 'None') score += 10;
    if (lead.description && lead.description.length > 50) score += 5;

    let tier: 'High' | 'Mid' | 'Low' = 'Low';
    if (score >= 75) tier = 'High';
    else if (score >= 40) tier = 'Mid';

    return { score, tier };
}
