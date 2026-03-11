import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { runScraper } from './index';
import { analyzeLead } from './analyzer/index';
import { readLeads, updateLead } from './utils/db';
import { exportToCsv } from './utils/csv';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 10000;

// Force set Puppeteer cache for Render environment consistency
if (process.env.NODE_ENV === 'production') {
    process.env.PUPPETEER_CACHE_DIR = path.join(process.cwd(), 'puppeteer_cache');
    console.log(`[Service] Production environment detected. Set cache to: ${process.env.PUPPETEER_CACHE_DIR}`);
}

console.log(`[Startup] Environment: ${process.env.NODE_ENV}`);
console.log(`[Startup] PORT: ${PORT}`);
console.log(`[Startup] CWD: ${process.cwd()}`);

app.use(cors());
app.use(express.json());

// Health check for Render (PRIORITY)
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Diagnostic endpoint
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        version: 'v2.2.0-POSTINSTALL-FIX',
        time: new Date().toISOString(),
        port: PORT,
        env: process.env.NODE_ENV
    });
});

app.get('/api/debug-files', (req, res) => {
    const files = ['render.yaml', 'package.json'];
    const result: any = {};
    files.forEach(f => {
        const p = path.join(process.cwd(), f);
        if (fs.existsSync(p)) {
            result[f] = fs.readFileSync(p, 'utf8');
        } else {
            result[f] = 'NOT_FOUND';
        }
    });
    res.json(result);
});

app.use(express.static('public'));

// Endpoint to trigger scraping (Discovery)
app.post('/api/generate', async (req, res) => {
    try {
        const { url, limit = 5 } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        const scraperResults = await runScraper(url, limit);
        res.json({ success: true, count: scraperResults });
    } catch (error: any) {
        console.error('Scraping Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint to list individual leads (Step 1-3 results)
app.get('/api/leads', async (req, res) => {
    try {
        const leads = await readLeads();
        res.json(leads);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read leads' });
    }
});

// Endpoint to analyze a specific lead (Steps 4-8)
app.post('/api/analyze/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const leads = await readLeads();
        const lead = leads.find(l => l.id === id);

        if (!lead) return res.status(404).json({ error: 'Lead not found' });

        const analysis = await analyzeLead(lead);
        await updateLead(id, {
            ...analysis,
            status: 'analyzed',
            analysisDate: new Date().toISOString()
        });

        res.json({ success: true, analysis });
    } catch (error: any) {
        console.error('Analysis Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint to export all leads as CSV
app.get('/api/export', async (req, res) => {
    try {
        const leads = await readLeads();
        // Step 10: Sort by High Potential
        const sortedLeads = leads.sort((a, b) => {
            if (a.LeadScore === 'High Potential' && b.LeadScore !== 'High Potential') return -1;
            if (a.LeadScore !== 'High Potential' && b.LeadScore === 'High Potential') return 1;
            return 0;
        });

        const filename = 'titanleap_leads_export.csv';
        const filePath = path.join(process.cwd(), filename);
        await exportToCsv(sortedLeads, filePath);

        res.download(filePath, (err) => {
            if (err) console.error('Export Download Error:', err);
            // Optional: delete temp file after download
            // fs.unlinkSync(filePath);
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

const portToListen = parseInt(String(PORT), 10) || 10000;

app.listen(portToListen, '0.0.0.0', () => {
    console.log(`TitanLeap Acquisition Dashboard running on port ${portToListen}`);
});
export default app;
