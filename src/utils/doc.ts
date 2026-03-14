
export async function generateDocContent(leads: any[]): Promise<string> {
    let content = 'TITANLEAP ACQUISITION PROTOCOL - LEAD EXPORT\n';
    content += `Timestamp: ${new Date().toISOString()}\n`;
    content += `Total Leads: ${leads.length}\n`;
    content += '------------------------------------------\n\n';

    leads.forEach((l, i) => {
        content += `[LEAD #${i + 1}]\n`;
        content += `Company: ${l.companyName || 'Unknown'}\n`;
        content += `Website: ${l.website || 'N/A'}\n`;
        content += `Email: ${l.contactEmail || 'Not Found'} (${l.emailStatus || 'none'})\n`;
        content += `LinkedIn: ${l.linkedin || 'N/A'}\n`;
        content += `Tier: ${l.tier || l.LeadScore || 'Evaluating'}\n`;
        content += `Score: ${l.score || 0}\n`;
        content += `Description: ${l.description || 'No description available'}\n`;
        content += '------------------------------------------\n\n';
    });

    return content;
}
