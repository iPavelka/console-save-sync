/**
 * Robust PS2 Virtual Memory Card (.VM2) Parser
 * Specifically optimized for finding game folders (BASLUS-xxxxx etc).
 */

export interface VMCEntry {
    name: string;
    isDir: boolean;
    size: number;
    mtime: Date;
}

export function parseVMC(buffer: Buffer): VMCEntry[] {
    // 1. Validate Magic
    const magic = buffer.toString('ascii', 0, 28).trim();
    if (!magic.includes('Sony PS2 Memory Card Format')) {
        console.error('Bájte na začátku karty:', buffer.slice(0, 32).toString('hex'));
        throw new Error('Nejedná se o platný formát PS2 Virtual Memory Card.');
    }

    const entries: VMCEntry[] = [];
    const foundNames = new Set<string>();

    /**
     * Heuristic Scan: PS2 saves follow a strict naming convention.
     * They almost always start with 4 uppercase letters, a hyphen (or underscore), 
     * and 5 numbers, e.g., BASLUS-21441, SCUS-97101, etc.
     */
    const regex = /[A-Z]{3,4}-?[0-9]{5}[A-Z0-9]*/g;
    
    // We scan the first 2MB of the card. Root directories and FAT are usually at the beginning.
    const scanLimit = Math.min(buffer.length, 2 * 1024 * 1024);
    
    // Scan in chunks to avoid regex issues on huge strings, 
    // but ensure overlaps to not miss markers on boundaries.
    const chunkSize = 1024 * 64;
    for (let offset = 0; offset < scanLimit; offset += chunkSize - 32) {
        const end = Math.min(offset + chunkSize, scanLimit);
        const chunk = buffer.toString('ascii', offset, end);
        
        const matches = chunk.matchAll(regex);
        for (const match of matches) {
            const name = match[0];
            // Filter out noise: PS2 Save names are typically 10-20 chars
            if (name && name.length >= 10 && name.length <= 32 && !foundNames.has(name)) {
                // Check if it's a known PS2 region code pattern
                if (name.startsWith('SLUS') || name.startsWith('SCUS') || 
                    name.startsWith('SLES') || name.startsWith('SCES') || 
                    name.startsWith('SLPM') || name.startsWith('SLPS') ||
                    name.startsWith('BASLUS') || name.startsWith('BASCUS')) {
                    
                    foundNames.add(name);
                    entries.push({
                        name,
                        isDir: true,
                        size: 0,
                        mtime: new Date()
                    });
                }
            }
        }
    }

    // Sort alphabetically for clean UI
    return entries.sort((a, b) => a.name.localeCompare(b.name));
}
