import { createClient, WebDAVClient, FileStat } from 'webdav';

export type NCCloudSave = {
  profileId: string;
  folderName: string;
  dateModified: Date;
  size: number;
  remotePath: string;
};

export class NextcloudConnection {
  private client: WebDAVClient | null = null;

  connect(url: string, user: string, pass: string) {
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
    await this.createDirRecursive('/PS3_Saves');
  }

  async getSaves(profileId: string): Promise<NCCloudSave[]> {
    if (!this.client) throw new Error('Not connected');
    await this.ensureBaseFolder();
    
    const profilePath = `/PS3_Saves/${profileId}`;
    await this.createDirRecursive(profilePath);

    const items = await this.client.getDirectoryContents(profilePath);
    const saveFolders = Array.isArray(items) ? items : [items];
    
    const saves: NCCloudSave[] = [];
    for (const folder of saveFolders) {
        if (folder.type !== 'directory') continue;
        saves.push({
            profileId,
            folderName: folder.basename,
            dateModified: new Date(folder.lastmod),
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

  async createDirRecursive(remotePath: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    const parts = remotePath.split('/').filter(p => p.length > 0);
    let currentPath = '';
    for (const part of parts) {
      currentPath += '/' + part;
      try {
        if (await this.client.exists(currentPath) === false) {
          await this.client.createDirectory(currentPath);
        }
      } catch (err: any) {
        // If 405, it might already exist, ignore and continue
        if (err.response && err.response.status === 405) {
          continue;
        }
        throw err;
      }
    }
  }

  async createDir(remotePath: string): Promise<void> {
    await this.createDirRecursive(remotePath);
  }

  async exists(remotePath: string): Promise<boolean> {
    if (!this.client) throw new Error('Not connected');
    return await this.client.exists(remotePath);
  }
}
