import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { runScraper } from './index';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));

// Endpoint to trigger scraping
app.post('/api/generate', async (req, res) => {
    try {
        const filename = await runScraper();
        if (filename) {
            res.json({ success: true, filename });
        } else {
            res.status(500).json({ success: false, error: 'Scraping produced no results.' });
        }
    } catch (error: any) {
        console.error('Scraping Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint to list generated CSVs
app.get('/api/leads', (req, res) => {
    const directoryPath = process.cwd();
    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Unable to scan directory' });
        }
        const csvFiles = files
            .filter(f => f.startsWith('leads_') && f.endsWith('.csv'))
            .map(f => {
                const stat = fs.statSync(path.join(directoryPath, f));
                return { name: f, mtime: stat.mtime };
            });
        res.json(csvFiles);
    });
});

// Endpoint to download CSV
app.get('/api/download/:filename', (req, res) => {
    const filename = req.params.filename;
    if (!filename.startsWith('leads_') || !filename.endsWith('.csv')) {
        return res.status(403).send('Forbidden');
    }
    const file = path.join(process.cwd(), filename);
    res.download(file);
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`TitanLeap Acquisition Dashboard running on http://localhost:${PORT}`);
    });
}

export default app;
