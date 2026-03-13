import { createClient } from '@supabase/supabase-js';
import { Lead } from '../types';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.warn(`[Supabase] Missing credentials. Falling back to ephemeral storage.`);
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function readLeads(): Promise<Lead[]> {
    const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('createdAt', { ascending: false });

    if (error) {
        console.error('[Supabase] Read Error:', error.message);
        return [];
    }
    return data as Lead[];
}

export async function addLeads(newLeads: Lead[]): Promise<number> {
    if (newLeads.length === 0) return 0;

    const { data, error } = await supabase
        .from('leads')
        .upsert(newLeads, { onConflict: 'website' })
        .select();

    if (error) {
        console.error('[Supabase] Write Error:', error.message);
        return 0;
    }

    const addedCount = data?.length || 0;
    console.log(`[Database] Committed ${addedCount} leads to Supabase.`);
    return addedCount;
}

export async function updateLead(id: string, updates: Partial<Lead>): Promise<void> {
    const { error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', id);

    if (error) {
        console.error('[Supabase] Update Error:', error.message);
    }
}

export async function getTodaysLeadCount(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const { count, error } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .gte('createdAt', today);

    if (error) {
        console.error('[Supabase] Count Error:', error.message);
        return 0;
    }
    return count || 0;
}
