import * as ftp from 'basic-ftp';
import { Writable } from 'node:stream';
import { parseSFO } from './sfoParser.js';

export type PS3SaveInfo = {
  folderName: string;
  gameTitle: string;
  subtitle?: string;
  detail?: string;
  dateModified: Date;
  size: number;
  remotePath: string;
  profileId: string;
  iconBase64?: string;
};

export class PS3Connection {
  private client: ftp.Client;

  constructor() {
    this.client = new ftp.Client();
    this.client.ftp.verbose = false;
  }

  async connect(ip: string) {
    // PS3 FTP servers usually don't use auth, just port 21
    try {
      this.client.ftp.verbose = true; // Temporary debug
      await this.client.access({
        host: ip,
        port: 21,
        secure: false
      });
      // PS3 FTP servers (like WebMAN) advertize MLSD but often break it and return empty lists.
      // Forcing basic-ftp to fallback to standard LIST command fixes empty folders issue!
      const anyClient = this.client as any;
      if (anyClient.ftp && anyClient.ftp.features) {
          anyClient.ftp.features.delete('MLSD');
          anyClient.ftp.features.delete('MLST');
      }
    } catch (e) {
      console.error('FTP Connection Failed', e);
      throw new Error('Nelze se spojit s PS3. Zkontroluj IP adresu a běh konzole. Detaily: ' + (e as Error).message);
    }
  }

  async disconnect() {
    this.client.close();
  }

  async getProfiles(): Promise<{id: string, name: string}[]> {
    const list = await this.client.list('/dev_hdd0/home/');
    const folders = list.filter(f => f.isDirectory && f.name.match(/^[0-9]+$/)).map(f => f.name);
    
    const profiles = [];
    for (const id of folders) {
      const name = await this.getProfileName(id);
      profiles.push({ id, name });
    }
    return profiles;
  }

  async getProfileName(profileId: string): Promise<string> {
    const paths = [
      `/dev_hdd0/home/${profileId}/localusername`,
      `/dev_hdd0/home/${profileId}/username`,
      `/dev_hdd0/home/${profileId}/name`
    ];

    for (const path of paths) {
      try {
        const buffer = await this.downloadFileToBuffer(path);
        const name = buffer.toString('utf-8').trim();
        if (name) return name;
      } catch (e) {
        // ignore, try next path
      }
    }

    return `Profil ${parseInt(profileId, 10)}`; // Fallback if no name found
  }

  async getSaves(profileId: string): Promise<PS3SaveInfo[]> {
    const saveDirPath = `/dev_hdd0/home/${profileId}/savedata/`;
    let saveFolders;
    try {
      saveFolders = await this.client.list(saveDirPath);
    } catch(err) {
      // maybe no saves yet
      return [];
    }

    const saves: PS3SaveInfo[] = [];

    for (const folder of saveFolders) {
      if (folder.name === '.' || folder.name === '..') continue;
      
      const remotePath = `${saveDirPath}${folder.name}`;
        let gameTitle = folder.name;
        let totalSize = folder.size; // This is just folder size in FTP
        let latestDate = new Date(Math.max(Date.now() - 1000*60*60*24*365*10, 0)); // fallback date
        let iconBase64 = undefined;
        let subtitle = undefined;
        let detail = undefined;
  
        // Try to parse PARAM.SFO to get proper title
        try {
          const fileList = await this.client.list(remotePath);
          
          // Accumulate size and find latest modified date of files in the save
          totalSize = fileList.reduce((acc, file) => acc + file.size, 0);
          let maxTime = 0;
          fileList.forEach(f => {
             if (f.modifiedAt && f.modifiedAt.getTime() > maxTime) maxTime = f.modifiedAt.getTime();
          });
          if (maxTime > 0) latestDate = new Date(maxTime);
  
          // Fetch PARAM.SFO
          const sfoFile = fileList.find(f => f.name === 'PARAM.SFO');
          if (sfoFile) {
            const fileBuffer = await this.downloadFileToBuffer(`${remotePath}/PARAM.SFO`);
            const sfoData = parseSFO(fileBuffer);
            if (sfoData['TITLE']) {
              gameTitle = String(sfoData['TITLE']);
            }
            if (sfoData['SUB_TITLE']) {
              subtitle = String(sfoData['SUB_TITLE']);
            }
            if (sfoData['DETAIL']) {
              detail = String(sfoData['DETAIL']);
            }
          }

          // Fetch ICON0.PNG
          const iconFile = fileList.find(f => f.name === 'ICON0.PNG');
          if (iconFile) {
              const iconBuffer = await this.downloadFileToBuffer(`${remotePath}/ICON0.PNG`);
              iconBase64 = `data:image/png;base64,${iconBuffer.toString('base64')}`;
          }
        } catch (err) {
          console.error(`Failed to read details of ${remotePath}`, err);
        }
  
        saves.push({
          folderName: folder.name,
          gameTitle,
          subtitle,
          detail,
          dateModified: latestDate,
          size: totalSize,
          remotePath,
          profileId,
          iconBase64
        });
    }

    return saves;
  }

