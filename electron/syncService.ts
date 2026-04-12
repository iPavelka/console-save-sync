import { PS3Connection, PS3SaveInfo } from './ftp.js';
import { NextcloudConnection, NCCloudSave } from './webdav.js';
import store from './store.js';
import { parseVMC } from './vm2Parser.js';
import { identifyPS2Game } from './ps2Db.js';
import { VM2Extractor } from './vm2Extractor.js';
import { PSVGenerator } from './psvGenerator.js';

export type DeltaAction = 'upload' | 'download' | 'synced';

export type SyncItem = {
    folderName: string;
    gameTitle: string | null;
    subtitle?: string;
    detail?: string;
    action: DeltaAction;
    ps3Date: Date | null;
    ncDate: Date | null;
    size?: number;
    profileId: string;
    iconBase64?: string;
};

export type PS2VMCInfo = {
    fileName: string;
    size: number;
    mtime: Date;
    games: {serial: string, title: string, icon: string}[];
    action: DeltaAction;
    type: 'vmc' | 'classic';
    profileId?: string;
};

export class SyncService {
    ftp = new PS3Connection();
    nc = new NextcloudConnection();

    async init() {
        const url = store.get('ncUrl');
        const user = store.get('ncUser');
        const pass = store.get('ncPass');
        if (url && user && pass) {
            this.nc.connect(url, user, pass);
        }
    }

    async getAvailableProfiles(): Promise<{id: string, name: string}[]> {
        const ip = store.get('ps3Ip');
        if (!ip) throw new Error('No PS3 IP Address configured');
        await this.ftp.connect(ip);
        const profiles = await this.ftp.getProfiles();
        await this.ftp.disconnect();
        return profiles;
    }

    private getCloudPersona(profileId: string): string {
        const persona = store.get('cloudPersona') as string;
        return persona || profileId;
    }

    async scanDeltas(): Promise<SyncItem[]> {
        const ip = store.get('ps3Ip');
        if (!ip) throw new Error('No PS3 IP Address configured');
        await this.ftp.connect(ip);
        const profiles = await this.ftp.getProfiles();
        const storedProfileId = store.get('ps3ProfileId') as string;
        let activeProfile = storedProfileId || (profiles[0]?.id) || '00000001';
        const cloudPersona = this.getCloudPersona(activeProfile);
        const ps3Saves = await this.ftp.getSaves(activeProfile);
        const ncSaves = await this.nc.getSaves(cloudPersona);
        await this.ftp.disconnect();

        const deltas: Map<string, SyncItem> = new Map();
        for (const local of ps3Saves) {
            deltas.set(local.folderName, {
                folderName: local.folderName,
                gameTitle: local.gameTitle,
                subtitle: local.subtitle,
                detail: local.detail,
                action: 'upload', 
                ps3Date: local.dateModified,
                ncDate: null,
                size: local.size,
                profileId: activeProfile,
                iconBase64: local.iconBase64
            });
        }
        await Promise.all(ncSaves.map(async (cloud: any) => {
            let trueDate = cloud.dateModified;
            try {
                const metaBuf = await this.nc.downloadFileToBuffer(`/PS3_Saves/${cloudPersona}/${cloud.folderName}/sync-meta.json`);
                const meta = JSON.parse(metaBuf.toString('utf-8'));
                if (meta.mtime) trueDate = new Date(meta.mtime);
                cloud.gameTitle = meta.gameTitle || cloud.gameTitle;
                cloud.subtitle = meta.subtitle;
                cloud.detail = meta.detail;
            } catch(e) { }
            const existing = deltas.get(cloud.folderName);
            if (existing && existing.ps3Date) {
                existing.ncDate = trueDate;
                const diff = Math.abs(trueDate.getTime() - existing.ps3Date.getTime());
                if (diff < 1000 * 60) existing.action = 'synced';
                else if (trueDate.getTime() > existing.ps3Date.getTime()) existing.action = 'download';
                else existing.action = 'upload';
            } else {
                let downloadedIcon = undefined;
                try {
                    const iconBuf = await this.nc.downloadFileToBuffer(`/PS3_Saves/${cloudPersona}/${cloud.folderName}/ICON0.PNG`);
                    downloadedIcon = `data:image/png;base64,${iconBuf.toString('base64')}`;
                } catch (e) {}
                deltas.set(cloud.folderName, {
                    folderName: cloud.folderName,
                    gameTitle: cloud.gameTitle || 'Neznámá hra (v Cloudu)',
                    subtitle: cloud.subtitle,
                    detail: cloud.detail,
                    action: 'download',
                    ps3Date: null,
                    ncDate: trueDate,
                    size: cloud.size,
                    profileId: activeProfile,
                    iconBase64: downloadedIcon
                });
            }
        }));
        return Array.from(deltas.values());
    }

