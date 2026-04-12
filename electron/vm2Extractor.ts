/**
 * PS2 Memory Card File System (MCFS) Extractor
 * Fixed for 528-byte pages (ECC/Spare data) commonly found in .VM2.
 */

export interface MCFSFile {
    name: string;
    data: Buffer;
}

export interface MCFSFolder {
    name: string;
    files: MCFSFile[];
}

export class VM2Extractor {
    private buffer: Buffer;
    private pageSize: number = 0;
    private pagesPerCluster: number = 0;
    private clusterSize: number = 0;
    private allocOffset: number = 0;
    private fat: Uint32Array = new Uint32Array(0);
    private pageStride: number = 512; // 512 for raw, 528 for ECC

    constructor(buffer: Buffer) {
        this.buffer = buffer;
        this.pageStride = buffer.length > 8400000 ? 528 : 512;
        this.parseSuperblock();
    }

    private parseSuperblock() {
        // Dump first 128 bytes for analysis
        console.log(`[MCFS] Dump Page 0: ${this.buffer.slice(0, 128).toString('hex')}`);

        // Superblock is at Page 0
        this.pageSize = this.readPageU16(0, 40);
        this.pagesPerCluster = this.readPageU16(0, 42);
        this.clusterSize = this.pageSize * this.pagesPerCluster;
        this.allocOffset = this.readPageU32(0, 52); // Number of reservation pages
        
        console.log(`[MCFS] Debug: Stride=${this.pageStride}, PageSize=${this.pageSize}, ClustSize=${this.clusterSize}, RootClust=${this.readPageU32(0, 64)}`);
        
        this.readFAT();
    }

    private readPageU16(pageIdx: number, offsetInPage: number): number {
        const globalOffset = pageIdx * this.pageStride + offsetInPage;
        return this.buffer.readUInt16LE(globalOffset);
    }

    private readPageU32(pageIdx: number, offsetInPage: number): number {
        const globalOffset = pageIdx * this.pageStride + offsetInPage;
        return this.buffer.readUInt32LE(globalOffset);
    }

    private readFAT() {
        const ifcList: number[] = [];
        for (let i = 0; i < 32; i++) {
            const ifc = this.readPageU32(0, 80 + i * 4);
            // In the user's dump, empty entries are 0. Standard is 0xFFFFFFFF.
            if (ifc === 0 || ifc === 0xFFFFFFFF) break;
            ifcList.push(ifc);
        }

        console.log(`[MCFS] IFC list: ${ifcList.join(', ')}`);

        const fatClusters: number[] = [];
        for (const ifc of ifcList) {
            const startPage = this.allocOffset + ifc * this.pagesPerCluster;
            for (let i = 0; i < this.clusterSize / 4; i++) {
                const pageOffset = Math.floor((i * 4) / this.pageSize);
                const byteOffsetInPage = (i * 4) % this.pageSize;
                const fatClust = this.readPageU32(startPage + pageOffset, byteOffsetInPage);
                
                if (fatClust === 0xFFFFFFFF) break;
                // Basic sanity check
                if (fatClust > 100000) continue; 
                fatClusters.push(fatClust);
            }
        }

        console.log(`[MCFS] Nalezeno ${fatClusters.length} FAT clusterů.`);
        const fatSize = fatClusters.length * (this.clusterSize / 4);
        this.fat = new Uint32Array(fatSize);
        let fatIdx = 0;
        for (const clust of fatClusters) {
            const startPage = this.allocOffset + clust * this.pagesPerCluster;
            for (let i = 0; i < this.clusterSize / 4; i++) {
                if (fatIdx >= this.fat.length) break;
                const pageOffset = Math.floor((i * 4) / this.pageSize);
                const byteOffsetInPage = (i * 4) % this.pageSize;
                this.fat[fatIdx++] = this.readPageU32(startPage + pageOffset, byteOffsetInPage);
            }
        }
        console.log(`[MCFS] FAT tabulka inicializována: ${this.fat.length} záznamů.`);
    }