  async getVMCs(): Promise<{name: string, size: number, mtime: Date}[]> {
    const vmcPath = '/dev_hdd0/savedata/vmc/';
    try {
      const list = await this.client.list(vmcPath);
      return list
        .filter(f => !f.isDirectory && f.name.toLowerCase().endsWith('.vm2'))
        .map(f => ({
          name: f.name,
          size: f.size,
          mtime: f.modifiedAt || new Date()
        }));
    } catch (e) {
      console.error('Failed to list VMCs', e);
      return [];
    }
  }

  /**
   * Downloads only the first N bytes of a file.
   * Useful for parsing headers without downloading the whole image.
   */
  async downloadPartialBuffer(remotePath: string, bytes: number): Promise<Buffer> {
    // Note: basic-ftp doesn't have a direct "range" download, 
    // but some FTP servers support REST. For simplicity on PS3, 
    // we'll use a stream and abort after N bytes.
    const buffers: Buffer[] = [];
    let totalGot = 0;
    
    // We create a writable stream that closes after getting enough bytes
    await new Promise<void>((resolve, reject) => {
        const writable = new Writable({
            write(chunk, encoding, callback) {
                const buf = Buffer.from(chunk);
                const spaceLeft = bytes - totalGot;
                if (spaceLeft > 0) {
                    buffers.push(buf.slice(0, spaceLeft));
                    totalGot += Math.min(buf.length, spaceLeft);
                }
                if (totalGot >= bytes) {
                    // We have enough. Unfortunately basic-ftp doesn't make it easy to abort mid-stream
                    // without killing the connection. Since we are doing this for small headers, 
                    // we'll just let it finish or wait for the next call. 
                    // Actually, let's keep it simple and just download the whole small block if it's < 1MB.
                }
                callback();
            }
        });

        this.client.downloadTo(writable, remotePath).then(() => resolve()).catch(reject);
    });

    return Buffer.concat(buffers);
  }

  async getPS2Classics(profileId: string): Promise<PS3SaveInfo[]> {
    const ps2Dir = `/dev_hdd0/home/${profileId}/ps2emu2_savedata/`;
    let folders;
    try {
      folders = await this.client.list(ps2Dir);
    } catch (e) {
      return [];
    }

    const saves: PS3SaveInfo[] = [];
    for (const folder of folders) {
      if (folder.name === '.' || folder.name === '..' || !folder.isDirectory) continue;
      
      saves.push({
        folderName: folder.name,
        gameTitle: folder.name, // Will be mapped later in syncService
        dateModified: folder.modifiedAt || new Date(),
        size: folder.size,
        remotePath: `${ps2Dir}${folder.name}`,
        profileId,
        // Icons for VME are encrypted, usually we'll map them by ID
      });
    }
    return saves;
  }

  async getFileList(remoteDir: string): Promise<string[]> {
    const files = await this.client.list(remoteDir);
    return files.filter(f => !f.isDirectory).map(f => f.name);
  }

  async downloadFileToBuffer(remotePath: string): Promise<Buffer> {
    const buffers: Buffer[] = [];
    const writable = new Writable({
      write(chunk, encoding, callback) {
        buffers.push(Buffer.from(chunk));
        callback();
      }
    });
    await this.client.downloadTo(writable, remotePath);
    return Buffer.concat(buffers);
  }

  async uploadFileFromBuffer(remotePath: string, data: Buffer): Promise<void> {
    const { Readable } = await import('node:stream');
    const readable = Readable.from(data);
    await this.client.uploadFrom(readable, remotePath);
  }

  async createDir(remotePath: string): Promise<void> {
    await this.client.ensureDir(remotePath);
    await this.client.cd('/');
  }
}
