/**
 * PSV (PlayStation Save) Container Generator
 * Refined for data alignment and standard header structure.
 */

import { MCFSFolder } from './vm2Extractor.js';

export class PSVGenerator {
    /**
     * Creates a .PSV file buffer from an extracted MCFS folder.
     */
    public static generate(folder: MCFSFolder, serial: string): Buffer {
        // 1. Build the Directory Block (Save Directory entries)
        // Entries are 128 bytes each.
        const entriesBuffer = Buffer.alloc(folder.files.length * 128);
        const dataBuffers: Buffer[] = [];

        let currentDataOffsetInClusters = 0;
        
        folder.files.forEach((file, idx) => {
            const entryOff = idx * 128;
            
            // Mode: 0x8410 for Folder, 0x8420 for File. PSV uses raw dir entry byte-for-byte.
            // But we'll use a standard file mode 0x20.
            entriesBuffer.writeUInt16LE(0x0020, entryOff); 
            entriesBuffer.writeUInt32LE(file.data.length, entryOff + 4);
            entriesBuffer.writeUInt32LE(currentDataOffsetInClusters, entryOff + 8);
            
            // Name (offset 64)
            entriesBuffer.write(file.name, entryOff + 64, 'ascii');

            // Add file data
            dataBuffers.push(file.data);

            // Padding to align next file to 1024-byte boundary (1 PS2 "Cluster")
            const paddingSize = (1024 - (file.data.length % 1024)) % 1024;
            if (paddingSize > 0) {
                dataBuffers.push(Buffer.alloc(paddingSize, 0));
            }
            
            currentDataOffsetInClusters += Math.ceil(file.data.length / 1024);
        });

        const totalDataSize = Buffer.concat(dataBuffers).length;

        // 2. Build Header (132 bytes / 0x84)
        const header = Buffer.alloc(0x84);
        
        // Magic: 00 56 53 50 ("VSP")
        header.set([0x00, 0x56, 0x53, 0x50], 0);

        // Filesize at offset 0x04
        header.writeUInt32LE(0x84 + entriesBuffer.length + totalDataSize, 0x04);

        // Signature area (0x08 - 0x2F). 
        // We'll use a fixed dummy signature that is sometimes accepted or can be resigned later.
        const dummySig = Buffer.from('44554d4d595349474e41545552453132333435363738393041424344454647', 'hex');
        dummySig.copy(header, 0x08);

        // Title ID (Serial) at 0x44 (64 bytes max)
        header.write(serial, 0x44, 'ascii');
        
        // Identifier (Internal Folder Name) at 0x5C (40 bytes max)
        header.write(folder.name, 0x5C, 'ascii');

        // Note: For PS2, the type is usually indicated at offset 0x30?
        // Let's ensure bit 0x02 is set for PS2.
        header[0x30] = 0x02;

        return Buffer.concat([header, entriesBuffer, ...dataBuffers]);
    }
}
