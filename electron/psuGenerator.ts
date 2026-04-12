/**
 * PS2 .PSU (EMS Save Format) Generator
 * Packs MCFS file data and metadata back into a .psu container.
 */

import { MCFSFolder } from './vm2Extractor.js';

export class PSUGenerator {
    /**
     * Generates a .psu buffer from an MCFSFolder.
     * A PSU file is a sequence of 512-byte headers followed by file data.
     */
    static generate(folder: MCFSFolder): Buffer {
        const buffers: Buffer[] = [];

        // 1. Root Folder Entry
        buffers.push(this.padEntry(folder.rawEntry));

        // 2. "." and ".." entries
        for (const entry of folder.dotEntries) {
            buffers.push(this.padEntry(entry));
        }

        // 3. Files
        for (const file of folder.files) {
            // Header (512 bytes)
            buffers.push(this.padEntry(file.rawEntry));
            
            // Data
            buffers.push(file.data);

            // Padding to 1024-byte boundary (standard for PSU/EMS)
            const paddingNeeded = (1024 - (file.data.length % 1024)) % 1024;
            if (paddingNeeded > 0) {
                buffers.push(Buffer.alloc(paddingNeeded, 0x00));
            }
        }

        return Buffer.concat(buffers);
    }

    private static padEntry(entry: Buffer): Buffer {
        if (entry.length >= 512) return entry.slice(0, 512);
        const padded = Buffer.alloc(512, 0);
        entry.copy(padded);
        return padded;
    }
}
