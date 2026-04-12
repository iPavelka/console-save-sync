/**
 * PS2 Memory Card File System (MCFS) Extractor
 * Fixed for Absolute Cluster Indexing and 528-byte pages.
 */

export interface MCFSFile {
    name: string;
    data: Buffer;
    rawEntry: Buffer; 
}

export interface MCFSFolder {
    name: string;
    files: MCFSFile[];
    rawEntry: Buffer;
    dotEntries: Buffer[];
}

export class VM2Extractor {
    private buffer: Buffer;
    private pageSize: number = 512;
    private pagesPerCluster: number = 2;
    private clusterSize: number = 1024;
    private fat: Uint32Array = new Uint32Array(0);
    private pageStride: number = 512; 

    constructor(buffer: Buffer) {
        this.buffer = buffer;
        this.pageStride = buffer.length > 8400000 ? 528 : 512;
        this.parseSuperblock();
    }

    private parseSuperblock() {
        // Offset 40 (0x28): page_len (u16)
        this.pageSize = this.readPageU16(0, 40);
        // Offset 42 (0x2A): pages_per_cluster (u16)
        this.pagesPerCluster = this.readPageU16(0, 42);
        // Offset 44 (0x2C): pages_per_block (u16)
        // this.pagesPerBlock = this.readPageU16(0, 44);

        this.clusterSize = this.pageSize * this.pagesPerCluster;
        
        const rootClust = this.readPageU32(0, 64);
        console.log(`[MCFS] Superblock: PageSize=${this.pageSize}, PpC=${this.pagesPerCluster}, RootClust=${rootClust}`);
        
        this.readFAT();
    }

    private readPageU16(pageIdx: number, offsetInPage: number): number {
        const globalOffset = pageIdx * this.pageStride + offsetInPage;
        if (globalOffset + 2 > this.buffer.length) return 0;
        return this.buffer.readUInt16LE(globalOffset);
    }

    private readPageU32(pageIdx: number, offsetInPage: number): number {
        const globalOffset = pageIdx * this.pageStride + offsetInPage;
        if (globalOffset + 4 > this.buffer.length) return 0;
        return this.buffer.readUInt32LE(globalOffset);
    }

    private readFAT() {
        // Offset 80 (0x50): ifc_list (32 entries)
        const ifcList: number[] = [];
        for (let i = 0; i < 32; i++) {
            const ifc = this.readPageU32(0, 80 + i * 4);
            if (ifc === 0xFFFFFFFF || (i > 0 && ifc === 0)) break;
            ifcList.push(ifc);
        }

        console.log(`[MCFS] IFC list: ${ifcList.join(', ')}`);

        // Reconstruct FAT table clusters
        const fatClusters: number[] = [];
        for (const ifc of ifcList) {
            const startPage = ifc * this.pagesPerCluster;
            for (let i = 0; i < this.clusterSize / 4; i++) {
                const pageIdx = startPage + Math.floor((i * 4) / this.pageSize);
                const byteOff = (i * 4) % this.pageSize;
                const fatClust = this.readPageU32(pageIdx, byteOff);
                
                if (fatClust === 0xFFFFFFFF) break;
                if (fatClust === 0 && fatClusters.length > 0) break;
                fatClusters.push(fatClust);
            }
        }

        console.log(`[MCFS] FAT Clusters detected: ${fatClusters.length}`);
        
        // Final FAT table entries
        const fatSize = fatClusters.length * (this.clusterSize / 4);
        this.fat = new Uint32Array(fatSize);
        let fatTotalIdx = 0;

        for (const clust of fatClusters) {
            const startPage = clust * this.pagesPerCluster;
            for (let i = 0; i < this.clusterSize / 4; i++) {
                if (fatTotalIdx >= this.fat.length) break;
                const pageIdx = startPage + Math.floor((i * 4) / this.pageSize);
                const byteOff = (i * 4) % this.pageSize;
                this.fat[fatTotalIdx++] = this.readPageU32(pageIdx, byteOff);
            }
        }
        
        console.log(`[MCFS] FAT Table initialized: ${this.fat.length} records.`);
    }

    private readChainData(startCluster: number, length: number): Buffer {
        const chain = [];
        let current = startCluster;

        // In MCFS: 0xFFFFFFFF is EOF, 0x00000000 is UNALLOCATED, 
        // 0x7FFFFFFF is sometimes used for system/reserved areas.
        while (current !== 0xFFFFFFFF && current !== 0x7FFFFFFF && (current & 0x80000000) === 0) {
            chain.push(current);
            if (current >= this.fat.length) {
                // If it's out of range, we stop but don't crash loop
                break;
            }
            const next = this.fat[current];
            if (next === current || next === 0) break; // Avoid infinite loops or unallocated blocks
            current = next;
            if (chain.length > 32000) break; 
        }

        const buffers = chain.map(c => {
            const startPage = c * this.pagesPerCluster;
            const clustBufs = [];
            for (let p = 0; p < this.pagesPerCluster; p++) {
                const off = (startPage + p) * this.pageStride;
                if (off + this.pageSize > this.buffer.length) break;
                clustBufs.push(this.buffer.slice(off, off + this.pageSize));
            }
            return Buffer.concat(clustBufs);
        });
        
        const allData = Buffer.concat(buffers);
        return length > 0 ? allData.slice(0, length) : allData;
    }

