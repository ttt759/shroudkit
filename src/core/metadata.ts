import { readExif, type ExifItem } from './exif';

export type ImageFormat = 'jpeg' | 'png' | 'webp';
export type MetadataItem = ExifItem & { label?: string };
export type Audit = {
  format: ImageFormat;
  items: MetadataItem[];
  rotated: boolean;
  latitude?: number;
  longitude?: number;
};
type Chunk = { name: string; start: number; end: number; data: Uint8Array };

const utf8 = new TextDecoder();
const latin = new TextDecoder('iso-8859-1');
const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const textAt = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));
const pngMagic = [137, 80, 78, 71, 13, 10, 26, 10];

function jpegChunks(bytes: Uint8Array): Chunk[] {
  const chunks: Chunk[] = [];
  const view = viewOf(bytes);
  let offset = 2;
  let scanning = false;
  let sawScan = false;
  while (offset < bytes.length) {
    const start = offset;
    if (!scanning && bytes[start] !== 255) throw new Error('Invalid JPEG marker');
    if (scanning) {
      const next = bytes.indexOf(255, offset);
      offset = next < 0 ? bytes.length : next;
    }
    const markerStart = offset;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === undefined) break;
    if (scanning && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7) || marker === 1)) continue;
    scanning = false;
    if (marker === 0xd9 && sawScan) {
      chunks.push({ name: 'EOI', start: markerStart, end: offset, data: bytes.subarray(offset, offset) });
      return chunks;
    }
    if (marker <= 1 || marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)
      || offset + 2 > bytes.length) throw new Error('Invalid JPEG segment');
    const size = view.getUint16(offset);
    const end = offset + size;
    if (size < 2 || end > bytes.length) throw new Error('Truncated JPEG segment');
    const data = bytes.subarray(offset + 2, end);
    if (marker >= 0xe0 || marker === 0xda) {
      chunks.push({ name: marker.toString(16), start: markerStart, end, data });
    }
    offset = end;
    scanning = marker === 0xda || (marker === 0xdc && sawScan);
    sawScan ||= marker === 0xda;
  }
  throw new Error('Missing JPEG end marker');
}

function pngChunks(bytes: Uint8Array): Chunk[] {
  const view = viewOf(bytes);
  const chunks: Chunk[] = [];
  let offset = 8;
  let sawPixels = false;
  while (offset + 12 <= bytes.length) {
    const size = view.getUint32(offset);
    const name = textAt(bytes, offset + 4, 4);
    const end = offset + 12 + size;
    if (size > 0x7fffffff || end > bytes.length || !/^[a-z]{4}$/i.test(name)) throw new Error('Invalid PNG chunk');
    if (!chunks.length && (name !== 'IHDR' || size !== 13)) throw new Error('Missing PNG header');
    if (/^[A-Z]/.test(name) && !pngImageChunks.has(name)) throw new Error('Unsupported critical PNG chunk');
    chunks.push({ name, start: offset, end, data: bytes.subarray(offset + 8, end - 4) });
    sawPixels ||= name === 'IDAT';
    if (name === 'IEND' && size === 0 && sawPixels) return chunks;
    offset = end;
  }
  throw new Error('Missing PNG end chunk');
}

function webpChunks(bytes: Uint8Array): Chunk[] {
  const view = viewOf(bytes);
  const endRiff = view.getUint32(4, true) + 8;
  if (endRiff > bytes.length || endRiff < 20) throw new Error('Invalid WebP size');
  const chunks: Chunk[] = [];
  let offset = 12;
  while (offset + 8 <= endRiff) {
    const size = view.getUint32(offset + 4, true);
    const end = offset + size + 8 + (size % 2);
    if (end > endRiff) throw new Error('Truncated WebP chunk');
    const name = textAt(bytes, offset, 4);
    if (name === 'VP8X' && size !== 10) throw new Error('Invalid WebP extended header');
    chunks.push({ name, start: offset, end, data: bytes.subarray(offset + 8, offset + 8 + size) });
    offset = end;
  }
  if (offset !== endRiff || !chunks.some(({ name }) => ['VP8 ', 'VP8L', 'ANMF'].includes(name))) {
    throw new Error('Invalid WebP image');
  }
  return chunks;
}