    private readChainData(startCluster: number, length: number): Buffer {
        const chain = [];
        let current = startCluster;
        while (current !== 0xFFFFFFFF && (current & 0x80000000) === 0) {
            chain.push(current);
            if (current >= this.fat.length) {
                console.warn(`[MCFS] Cluster ${current} je mimo rozsah FAT (${this.fat.length}). Zastavuji čtení chainu.`);
                break;
            }
            const next = this.fat[current];
            if (next === current) break; // Infinite loop protection
            current = next;
            if (chain.length > 32000) break;
        }

        const buffers = chain.map(c => {
            const startPage = this.allocOffset + c * this.pagesPerCluster;
            const clustBufs = [];
            for (let p = 0; p < this.pagesPerCluster; p++) {
                const off = (startPage + p) * this.pageStride;
                if (off + this.pageSize > this.buffer.length) break;
                clustBufs.push(this.buffer.slice(off, off + this.pageSize));
            }
            return Buffer.concat(clustBufs);
        });
        
        let allData = Buffer.concat(buffers);
        return length > 0 ? allData.slice(0, length) : allData;
    }

    public extractFolder(folderName: string): MCFSFolder | null {
        const rootDirCluster = this.readPageU32(0, 64);
        const rootData = this.readChainData(rootDirCluster, 0);

        if (rootData.length > 0) {
            console.log(`[MCFS] Root data načtena (${rootData.length} bajtů). Prvních 16b: ${rootData.slice(0, 16).toString('hex')}`);
        } else {
            console.error(`[MCFS] CHYBA: Kořenový adresář (cluster ${rootDirCluster}) je prázdný!`);
        }

        const foundNames: string[] = [];
        let folderEntryOffset = -1;
        for (let i = 0; i < rootData.length / 128; i++) {
            const offset = i * 128;
            let name = '';
            for (let j = 0; j < 32; j++) {
                const char = rootData[offset + 64 + j];
                if (char === 0) break;
                name += String.fromCharCode(char);
            }
            
            const mode = rootData.readUInt16LE(offset);
            if (!(mode & 0x0010)) continue; // Not a directory 

            const cleanName = name.trim();
            if (cleanName.length > 0 && cleanName !== '.' && cleanName !== '..') {
                foundNames.push(cleanName);
            }
            
            if (cleanName.toLowerCase() === folderName.trim().toLowerCase() || 
                cleanName.startsWith(folderName.trim()) || 
                folderName.trim().startsWith(cleanName)) {
                folderEntryOffset = offset;
                break;
            }
        }

        if (folderEntryOffset === -1) {
            console.log(`[MCFS] Folder '${folderName}' nenalezen. Dostupné složky: ${foundNames.join(', ')}`);
            return null;
        }

        const startCluster = rootData.readUInt32LE(folderEntryOffset + 8);
        const length = rootData.readUInt32LE(folderEntryOffset + 4);
        const folderContent = this.readChainData(startCluster, 0);

        const folder: MCFSFolder = { name: folderName, files: [] };

        for (let i = 0; i < folderContent.length / 128; i++) {
            const offset = i * 128;
            const mode = folderContent.readUInt16LE(offset);
            if (!(mode & 0x0020)) continue; // FILE

            let fileName = '';
            for (let j = 0; j < 32; j++) {
                const char = folderContent[offset + 64 + j];
                if (char === 0) break;
                fileName += String.fromCharCode(char);
            }

            if (fileName === '.' || fileName === '..') continue;

            const fileStart = folderContent.readUInt32LE(offset + 8);
            const fileSize = folderContent.readUInt32LE(offset + 4);
            const fileData = this.readChainData(fileStart, fileSize);

            folder.files.push({ name: fileName, data: fileData });
        }

        return folder;
    }
}
