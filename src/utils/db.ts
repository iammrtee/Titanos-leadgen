import fs from 'fs/promises';
import path from 'path';
import { Lead } from '../types';

const DB_PATH = path.join(process.cwd(), 'leads.db.json');

export async function readLeads(): Promise<Lead[]> {
    try {
        const data = await fs.readFile(DB_PATH, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

export async function saveLeads(leads: Lead[]): Promise<void> {
    await fs.writeFile(DB_PATH, JSON.stringify(leads, null, 2));
}

export async function addLeads(newLeads: Lead[]): Promise<number> {
    const existingLeads = await readLeads();
    const existingWebsites = new Set(existingLeads.map(l => l.website));

    let addedCount = 0;
    const toAdd = [];

    for (const lead of newLeads) {
        if (!existingWebsites.has(lead.website)) {
            lead.createdAt = new Date().toISOString();
            toAdd.push(lead);
            addedCount++;
        }
    }

    await saveLeads([...existingLeads, ...toAdd]);
    console.log(`[Database] Committed ${toAdd.length} new leads to storage.`);
    return addedCount;
}

export async function updateLead(id: string, updates: Partial<Lead>): Promise<void> {
    const leads = await readLeads();
    const index = leads.findIndex(l => l.id === id);
    if (index !== -1) {
        leads[index] = { ...leads[index], ...updates };
        await saveLeads(leads);
    }
}

export async function getTodaysLeadCount(): Promise<number> {
    const leads = await readLeads();
    const today = new Date().toISOString().split('T')[0];
    return leads.filter(l => l.createdAt && l.createdAt.startsWith(today)).length;
}
