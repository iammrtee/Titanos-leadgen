import { createObjectCsvWriter } from 'csv-writer';

export async function exportToCsv(data: any[], filename: string) {
    if (!data || data.length === 0) return;

    const csvWriter = createObjectCsvWriter({
        path: filename,
        header: [
            { id: 'companyName', title: 'Company Name' },
            { id: 'website', title: 'Website' },
            { id: 'contactEmail', title: 'Email' },
            { id: 'Industry', title: 'Industry' },
            { id: 'CompanyDescription', title: 'Description' },
            { id: 'CompanySize', title: 'Size' },
            { id: 'MainProduct', title: 'Product/Service' },
            { id: 'LeadScore', title: 'Score' },
            { id: 'ScoreJustification', title: 'Justification' },
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
