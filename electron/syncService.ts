import { PS3Connection, PS3SaveInfo } from './ftp.js';
import { NextcloudConnection, NCCloudSave } from './webdav.js';
import store from './store.js';
import { parseVMC } from './vm2Parser.js';
import { identifyPS2Game } from './ps2Db.js';

export type DeltaAction = 'upload' | 'download' | 'synced';

export type SyncItem = {
    folderName: string;
    gameTitle: string | null;
    action: DeltaAction;
    ps3Date: Date | null;
    ncDate: Date | null;
    profileId: string;
    iconBase64?: string;
};

export type PS2VMCInfo = {
    fileName: string;
    size: number;
    mtime: Date;
    games: {serial: string, title: string, icon: string}[];
    action: DeltaAction;
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

        // Get profiles and find the active one
        const profiles = await this.ftp.getProfiles();
        const storedProfileId = store.get('ps3ProfileId') as string;
        
        let activeProfile = storedProfileId;
        if (!activeProfile && profiles.length > 0) {
            activeProfile = profiles[0].id;
        } else if (!activeProfile) {
            activeProfile = '00000001';
        }

        const cloudPersona = this.getCloudPersona(activeProfile);
        console.log(`Používám PS3 profil: ${activeProfile}, Cloud Persona: ${cloudPersona}`);

        const ps3Saves = await this.ftp.getSaves(activeProfile);
        const ncSaves = await this.nc.getSaves(cloudPersona);

        await this.ftp.disconnect();

        const deltas: Map<string, SyncItem> = new Map();

        // 1. Process PS3 saves
        for (const local of ps3Saves) {
            deltas.set(local.folderName, {
                folderName: local.folderName,
                gameTitle: local.gameTitle,
                action: 'upload', 
                ps3Date: local.dateModified,
                ncDate: null,
                profileId: activeProfile,
                iconBase64: local.iconBase64
            });
        }

        // 2. Process Nextcloud saves and compare
        await Promise.all(ncSaves.map(async (cloud: any) => {
            let trueDate = cloud.dateModified;
            
            // Re-discover original PS3 date from cloud metadata
            try {
                const metaBuf = await this.nc.downloadFileToBuffer(`/PS3_Saves/${cloudPersona}/${cloud.folderName}/sync-meta.json`);
                const meta = JSON.parse(metaBuf.toString('utf-8'));
                if (meta.mtime) {
                    trueDate = new Date(meta.mtime);
                }
            } catch(e) { /* Ignore */ }

            const existing = deltas.get(cloud.folderName);
            if (existing && existing.ps3Date) {
                existing.ncDate = trueDate;
                
                const diff = Math.abs(trueDate.getTime() - existing.ps3Date.getTime());
                if (diff < 1000 * 60) {
                    existing.action = 'synced';
                } else if (trueDate.getTime() > existing.ps3Date.getTime()) {
                    existing.action = 'download';
                } else {
                    existing.action = 'upload';
                }
            } else {
                let downloadedIcon = undefined;
                try {
                    const iconBuf = await this.nc.downloadFileToBuffer(`/PS3_Saves/${cloudPersona}/${cloud.folderName}/ICON0.PNG`);
                    downloadedIcon = `data:image/png;base64,${iconBuf.toString('base64')}`;
                } catch (e) {}

                deltas.set(cloud.folderName, {
                    folderName: cloud.folderName,
                    gameTitle: 'Neznámá hra (v Cloudu)',
                    action: 'download',
                    ps3Date: null,
                    ncDate: trueDate,
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
        const vmcFiles = await this.ftp.getVMCs();
        const persona = store.get('cloudPersona') as string || 'Unknown';

        const inventory: PS2VMCInfo[] = [];

        for (const file of vmcFiles) {
            try {
                // Pick first 512KB to parse root dir
                const header = await this.ftp.downloadPartialBuffer(`/dev_hdd0/savedata/vmc/${file.name}`, 512 * 1024);
                const rawEntries = parseVMC(header);
                
                const games = rawEntries
                    .filter(e => e.isDir && e.name.match(/^[A-Z]{3,4}-?[0-9]{5}/))
                    .map(e => {
                        const info = identifyPS2Game(e.name);
                        return { serial: e.name, title: info.title, icon: info.icon };
                    });

                let action: DeltaAction = 'upload';
                try {
                    const cloudFiles = await this.nc.getFileList(`/PS2_VMC/${persona}`);
                    if (cloudFiles.includes(file.name)) {
                        action = 'synced';
                    }
                } catch (e) { }

                inventory.push({
                    fileName: file.name,
                    size: file.size,
                    mtime: file.mtime,
                    games,
                    action
                });
            } catch (err) {
                console.error(`Chyba při čtení VMC ${file.name}:`, err);
            }
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
                for (const fileName of files) {
                    const data = await this.ftp.downloadFileToBuffer(`${ps3Dir}/${fileName}`);
                    await this.nc.uploadFileFromBuffer(`${cloudDir}/${fileName}`, data);
                }
                const ps3Original = await this.ftp.getSaves(profileId);
                const originalSave = ps3Original.find((s: any) => s.folderName === folderName);
                if (originalSave) {
                    const metaObj = { mtime: originalSave.dateModified.getTime() };
                    await this.nc.uploadFileFromBuffer(`${cloudDir}/sync-meta.json`, Buffer.from(JSON.stringify(metaObj)));
                }
            } else if (action === 'download') {
                const ps3Dir = `/dev_hdd0/home/${profileId}/savedata/${folderName}`;
                const cloudDir = `/PS3_Saves/${cloudPersona}/${folderName}`;
                await this.ftp.createDir(ps3Dir);
                const files = await this.nc.getFileList(cloudDir);
                for (const fileName of files) {
                    if (fileName === 'sync-meta.json') continue;
                    const data = await this.nc.downloadFileToBuffer(`${cloudDir}/${fileName}`);
                    await this.ftp.uploadFileFromBuffer(`${ps3Dir}/${fileName}`, data);
                }
                const ps3Current = await this.ftp.getSaves(profileId);
                const updatedSave = ps3Current.find((s: any) => s.folderName === folderName);
                if (updatedSave) {
                    const metaObj = { mtime: updatedSave.dateModified.getTime() };
                    await this.nc.uploadFileFromBuffer(`${cloudDir}/sync-meta.json`, Buffer.from(JSON.stringify(metaObj)));
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
            } else if (action === 'download') {
                const data = await this.nc.downloadFileToBuffer(`/PS2_VMC/${persona}/${fileName}`);
                await this.ftp.uploadFileFromBuffer(`/dev_hdd0/savedata/vmc/${fileName}`, data);
            }
        } finally {
            await this.ftp.disconnect();
        }
    }
}