function parseContainer(bytes: Uint8Array): { format: ImageFormat; chunks: Chunk[] } {
  if (bytes[0] === 255 && bytes[1] === 216) return { format: 'jpeg', chunks: jpegChunks(bytes) };
  if (pngMagic.every((value, index) => bytes[index] === value)) return { format: 'png', chunks: pngChunks(bytes) };
  if (textAt(bytes, 0, 4) === 'RIFF' && textAt(bytes, 8, 4) === 'WEBP') return { format: 'webp', chunks: webpChunks(bytes) };
  throw new Error('Expected JPEG, PNG, or WebP image');
}

const privatePng = new Map([
  ['tEXt', 'pngText'], ['zTXt', 'pngText'], ['iTXt', 'pngText'], ['eXIf', 'exif'],
  ['tIME', 'pngTime'], ['iCCP', 'icc'],
]);
const pngImageChunks = new Set([
  'IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'cHRM', 'gAMA', 'sBIT', 'sRGB', 'bKGD',
  'pHYs', 'sPLT', 'hIST', 'sTER', 'acTL', 'fcTL', 'fdAT', 'cICP', 'mDCv', 'cLLi',
]);
const webpImageChunks = new Set(['VP8 ', 'VP8L', 'VP8X', 'ANIM', 'ANMF', 'ALPH']);

function metadataKind(format: ImageFormat, { name, data }: Chunk): string | undefined {
  if (format === 'png') {
    // Keep rendering and animation chunks. Unknown ancillary chunks can carry arbitrary data.
    return privatePng.get(name) ?? (pngImageChunks.has(name) ? undefined : 'application');
  }
  if (format === 'webp') {
    if (name === 'EXIF') return 'exif';
    if (name === 'XMP ') return 'xmp';
    if (name === 'ICCP') return 'icc';
    return webpImageChunks.has(name) ? undefined : 'application';
  }
  if (name === 'e1') {
    const signature = textAt(data, 0, 40);
    if (signature.startsWith('Exif\0\0')) return 'exif';
    if (signature.startsWith('http://ns.adobe.com/')) return 'xmp';
    return 'application';
  }
  if (name === 'e2' && textAt(data, 0, 12) === 'ICC_PROFILE\0') return 'icc';
  if (name === 'ed') return 'iptc';
  if (name === 'fe') return 'comment';
  if (name === 'e0' && data.length === 14 && textAt(data, 0, 5) === 'JFIF\0' && !data[12] && !data[13]) return;
  if (name === 'ee' && data.length === 12 && textAt(data, 0, 5) === 'Adobe') return;
  if (/^e[0-9a-f]$/.test(name)) return 'application';
}

const textLimit = 32_768;
const byteCount = (count: number) => count + ' bytes';

