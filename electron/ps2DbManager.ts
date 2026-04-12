import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const DB_URL = 'https://github.com/niemasd/GameDB-PS2/releases/latest/download/PS2.titles.json';

class PS2DbManager {
    private titles: Record<string, string> = {};
    private dbPath: string;

    constructor() {
        this.dbPath = path.join(app.getPath('userData'), 'ps2_titles.json');
    }

    async init() {
        if (Object.keys(this.titles).length > 0) return;

        // 1. Try to load from disk
        if (fs.existsSync(this.dbPath)) {
            try {
                const data = fs.readFileSync(this.dbPath, 'utf8');
                if (data.trim().length > 0) {
                    this.titles = JSON.parse(data);
                    console.log(`[PS2 DB] Loaded ${Object.keys(this.titles).length} titles from cache.`);
                    
                    const stats = fs.statSync(this.dbPath);
                    const ageDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
                    if (ageDays > 30) {
                        console.log('[PS2 DB] Cache is old, updating in background...');
                        this.downloadDb().catch(e => console.error('[PS2 DB] Background download failed', e));
                    }
                    return;
                }
            } catch (e) {
                console.error('[PS2 DB] Failed to parse local cache, deleting...', e);
                try { fs.unlinkSync(this.dbPath); } catch {}
            }
        }

        // 2. Download if not found or corrupted
        try {
            await this.downloadDb();
        } catch (e) {
            console.error('[PS2 DB] Initial download failed. App will continue with limited DB.', e);
        }
    }

    private async downloadDb(): Promise<void> {
        console.log(`[PS2 DB] Downloading database from ${DB_URL}...`);
        try {
            const response = await fetch(DB_URL);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const body = await response.text();
            if (!body || body.trim().length === 0) throw new Error('Empty response from server');

            try {
                this.titles = JSON.parse(body);
                fs.writeFileSync(this.dbPath, body);
                console.log(`[PS2 DB] Downloaded and cached ${Object.keys(this.titles).length} titles.`);
            } catch (parseError) {
                console.error('[PS2 DB] Downloaded content is not valid JSON:', body.substring(0, 100));
                throw new Error('Invalid JSON received from server');
            }
        } catch (e) {
            console.error('[PS2 DB] Download failed:', e);
            throw e;
        }
    }

    public getTitle(serial: string): string | null {
        // PS2.titles.json usually expects format like SLUS-21194 or SLUS_211.94
        // We will try a few variations
        const clean = serial.toUpperCase().replace(/_/g, '-').replace(/\./g, '');
        
        // Direct match
        if (this.titles[clean]) return this.titles[clean];
        
        // Try without hyphen
        const noHyphen = clean.replace(/-/g, '');
        if (this.titles[noHyphen]) return this.titles[noHyphen];

        // Try with hyphen after first 4 chars (Standard)
        if (clean.length >= 9) {
            const standard = clean.substring(0, 4) + '-' + clean.substring(4);
            if (this.titles[standard]) return this.titles[standard];
        }

        return null;
    }
}

export const ps2DbManager = new PS2DbManager();
