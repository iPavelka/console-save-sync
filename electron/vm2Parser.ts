/**
 * Lightweight PS2 Virtual Memory Card (.VM2) Parser
 * Specifically designed to list game folders in the root directory.
 */

export interface VMCEntry {
    name: string;
    isDir: boolean;
    size: number;
    mtime: Date;
}

export function parseVMC(buffer: Buffer): VMCEntry[] {
    // Basic check for Magic
    const magic = buffer.toString('ascii', 0, 28).trim();
    if (magic !== 'Sony PS2 Memory Card Format') {
        throw new Error('Not a valid Sony PS2 Memory Card image');
    }

    const pageSize = buffer.readUInt16LE(40);
    const pagesPerCluster = buffer.readUInt16LE(42);
    const clusterSize = pageSize * pagesPerCluster;
    const rootDirCluster = buffer.readUInt32LE(44);
    const allocOffset = buffer.readUInt32LE(52); // Cluster where alloc data starts

    // The root directory starts at rootDirCluster
    // Each directory entry is 512 bytes (usually 1 per cluster or page depending on formatting)
    // For a basic list, we look at the clusters starting from rootDirCluster
    // Note: A real parser follows the FAT chain. This is a simplified "Best Effort" scanner.
    
    const entries: VMCEntry[] = [];
    const rootPos = (allocOffset + rootDirCluster) * clusterSize;

    // Scan the first 128 entries in the root directory
    // Each entry is 128 bytes (4 entries per 512 byte block)
    for (let i = 0; i < 64; i++) {
        const entryOffset = rootPos + (i * 128);
        if (entryOffset + 128 > buffer.length) break;

        const mode = buffer.readUInt16LE(entryOffset);
        // 0x8427 is a common file, 0x8411 is a common dir (bits of MCFS)
        // Bit 4 is directory
        const isDir = (mode & 0x0010) !== 0;
        const size = buffer.readUInt32LE(entryOffset + 4);
        
        // Name is 32 bytes at offset 64
        let name = '';
        for (let j = 0; j < 32; j++) {
            const char = buffer[entryOffset + 64 + j];
            if (char === 0) break;
            name += String.fromCharCode(char);
        }

        if (name === '.' || name === '..' || !name) continue;

        // Date is at offset 8 (approx)
        // PS2 time format is specific, but let's just get a rough date or use now
        const mtime = new Date(); 

        entries.push({ name, isDir, size, mtime });
    }

    return entries;
}