async function inflateText(bytes: Uint8Array) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const output = new Uint8Array(textLimit);
  let offset = 0;
  try {
    while (offset < output.length) {
      const { done, value } = await reader.read();
      if (done) break;
      const slice = value.subarray(0, output.length - offset);
      output.set(slice, offset);
      offset += slice.length;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return output.subarray(0, offset);
}

async function pngText({ data, name }: Chunk): Promise<MetadataItem> {
  const split = data.indexOf(0);
  const label = split > 0 && split <= 79 ? latin.decode(data.subarray(0, split)) : name;
  let value = byteCount(data.length);
  if (split > 0 && split <= 79) {
    try {
      if (name === 'tEXt') value = latin.decode(data.subarray(split + 1, split + 1 + textLimit));
      if (name === 'zTXt' && data[split + 1] === 0) value = latin.decode(await inflateText(data.subarray(split + 2)));
      if (name === 'iTXt' && data[split + 2] === 0) {
        const language = data.indexOf(0, split + 3);
        const translated = language < 0 ? -1 : data.indexOf(0, language + 1);
        if (translated >= 0 && data[split + 1] <= 1) {
          value = utf8.decode(data[split + 1] === 1
            ? await inflateText(data.subarray(translated + 1))
            : data.subarray(translated + 1, translated + 1 + textLimit));
        }
      }
    } catch {
      // Invalid compressed text is still reported and removed.
    }
  }
  return { key: 'pngText', label, value, risk: 'medium' };
}

export async function auditMetadata(bytes: Uint8Array): Promise<Audit> {
  const { format, chunks } = parseContainer(bytes);
  const audit: Audit = { format, items: [], rotated: false };
  for (const chunk of chunks) {
    const key = metadataKind(format, chunk);
    const { data, name } = chunk;
    if (!key) continue;
    if (key === 'exif') {
      try {
        const exif = readExif(textAt(data, 0, 6) === 'Exif\0\0' ? data.subarray(6) : data);
        audit.rotated ||= exif.rotated;
        for (const entry of exif.items) {
          if (entry.key === 'latitude' || entry.key === 'longitude') {
            audit[entry.key] = Number.parseFloat(entry.value) * (/[SW]$/.test(entry.value) ? -1 : 1);
          }
        }
        if (exif.items.length) {
          audit.items.push(...exif.items);
          continue;
        }
      } catch {
        // Keep the EXIF block visible in the audit even when TIFF is malformed.
      }
    }
    if (key === 'pngText') {
      audit.items.push(await pngText(chunk));
      continue;
    }
    let value = byteCount(data.length);
    if (key === 'comment') value = latin.decode(data.subarray(0, textLimit)) || value;
    if (key === 'xmp') {
      const offset = format === 'jpeg' ? data.indexOf(0) + 1 : 0;
      value = utf8.decode(data.subarray(offset, offset + textLimit)).trim() || value;
    }
    if (key === 'pngTime' && data.length === 7) {
      const year = viewOf(data).getUint16(0);
      const p = (index: number) => String(data[index]).padStart(2, '0');
      value = year + '-' + p(2) + '-' + p(3) + ' ' + p(4) + ':' + p(5) + ':' + p(6) + ' UTC';
    }
    audit.items.push({ key, value, risk: key === 'icc' ? 'low' : 'medium', label: key === 'application' ? name.toUpperCase() : undefined });
  }
  const end = chunks.at(-1)?.end ?? bytes.length;
  if (end < bytes.length) audit.items.push({ key: 'trailing', risk: 'medium', value: byteCount(bytes.length - end) });
  return audit;
}

export function stripMetadata(bytes: Uint8Array, { keepIcc = false }: { keepIcc?: boolean } = {}) {
  const { format, chunks } = parseContainer(bytes);
  const end = chunks.at(-1)!.end;
  const removed = chunks.filter(chunk => {
    const key = metadataKind(format, chunk);
    return key && (key !== 'icc' || !keepIcc);
  });
  const clean = new Uint8Array(end - removed.reduce((total, chunk) => total + chunk.end - chunk.start, 0));
  let source = 0;
  let target = 0;
  for (const chunk of removed) {
    clean.set(bytes.subarray(source, chunk.start), target);
    target += chunk.start - source;
    source = chunk.end;
  }
  clean.set(bytes.subarray(source, end), target);

  if (format === 'webp') {
    viewOf(clean).setUint32(4, clean.length - 8, true);
    const extended = chunks.find(chunk => chunk.name === 'VP8X');
    if (extended) {
      const shifted = removed.filter(chunk => chunk.start < extended.start)
        .reduce((total, chunk) => total + chunk.end - chunk.start, 0);
      const offset = extended.start + 8 - shifted;
      clean[offset] &= keepIcc ? ~0x0c : ~0x2c;
    }
  }
  return clean;
}
