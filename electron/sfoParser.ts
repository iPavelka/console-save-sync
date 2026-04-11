export function parseSFO(buffer: Buffer): Record<string, string | number> {
  // Check Magic \0PSF
  if (buffer.readUInt32LE(0) !== 0x46535000) {
    throw new Error('Not a valid PARAM.SFO file');
  }

  const keyTableStart = buffer.readUInt32LE(8);
  const dataTableStart = buffer.readUInt32LE(12);
  const entriesCount = buffer.readUInt32LE(16);

  const results: Record<string, string | number> = {};

  for (let i = 0; i < entriesCount; i++) {
    const entryOffset = 20 + i * 16;
    
    const keyOffset = buffer.readUInt16LE(entryOffset);
    const dataFormat = buffer.readUInt16LE(entryOffset + 2);
    const dataLength = buffer.readUInt32LE(entryOffset + 4);
    const dataOffset = buffer.readUInt32LE(entryOffset + 12);

    // Read Key
    let key = '';
    let currentPos = keyTableStart + keyOffset;
    while (buffer[currentPos] !== 0) {
      key += String.fromCharCode(buffer[currentPos]);
      currentPos++;
    }

    // Read Data based on format
    const actualDataOffset = dataTableStart + dataOffset;
    if (dataFormat === 0x0204) { // UTF-8 String
      results[key] = buffer.toString('utf8', actualDataOffset, actualDataOffset + dataLength).replace(/\0/g, '');
    } else if (dataFormat === 0x0404) { // uint32
      results[key] = buffer.readUInt32LE(actualDataOffset);
    } else {
      results[key] = `Unsupported format: ${dataFormat}`;
    }
  }

  return results;
}
