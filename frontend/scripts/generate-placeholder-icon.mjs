/**
 * Generates a minimal valid 512x512 placeholder PNG icon for PWA.
 * Run once with: node frontend/scripts/generate-placeholder-icon.mjs
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = join(__dirname, '..', 'public', 'icons');
const outputFile = join(outputDir, 'icon-512.png');

mkdirSync(outputDir, { recursive: true });

// Minimal valid PNG: 512x512, solid green (#4CAF50) fill
// We construct a valid PNG using raw byte manipulation.
// PNG structure: Signature + IHDR + IDAT + IEND

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.allocUnsafe(4);
  const crcData = Buffer.concat([typeBytes, data]);
  crcBuf.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

function deflateRaw(data) {
  // zlib format: CMF + FLG + deflate blocks + Adler32
  // Use stored (non-compressed) blocks for simplicity
  // Each stored block: BFINAL, BTYPE=00, LEN (2 bytes LE), NLEN (2 bytes LE), data
  const blocks = [];
  let offset = 0;
  while (offset < data.length) {
    const blockSize = Math.min(65535, data.length - offset);
    const isLast = (offset + blockSize >= data.length) ? 1 : 0;
    const blockBuf = Buffer.allocUnsafe(5 + blockSize);
    blockBuf[0] = isLast; // BFINAL | BTYPE=00
    blockBuf.writeUInt16LE(blockSize, 1);
    blockBuf.writeUInt16LE(blockSize ^ 0xFFFF, 3);
    data.copy(blockBuf, 5, offset, offset + blockSize);
    blocks.push(blockBuf);
    offset += blockSize;
  }
  const deflateData = Buffer.concat(blocks);

  // Adler32
  let s1 = 1, s2 = 0;
  for (let i = 0; i < data.length; i++) {
    s1 = (s1 + data[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  const adler = ((s2 << 16) | s1) >>> 0;

  const cmfFlg = Buffer.from([0x78, 0x01]); // zlib header: deflate, default compression
  const adlerBuf = Buffer.allocUnsafe(4);
  adlerBuf.writeUInt32BE(adler, 0);
  return Buffer.concat([cmfFlg, deflateData, adlerBuf]);
}

const WIDTH = 512;
const HEIGHT = 512;
const R = 0x4C, G = 0xAF, B = 0x50; // #4CAF50

// Build raw image data: for each row, filter byte (0=None) + RGB pixels
const rawRows = [];
for (let y = 0; y < HEIGHT; y++) {
  const row = Buffer.allocUnsafe(1 + WIDTH * 3);
  row[0] = 0; // filter type: None
  for (let x = 0; x < WIDTH; x++) {
    row[1 + x * 3] = R;
    row[2 + x * 3] = G;
    row[3 + x * 3] = B;
  }
  rawRows.push(row);
}
const rawData = Buffer.concat(rawRows);
const compressed = deflateRaw(rawData);

// PNG Signature
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// IHDR chunk
const ihdrData = Buffer.allocUnsafe(13);
ihdrData.writeUInt32BE(WIDTH, 0);
ihdrData.writeUInt32BE(HEIGHT, 4);
ihdrData[8] = 8;  // bit depth
ihdrData[9] = 2;  // color type: RGB
ihdrData[10] = 0; // compression
ihdrData[11] = 0; // filter
ihdrData[12] = 0; // interlace
const ihdrChunk = chunk('IHDR', ihdrData);

// IDAT chunk
const idatChunk = chunk('IDAT', compressed);

// IEND chunk
const iendChunk = chunk('IEND', Buffer.alloc(0));

const png = Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
writeFileSync(outputFile, png);
console.log(`Generated: ${outputFile} (${png.length} bytes)`);
