import { createObjectCsvWriter } from 'csv-writer';

export async function exportToCsv(data: any[], filename: string) {
    if (!data || data.length === 0) return;

    const csvWriter = createObjectCsvWriter({
        path: filename,
        header: [
            { id: 'companyName', title: 'Company Name' },
            { id: 'website', title: 'Website' },
            { id: 'founderName', title: 'Founder Name' },
            { id: 'founderEmail', title: 'Email' },
            { id: 'founderLinkedIn', title: 'LinkedIn' },
            { id: 'founderTwitter', title: 'Twitter' },
            { id: 'founderInstagram', title: 'Instagram' },
            { id: 'industry', title: 'Industry' },
            { id: 'LeadScore', title: 'Lead Score' },
            { id: 'FunnelIssues', title: 'Funnel Issues' },
            { id: 'GrowthInsight', title: 'Growth Insight' },
            { id: 'OutreachMessage', title: 'Outreach Message' }
        ]
    });

    // Format arrays as strings
    const formattedData = data.map(row => ({
        ...row,
        FunnelIssues: Array.isArray(row.FunnelIssues) ? row.FunnelIssues.join('; ') : row.FunnelIssues
    }));

    await csvWriter.writeRecords(formattedData);
}
