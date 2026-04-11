import { createClient, WebDAVClient, FileStat } from 'webdav';

export type NCCloudSave = {
  profileId: string;
  folderName: string;
  dateModified: Date;
  size: number; // Approximate, folder size sync in webdav can be tricky, we'll try to calculate or ignore
  remotePath: string;
};

export class NextcloudConnection {
  private client: WebDAVClient | null = null;

  connect(url: string, user: string, pass: string) {
    // Nextcloud WebDAV URL is usually <server>/remote.php/webdav/
    let ncUrl = url.trim();
    if (!ncUrl.endsWith('/remote.php/webdav/')) {
        if (!ncUrl.endsWith('/')) ncUrl += '/';
        ncUrl += 'remote.php/webdav/';
    }

    this.client = createClient(ncUrl, {
      username: user,
      password: pass
    });
  }

  async ensureBaseFolder() {
    if (!this.client) throw new Error('Not connected');
    try {
      if (await this.client.exists('/PS3_Saves') === false) {
        await this.client.createDirectory('/PS3_Saves');
      }
    } catch(err) {
       console.log('Error creating base folder', err);
       throw err;
    }
  }

  async getSaves(profileId: string): Promise<NCCloudSave[]> {
    if (!this.client) throw new Error('Not connected');
    await this.ensureBaseFolder();
    
    const profilePath = `/PS3_Saves/${profileId}`;
    if (await this.client.exists(profilePath) === false) {
      await this.client.createDirectory(profilePath);
      return [];
    }

    const items = await this.client.getDirectoryContents(profilePath);
    const saveFolders = Array.isArray(items) ? items : [items];
    
    const saves: NCCloudSave[] = [];
    
    for (const folder of saveFolders) {
        if (folder.type !== 'directory') continue;

        // Optionally, we could list contents to get total size/latest date, 
        // but WebDAV often provides lastmod for directories
        const dateModified = new Date(folder.lastmod);

        saves.push({
            profileId,
            folderName: folder.basename,
            dateModified,
            size: folder.size || 0,
            remotePath: folder.filename
        });
    }

    return saves;
  }

  async getFileList(remoteDir: string): Promise<string[]> {
    if (!this.client) throw new Error('Not connected');
    if (await this.client.exists(remoteDir) === false) return [];
    
    const items = await this.client.getDirectoryContents(remoteDir);
    const files = Array.isArray(items) ? items : [items];
    return files.filter(f => f.type === 'file').map(f => f.basename);
  }

  async downloadFileToBuffer(remotePath: string): Promise<Buffer> {
    if (!this.client) throw new Error('Not connected');
    const data = await this.client.getFileContents(remotePath, { format: 'binary' });
    return Buffer.from(data as ArrayBuffer);
  }

  async uploadFileFromBuffer(remotePath: string, data: Buffer): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    await this.client.putFileContents(remotePath, data);
  }

  async createDir(remotePath: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    if (await this.client.exists(remotePath) === false) {
      await this.client.createDirectory(remotePath);
    }
  }
}
