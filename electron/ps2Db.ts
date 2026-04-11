/**
 * PS2 Game Database & Icon Provider
 */

interface PS2Game {
    title: string;
    icon: string;
}

const LOCAL_DB: Record<string, PS2Game> = {
    'BASLUS-21441': { title: 'God of War II', icon: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2044.webp' },
    'SCUS-97101': { title: 'God of War', icon: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2043.webp' },
    'SLUS-20933': { title: 'GTA: San Andreas', icon: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1rgh.webp' },
    'SLUS-20059': { title: 'Tekken Tag Tournament', icon: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1x3b.webp' },
    'SLES-50330': { title: 'Silent Hill 2', icon: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co25p0.webp' },
    'SLUS-21194': { title: 'Metal Gear Solid 3', icon: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1v5j.webp' },
    'SCUS-97113': { title: 'ICO', icon: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1uj9.webp' },
    'SCUS-97402': { title: 'Shadow of the Colossus', icon: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1twy.webp' },
    'SLUS-20312': { title: 'Final Fantasy X', icon: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co25p2.webp' },
    'SLUS-20002': { title: 'Ridge Racer V', icon: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1x3c.webp' }
};

export function identifyPS2Game(serial: string): PS2Game {
    // Standardize serial (remove dots, hyphens etc if needed)
    const key = serial.toUpperCase().replace(/_/, '-');
    
    // Check local DB
    if (LOCAL_DB[key]) {
        return LOCAL_DB[key];
    }

    // Try to guess title from serial if it has extra chars (e.g. BASLUS-21441GOW2)
    // Most serials are 10-11 chars.
    const baseSerial = key.substring(0, 11);
    if (LOCAL_DB[baseSerial]) {
        return LOCAL_DB[baseSerial];
    }

    // Fallback search or generic
    return {
        title: `Neznámá hra (${serial})`,
        icon: 'https://raw.githubusercontent.com/dagavi/mcardjs/master/assets/ps2_card.png'
    };
}