    async getPS2Inventory(): Promise<PS2VMCInfo[]> {
        const ip = store.get('ps3Ip');
        if (!ip) throw new Error('No PS3 IP Address configured');
        await this.ftp.connect(ip);
        const persona = store.get('cloudPersona') as string || 'Unknown';
        const profileId = store.get('ps3ProfileId') as string || '00000001';
        const inventory: PS2VMCInfo[] = [];

        try {
            const vmcFiles = await this.ftp.getVMCs();
            for (const file of vmcFiles) {
                const header = await this.ftp.downloadPartialBuffer(`/dev_hdd0/savedata/vmc/${file.name}`, 1024 * 1024);
                const rawEntries = parseVMC(header);
                const games = rawEntries.map(e => {
                    const info = identifyPS2Game(e.name);
                    return { serial: e.name, title: info.title, icon: info.icon };
                });
                // Check cloud for this VMC
                let action: DeltaAction = 'upload';
                try {
                    const cloudPath = `/PS2_VMC/${persona}/${file.name}`;
                    if (await this.nc.exists(cloudPath)) {
                        let ncDate = file.mtime; // Fallback
                        try {
                           const metaBuf = await this.nc.downloadFileToBuffer(`/PS2_VMC/${persona}/${file.name}.meta.json`);
                           const meta = JSON.parse(metaBuf.toString('utf-8'));
                           if (meta.mtime) ncDate = new Date(meta.mtime);
                        } catch (e) {}

                        const diff = Math.abs(ncDate.getTime() - file.mtime.getTime());
                        if (diff < 1000 * 60) action = 'synced';
                        else if (ncDate.getTime() > file.mtime.getTime()) action = 'download';
                    }
                } catch (e) {}

                inventory.push({
                    fileName: file.name,
                    size: file.size,
                    mtime: file.mtime,
                    games,
                    action,
                    type: 'vmc'
                });
            }
        } catch (e) {
            console.error('VMC Scan failed', e);
        }
        await this.ftp.disconnect();
        return inventory;
    }

    async performSync(action: DeltaAction, profileId: string, folderName: string): Promise<void> {
        if (action === 'synced') return;
        const ip = store.get('ps3Ip');
        if (!ip) throw new Error('No PS3 IP Address configured');
        await this.ftp.connect(ip);
        try {
            const cloudPersona = this.getCloudPersona(profileId);
            if (action === 'upload') {
                const ps3Dir = `/dev_hdd0/home/${profileId}/savedata/${folderName}`;
                const cloudDir = `/PS3_Saves/${cloudPersona}/${folderName}`;
                await this.nc.createDir(cloudDir);
                const files = await this.ftp.getFileList(ps3Dir);
                let latestMtime = 0;
                for (const fileName of files) {
                    const data = await this.ftp.downloadFileToBuffer(`${ps3Dir}/${fileName}`);
                    await this.nc.uploadFileFromBuffer(`${cloudDir}/${fileName}`, data);
                    // Get mtime (we could use FTP stat for each, but we know it's recent)
                }
                // Fetch the latest mtime from FTP to be precise
                const ps3Saves = await this.ftp.getSaves(profileId);
                const currentSave = ps3Saves.find(s => s.folderName === folderName);
                if (currentSave) {
                    const meta = { 
                        mtime: currentSave.dateModified.getTime(),
                        gameTitle: currentSave.gameTitle,
                        subtitle: currentSave.subtitle,
                        detail: currentSave.detail
                    };
                    await this.nc.uploadFileFromBuffer(`${cloudDir}/sync-meta.json`, Buffer.from(JSON.stringify(meta)));
                }
            } else if (action === 'download') {
                const ps3Dir = `/dev_hdd0/home/${profileId}/savedata/${folderName}`;
                const cloudDir = `/PS3_Saves/${cloudPersona}/${folderName}`;
                await this.ftp.createDir(ps3Dir);
                const files = await this.nc.getFileList(cloudDir);
                for (const fileName of files) {
                    const data = await this.nc.downloadFileToBuffer(`${cloudDir}/${fileName}`);
                    await this.ftp.uploadFileFromBuffer(`${ps3Dir}/${fileName}`, data);
                }
            }
        } finally {
            await this.ftp.disconnect();
        }
    }

