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

const logDir = (dir: string, depth = 0) => {
    if (depth > 2) return;
    try {
        const entries = fs.readdirSync(dir);
        console.log(`${'  '.repeat(depth)}[DIR] ${dir}: ${entries.join(', ')}`);
        entries.forEach(e => {
            const p = path.join(dir, e);
            if (fs.statSync(p).isDirectory()) logDir(p, depth + 1);
        });
    } catch (e) {}
};

console.log('--- STARTUP FILESYSTEM SCAN ---');
logDir(process.cwd());
console.log('--- END STARTUP FILESYSTEM SCAN ---');

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
        version: 'v4.2.0-UI-BOOST',
        time: new Date().toISOString()
    });
});

app.get('/api/build-log', (req, res) => {
    const rootLog = path.join(process.cwd(), 'build.log');
    const distLog = path.join(process.cwd(), 'dist', 'build.log');
    
    if (fs.existsSync(rootLog)) {
        res.type('text/plain').send(fs.readFileSync(rootLog, 'utf8'));
    } else if (fs.existsSync(distLog)) {
        res.type('text/plain').send(fs.readFileSync(distLog, 'utf8'));
    } else {
        res.status(404).send(`Build log not found at ${rootLog} or ${distLog}`);
    }
});

app.get('/api/debug-fs', (req, res) => {
    const projectRoot = process.cwd();
    const possiblePaths = [
        { name: 'PUP_CACHE', path: path.join(projectRoot, 'node_modules', 'chrome_bin') },
        { name: 'PROJECT_ROOT', path: '/opt/render/project' },
        { name: 'DIST', path: path.join(projectRoot, 'dist') },
        { name: 'ROOT', path: projectRoot }
    ];

    try {
        const listFiles = (dir: string, depth = 0): any => {
            if (depth > 4) return '...depth limit';
            if (!fs.existsSync(dir)) return 'NOT_FOUND';
            
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            return entries.map(e => {
                const fullPath = path.join(dir, e.name);
                if (e.isDirectory()) {
                    return { name: e.name, type: 'dir', children: listFiles(fullPath, depth + 1) };
                }
                return { name: e.name, type: 'file' };
            });
        };

        const diagnostics = possiblePaths.map(p => ({
            name: p.name,
            path: p.path,
            contents: listFiles(p.path)
        }));

        // Add shell diagnostics
        try {
            const { execSync } = require('child_process');
            const chromePath = execSync('which google-chrome-stable || which google-chrome || which chrome').toString().trim();
            diagnostics.push({ name: 'SHELL_WHICH_CHROME', path: 'n/a', contents: chromePath } as any);
        } catch (e: any) {
            diagnostics.push({ name: 'SHELL_WHICH_CHROME', path: 'n/a', contents: `NOT_FOUND: ${e.message}` } as any);
        }

        res.json({
            timestamp: new Date().toISOString(),
            diagnostics
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/debug-dom', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL required');
    
    let browser;
    try {
        const puppeteer = require('puppeteer');
        const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        const browserlessUrl = process.env.BROWSERLESS_URL;
        
        if (browserlessUrl) {
            browser = await puppeteer.connect({ browserWSEndpoint: browserlessUrl });
        } else {
            browser = await puppeteer.launch({ executablePath: executablePath || undefined, headless: true, args: ['--no-sandbox'] });
        }
        
        const page = await browser.newPage();
        await page.goto(url as string, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const html = await page.evaluate(() => {
            return document.body.innerHTML.slice(0, 5000) + '...';
        });
        await browser.close();
        res.send(`<pre>${html.replace(/</g, '&lt;')}</pre>`);
    } catch (e: any) {
        if (browser) await (browser as any).close();
        res.status(500).send(e.message);
    }
});

app.use(express.static('public'));

// Endpoint to trigger scraping (Discovery)
app.post('/api/generate', async (req, res) => {
    try {
        const { url, limit = 10 } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        // Start scraping in background to avoid Render 30s timeout
        runScraper(url, limit)
            .then(count => console.log(`[Background] Discovery finished: Found ${count} leads`))
            .catch(err => console.error(`[Background] Discovery failed:`, err));

        res.json({ success: true, message: 'Discovery protocol initiated in background.' });
    } catch (error: any) {
        console.error('Scraping Initiation Error:', error);
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

// Endpoint to export all leads as a Document (Txt/Doc style)
app.get('/api/export-doc', async (req, res) => {
    try {
        const leads = await readLeads();
        const sortedLeads = leads.sort((a, b) => (b.score || 0) - (a.score || 0));

        const { generateDocContent } = require('./utils/doc');
        const content = await generateDocContent(sortedLeads);
        
        const filename = 'titanleap_leads_report.txt';
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(content);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

const portToListen = parseInt(String(PORT), 10) || 10000;

app.listen(portToListen, '0.0.0.0', () => {
    console.log(`TitanLeap Acquisition Dashboard running on port ${portToListen}`);
});
export default app;