    public extractFolder(folderName: string): MCFSFolder | null {
        const allocOffset = this.readPageU32(0, 52);
        const rootDirCluster = this.readPageU32(0, 64);
        
        console.log(`[MCFS] Discovery: RootClust=${rootDirCluster}, AllocOff=${allocOffset}`);

        // Strict directory validation: starts with '.' AND cluster 1 starts with '..'
        // mode (offset 0) must have 0x0010 bits
        const isValidDir = (data: Buffer) => {
            if (data.length < 1024) return false;
            const entry1Mode = data.readUInt16LE(0);
            const entry1Name = data.slice(64, 66).toString('ascii');
            const entry2Name = data.slice(512 + 64, 512 + 66).toString('ascii');
            return (entry1Mode & 0x0010) && entry1Name === '.' && entry2Name === '..';
        };

        let rootData = this.readChainData(rootDirCluster, 0);

        if (!isValidDir(rootData)) {
            console.log(`[MCFS] Absolute RootClust ${rootDirCluster} invalid. Trying relative...`);
            rootData = this.readChainData(allocOffset + rootDirCluster, 0);
        }

        if (!isValidDir(rootData)) {
            console.warn(`[MCFS] Emergency scan starting...`);
            for (let c = 0; c < 8192; c++) {
                // Peek at the first cluster
                const pageBytes = this.buffer.slice(c * this.pagesPerCluster * this.pageStride, (c * this.pagesPerCluster * this.pageStride) + 512);
                if (pageBytes.length < 512) continue;
                
                if (pageBytes[64] === 46 && pageBytes[65] === 0) { // Found a '.'
                    const fullDir = this.readChainData(c, 1024);
                    if (isValidDir(fullDir)) {
                        console.log(`[MCFS] Found Root at Cluster ${c}`);
                        rootData = this.readChainData(c, 0);
                        break;
                    }
                }
            }
        }

        if (rootData.length === 0 || !isValidDir(rootData)) {
            console.error(`[MCFS] Fatal: Could not find a valid root directory.`);
            return null;
        }

        console.log(`[MCFS] Success: Root directory found (${rootData.length} bytes).`);
        
        const entrySize = 512;
        const foundNames: string[] = [];
        let folderEntryOffset = -1;
        
        for (let i = 0; i < rootData.length / entrySize; i++) {
            const offset = i * entrySize;
            const mode = rootData.readUInt16LE(offset);
            
            let name = '';
            for (let j = 0; j < 32; j++) {
                const char = rootData[offset + 64 + j];
                if (char === 0) break;
                name += String.fromCharCode(char);
            }
            
            const cleanName = name.trim();
            if (cleanName.length > 0) foundNames.push(cleanName);

            if (!(mode & 0x0010)) continue; // Directory bit

            if (cleanName.toLowerCase() === folderName.trim().toLowerCase() || 
                cleanName.startsWith(folderName.trim()) || 
                folderName.trim().startsWith(cleanName)) {
                folderEntryOffset = offset;
                break;
            }
        }

        if (folderEntryOffset === -1) {
            console.error(`[MCFS] Folder '${folderName}' not found in root. Available: ${foundNames.join(', ')}`);
            return null;
        }

        const folderStartCluster = rootData.readUInt32LE(folderEntryOffset + 8);
        const folderContent = this.readChainData(folderStartCluster, 0);

        const folder: MCFSFolder = { 
            name: folderName, 
            files: [], 
            rawEntry: rootData.slice(folderEntryOffset, folderEntryOffset + entrySize),
            dotEntries: []
        };

        for (let i = 0; i < folderContent.length / entrySize; i++) {
            const offset = i * entrySize;
            const mode = folderContent.readUInt16LE(offset);
            
            let fileName = '';
            for (let j = 0; j < 32; j++) {
                const char = folderContent[offset + 64 + j];
                if (char === 0) break;
                fileName += String.fromCharCode(char);
            }

            if (fileName === '.' || fileName === '..') {
                folder.dotEntries.push(folderContent.slice(offset, offset + entrySize));
                continue;
            }

            if (!(mode & 0x0020)) continue; // File bit

            const fileStart = folderContent.readUInt32LE(offset + 8);
            const fileSize = folderContent.readUInt32LE(offset + 4);
            const fileData = this.readChainData(fileStart, fileSize);

            folder.files.push({ 
                name: fileName, 
                data: fileData,
                rawEntry: folderContent.slice(offset, offset + entrySize)
            });
        }

        return folder;
    }
}