    async performVMCSync(action: DeltaAction, fileName: string): Promise<void> {
        const ip = store.get('ps3Ip');
        if (!ip) throw new Error('No PS3 IP Address configured');
        const persona = store.get('cloudPersona') as string || 'Unknown';
        await this.ftp.connect(ip);
        try {
            if (action === 'upload') {
                const data = await this.ftp.downloadFileToBuffer(`/dev_hdd0/savedata/vmc/${fileName}`);
                await this.nc.createDir(`/PS2_VMC/${persona}`);
                await this.nc.uploadFileFromBuffer(`/PS2_VMC/${persona}/${fileName}`, data);

                // Meta
                const vmcFiles = await this.ftp.getVMCs();
                const current = vmcFiles.find(f => f.name === fileName);
                if (current) {
                    const meta = { mtime: current.mtime.getTime() };
                    await this.nc.uploadFileFromBuffer(`/PS2_VMC/${persona}/${fileName}.meta.json`, Buffer.from(JSON.stringify(meta)));
                }
            } else if (action === 'download') {
                const data = await this.nc.downloadFileToBuffer(`/PS2_VMC/${persona}/${fileName}`);
                await this.ftp.uploadFileFromBuffer(`/dev_hdd0/savedata/vmc/${fileName}`, data);
            }
        } finally {
            await this.ftp.disconnect();
        }
    }

    async decomposeVMCGameToPSV(vmcFileName: string, gameSerial: string, folderName: string): Promise<void> {
        const ip = store.get('ps3Ip');
        if (!ip) throw new Error('No PS3 IP Address configured');
        const persona = store.get('cloudPersona') as string || 'Unknown';
        console.log(`[PSV Export] Starting export of ${gameSerial} from ${vmcFileName} (Persona: ${persona})`);
        
        await this.ftp.connect(ip);
        try {
            console.log(`[PSV Export] Downloading VMC: ${vmcFileName}...`);
            const vmcBuffer = await this.ftp.downloadFileToBuffer(`/dev_hdd0/savedata/vmc/${vmcFileName}`);
            
            console.log(`[PSV Export] Extracting folder: ${folderName}...`);
            const extractor = new VM2Extractor(vmcBuffer);
            const folder = extractor.extractFolder(folderName);
            if (!folder) {
                console.error(`[PSV Export] Folder ${folderName} not found on VMC.`);
                throw new Error(`Hra ${folderName} nebyla na kartě nalezena.`);
            }

            console.log(`[PSV Export] Extracted ${folder.files.length} files. Generating PSV...`);
            const psvBuffer = PSVGenerator.generate(folder, gameSerial);

            const cloudPath = `/PS2_Saves_PSV/${persona}/${gameSerial}.PSV`;
            console.log(`[PSV Export] Uploading to cloud: ${cloudPath}...`);
            await this.nc.createDirRecursive(`/PS2_Saves_PSV/${persona}`);
            await this.nc.uploadFileFromBuffer(cloudPath, psvBuffer);
            console.log(`[PSV Export] SUCCESS! Finished uploading ${gameSerial}.PSV`);
        } catch (err: any) {
            console.error(`[PSV Export] FAILED:`, err);
            throw err;
        } finally {
            await this.ftp.disconnect();
        }
    }
}
