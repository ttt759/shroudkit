import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { auditMetadata, stripMetadata } from '../src/core/metadata';
import { addSampleExif } from '../src/core/sample-exif';

const fixture = (name: string) => readFile(new URL('./fixtures/' + name, import.meta.url));
const ascii = (value: string) => Buffer.from(value, 'latin1');

test('EXIF orientation 6 is reported and stripped from JPEG', async () => {
  const source = await fixture('orientation-6.jpg');
  const audit = await auditMetadata(source);
  assert.equal(audit.rotated, true);
  assert.deepEqual(audit.items.find(item => item.key === 'orientation'), {
    key: 'orientation', risk: 'low', value: 'Rotated 90° CW (6)', orientation: 6,
  });
  const after = await auditMetadata(stripMetadata(source));
  assert.equal(after.rotated, false);
  assert.deepEqual(after.items, []);
});

function pngChunk(type: string, payload: Uint8Array) {
  const body = Buffer.concat([ascii(type), payload]);
  const result = Buffer.alloc(payload.byteLength + 12);
  result.writeUInt32BE(payload.byteLength, 0);
  body.copy(result, 4);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}

for (const endian of ['II', 'MM'] as const) {
  test('JPEG EXIF and GPS binary round-trip with ' + endian + ' TIFF', async () => {
    const original = await fixture('pixel.jpg');
    const withExif = addSampleExif(original, endian);
    const audit = await auditMetadata(withExif);
    assert.equal(audit.latitude, 31.2304);
    assert.equal(audit.longitude, 121.4737);
    assert.equal(audit.items.find(item => item.key === 'make')?.value, 'ShroudKit Imaging');
    assert.equal(audit.items.find(item => item.key === 'model')?.value, 'Demo Camera S1');
    assert.equal(audit.items.find(item => item.key === 'captureTime')?.value, '2026:11:26 10:24:00');
    assert.equal(audit.items.find(item => item.key === 'altitude')?.value, '22.5 m');
    assert.equal(audit.items.find(item => item.key === 'gpsTime')?.value, '2026:11:26 02:24:00 UTC');
    const clean = stripMetadata(withExif);
    assert.equal((await auditMetadata(clean)).items.length, 0);
    assert.deepEqual(Buffer.from(clean), original);
    assert.deepEqual([...clean.subarray(-2)], [255, 217]);
  });
}

test('PNG plain, compressed, international and time metadata are audited and stripped', async () => {
  const original = await fixture('pixel.png');
  const bytes = Buffer.concat([
    original.subarray(0, -12),
    pngChunk('tEXt', ascii('Author\0Synthetic author')),
    pngChunk('zTXt', Buffer.concat([ascii('Prompt\0\0'), deflateSync(ascii('Synthetic prompt'))])),
    pngChunk('iTXt', Buffer.concat([ascii('Title\0\x01\0zh\0\0'), deflateSync(Buffer.from('演示'))])),
    pngChunk('tIME', Buffer.from([7, 234, 11, 26, 2, 24, 0])),
    pngChunk('prIv', ascii('synthetic private chunk')),
    original.subarray(-12),
    ascii('trailing private bytes'),
  ]);
  const audit = await auditMetadata(bytes);
  assert.deepEqual(audit.items.map(item => item.value), ['Synthetic author', 'Synthetic prompt', '演示', '2026-11-26 02:24:00 UTC', '23 bytes', '22 bytes']);
  const clean = stripMetadata(bytes);
  assert.equal((await auditMetadata(clean)).items.length, 0);
  assert.deepEqual(Buffer.from(clean), original);
});

test('JPEG APP1 XMP, APP2 ICC, APP13 IPTC and COM are identified and losslessly stripped', async () => {
  const original = await fixture('pixel.jpg');
  const segment = (marker: number, content: string) => {
    const data = ascii(content);
    const header = Buffer.from([0xff, marker, 0, 0]);
    header.writeUInt16BE(data.length + 2, 2);
    return Buffer.concat([header, data]);
  };
  const bytes = Buffer.concat([
    original.subarray(0, 2),
    segment(0xe1, 'http://ns.adobe.com/xap/1.0/\0<xmp>Synthetic</xmp>'),
    segment(0xe2, 'ICC_PROFILE\0\x01\x01Synthetic profile'),
    segment(0xed, 'Photoshop 3.0\0synthetic IPTC'),
    segment(0xfe, 'Synthetic JPEG comment'),
    original.subarray(2),
  ]);
  assert.deepEqual((await auditMetadata(bytes)).items.map(item => item.key), ['xmp', 'icc', 'iptc', 'comment']);
  assert.deepEqual(Buffer.from(stripMetadata(bytes)), original);
  assert.deepEqual((await auditMetadata(stripMetadata(bytes, { keepIcc: true }))).items.map(item => item.key), ['icc']);
});

test('WebP XMP removal updates RIFF size and VP8X flags', async () => {
  const original = await fixture('pixel.webp');
  const makeChunk = (name: string, data: Buffer) => {
    const out = Buffer.alloc(8 + data.length + (data.length % 2));
    out.write(name);
    out.writeUInt32LE(data.length, 4);
    data.copy(out, 8);
    return out;
  };
  const header = makeChunk('VP8X', Buffer.from([4, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  const body = Buffer.concat([ascii('WEBP'), header, original.subarray(12), makeChunk('XMP ', ascii('synthetic private data!'))]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  const source = Buffer.concat([ascii('RIFF'), size, body]);
  assert.equal((await auditMetadata(source)).items[0]?.key, 'xmp');
  const clean = Buffer.from(stripMetadata(source));
  assert.equal(clean.readUInt32LE(4), clean.length - 8);
  assert.equal(clean[20], 0);
  assert.equal((await auditMetadata(clean)).items.length, 0);
});

test('truncated container fails instead of giving a clean audit', async () => {
  const original = await fixture('pixel.jpg');
  await assert.rejects(auditMetadata(original.subarray(0, -1)));
  assert.throws(() => stripMetadata(original.subarray(0, -1)));
});
