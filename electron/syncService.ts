import { PS3Connection, PS3SaveInfo } from './ftp.js';
import { NextcloudConnection, NCCloudSave } from './webdav.js';
import store from './store.js';

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

    async scanDeltas(): Promise<SyncItem[]> {
        const ip = store.get('ps3Ip');
        if (!ip) throw new Error('No PS3 IP Address configured');

        await this.ftp.connect(ip);

        const profiles = await this.ftp.getProfiles();
        const activeProfile = profiles.length > 0 ? profiles[0] : '00000001';

        console.log(`Používám PS3 profil: ${activeProfile}`);

        const ps3Saves = await this.ftp.getSaves(activeProfile);
        const ncSaves = await this.nc.getSaves(activeProfile);

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
        await Promise.all(ncSaves.map(async (cloud) => {
            let trueDate = cloud.dateModified;
            
            // Re-discover original PS3 date from cloud metadata
            try {
                const metaBuf = await this.nc.downloadFileToBuffer(`/PS3_Saves/${activeProfile}/${cloud.folderName}/sync-meta.json`);
                const meta = JSON.parse(metaBuf.toString('utf-8'));
                if (meta.mtime) {
                    trueDate = new Date(meta.mtime);
                }
            } catch(e) {
                // Ignore, file doesn't exist on older uploads
            }

            const existing = deltas.get(cloud.folderName);
            if (existing && existing.ps3Date) {
                existing.ncDate = trueDate;
                
                // Compare Dates
                const diff = Math.abs(trueDate.getTime() - existing.ps3Date.getTime());
                if (diff < 1000 * 60) { // Tolerace 1 minuta
                    existing.action = 'synced';
                } else if (trueDate.getTime() > existing.ps3Date.getTime()) {
                    existing.action = 'download';
                } else {
                    existing.action = 'upload';
                }
            } else {
                let downloadedIcon = undefined;
                try {
                    // Only download icon if it's potentially needed (not on PS3)
                    const iconBuf = await this.nc.downloadFileToBuffer(`/PS3_Saves/${activeProfile}/${cloud.folderName}/ICON0.PNG`);
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

    async performSync(action: DeltaAction, profileId: string, folderName: string): Promise<void> {
        if (action === 'synced') return;

        const ip = store.get('ps3Ip');
        if (!ip) throw new Error('No PS3 IP Address configured');

        await this.ftp.connect(ip);
        
        try {
            if (action === 'upload') {
                // From PS3 to Cloud
                const ps3Dir = `/dev_hdd0/home/${profileId}/savedata/${folderName}`;
                const cloudDir = `/PS3_Saves/${profileId}/${folderName}`;

                await this.nc.createDir(cloudDir);

                const files = await this.ftp.getFileList(ps3Dir);
                let latestMtime = 0;
                for (const fileName of files) {
                    const data = await this.ftp.downloadFileToBuffer(`${ps3Dir}/${fileName}`);
                    await this.nc.uploadFileFromBuffer(`${cloudDir}/${fileName}`, data);
                }

                // Upload metadata to preserve original PS3 mtime
                const ps3Original = await this.ftp.getSaves(profileId);
                const originalSave = ps3Original.find(s => s.folderName === folderName);
                if (originalSave) {
                    const metaObj = { mtime: originalSave.dateModified.getTime() };
                    await this.nc.uploadFileFromBuffer(`${cloudDir}/sync-meta.json`, Buffer.from(JSON.stringify(metaObj)));
                }

            } else if (action === 'download') {
                // From Cloud to PS3
                const ps3Dir = `/dev_hdd0/home/${profileId}/savedata/${folderName}`;
                const cloudDir = `/PS3_Saves/${profileId}/${folderName}`;

                await this.ftp.createDir(ps3Dir);

                const files = await this.nc.getFileList(cloudDir);
                for (const fileName of files) {
                    if (fileName === 'sync-meta.json') continue;
                    const data = await this.nc.downloadFileToBuffer(`${cloudDir}/${fileName}`);
                    await this.ftp.uploadFileFromBuffer(`${ps3Dir}/${fileName}`, data);
                }

                // After download, PS3 files have "now" as date. 
                // We must update the cloud metadata to match this "now" to avoid immediate re-upload suggestion.
                const ps3Current = await this.ftp.getSaves(profileId);
                const updatedSave = ps3Current.find(s => s.folderName === folderName);
                if (updatedSave) {
                    const metaObj = { mtime: updatedSave.dateModified.getTime() };
                    await this.nc.uploadFileFromBuffer(`${cloudDir}/sync-meta.json`, Buffer.from(JSON.stringify(metaObj)));
                }
            }
        } finally {
            await this.ftp.disconnect();
        }
    }
}
