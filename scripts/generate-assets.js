const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT_DIR = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');

if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

// 1. SVG Favicon
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="#070a12"/>
  <rect x="2" y="2" width="60" height="60" rx="12" fill="none" stroke="#38bdf8" stroke-width="2" stroke-opacity="0.3"/>
  <path d="M14 18 L24 46 L32 26 L40 46 L50 18" fill="none" stroke="url(#g)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="32" cy="16" r="3" fill="#10b981"/>
</svg>`;

fs.writeFileSync(path.join(ROOT_DIR, 'favicon.svg'), faviconSvg, 'utf8');
fs.writeFileSync(path.join(ASSETS_DIR, 'favicon.svg'), faviconSvg, 'utf8');

// 2. Full Brand Logo SVG (Icon + Typography)
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 80" width="400" height="80">
  <defs>
    <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>
  </defs>
  <!-- Brand Icon Box -->
  <rect x="8" y="10" width="60" height="60" rx="14" fill="#0d121f" stroke="#38bdf8" stroke-width="2" stroke-opacity="0.4"/>
  <path d="M22 24 L30 52 L38 32 L46 52 L54 24" fill="none" stroke="url(#brandGrad)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="38" cy="22" r="3" fill="#10b981"/>
  <!-- Typography -->
  <text x="82" y="44" font-family="'Plus Jakarta Sans', system-ui, -apple-system, sans-serif" font-size="24" font-weight="800" fill="#f8fafc" letter-spacing="-0.5">WORLD STOCK NEWS</text>
  <rect x="82" y="52" width="68" height="18" rx="4" fill="#38bdf8" fill-opacity="0.15"/>
  <text x="88" y="65" font-family="'JetBrains Mono', monospace" font-size="10" font-weight="700" fill="#38bdf8" letter-spacing="1">PRO WIRE</text>
  <text x="160" y="65" font-family="'Plus Jakarta Sans', sans-serif" font-size="11" font-weight="500" fill="#94a3b8">REAL-TIME FINANCIAL INTELLIGENCE</text>
</svg>`;

fs.writeFileSync(path.join(ASSETS_DIR, 'logo.svg'), logoSvg, 'utf8');

function createSolidPng(width, height, r, g, b, a = 255) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(12 + len);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crc = crc32(buf.subarray(4, 8 + len));
    buf.writeInt32BE(crc, 8 + len);
    return buf;
  }

  const rowBytes = 1 + width * 4;
  const rawData = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    const offset = y * rowBytes;
    rawData[offset] = 0;
    for (let x = 0; x < width; x++) {
      const pxOffset = offset + 1 + x * 4;
      const isBorder = (x < 6 || x >= width - 6 || y < 6 || y >= height - 6);
      if (isBorder) {
        rawData[pxOffset] = 56;
        rawData[pxOffset + 1] = 189;
        rawData[pxOffset + 2] = 248;
        rawData[pxOffset + 3] = 255;
      } else {
        rawData[pxOffset] = r;
        rawData[pxOffset + 1] = g;
        rawData[pxOffset + 2] = b;
        rawData[pxOffset + 3] = a;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(buf) {
  let table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) | 0;
}

const png192 = createSolidPng(192, 192, 7, 10, 18, 255);
const png512 = createSolidPng(512, 512, 7, 10, 18, 255);
const logoPng = createSolidPng(400, 80, 13, 18, 31, 255);

fs.writeFileSync(path.join(ASSETS_DIR, 'icon-192.png'), png192);
fs.writeFileSync(path.join(ASSETS_DIR, 'icon-512.png'), png512);
fs.writeFileSync(path.join(ASSETS_DIR, 'logo.png'), logoPng);
fs.writeFileSync(path.join(ROOT_DIR, 'favicon.ico'), createSolidPng(32, 32, 7, 10, 18, 255));

console.log("All brand assets, favicons, logos, and PWA icons generated successfully!");
