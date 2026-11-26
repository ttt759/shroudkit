export type ExifItem = { key: string; value: string; risk: 'high' | 'medium' | 'low'; orientation?: number };
const ascii = new TextDecoder('windows-1252');
const typeSize: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
const orientations = [
  '', 'Normal', 'Mirrored horizontally', 'Rotated 180°', 'Mirrored vertically',
  'Transposed', 'Rotated 90° CW', 'Transverse reflection', 'Rotated 90° CCW',
];

export function readExif(bytes: Uint8Array) {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = bytes[0] === 73 && bytes[1] === 73;
  if (data.byteLength < 8 || (!little && (bytes[0] !== 77 || bytes[1] !== 77)) || data.getUint16(2, little) !== 42) {
    throw new Error('Invalid TIFF header');
  }

  function directory(offset: number) {
    const count = data.getUint16(offset, little);
    if (offset + 6 + count * 12 > bytes.length) throw new Error('Truncated TIFF directory');
    const entries = new Map<number, { type: number; count: number; start: number; size: number }>();
    for (let i = 0; i < count; i++) {
      const entry = offset + 2 + i * 12;
      const type = data.getUint16(entry + 2, little);
      const count = data.getUint32(entry + 4, little);
      const size = count * (typeSize[type] ?? 0);
      if (!size) continue;
      const start = size <= 4 ? entry + 8 : data.getUint32(entry + 8, little);
      if (start + size > bytes.length) throw new Error('Truncated TIFF field');
      entries.set(data.getUint16(entry, little), { type, count, start, size });
    }
    return {
      next: data.getUint32(offset + 2 + count * 12, little),
      number(tag: number) {
        const entry = entries.get(tag);
        if (!entry) return undefined;
        if (entry.type === 1) return bytes[entry.start];
        if (entry.type === 3) return data.getUint16(entry.start, little);
        if (entry.type === 4) return data.getUint32(entry.start, little);
      },
      text(tag: number) {
        const entry = entries.get(tag);
        if (!entry || entry.type !== 2) return undefined;
        return ascii.decode(bytes.subarray(entry.start, entry.start + Math.min(entry.size, 16_384))).split('\0')[0].trim();
      },
      rationals(tag: number, length: number) {
        const entry = entries.get(tag);
        if (!entry || entry.count !== length || (entry.type !== 5 && entry.type !== 10)) return undefined;
        const read = entry.type === 5 ? data.getUint32.bind(data) : data.getInt32.bind(data);
        const values = Array.from({ length }, (_, index) => {
          const offset = entry.start + index * 8;
          return read(offset, little) / read(offset + 4, little);
        });
        return values.every(Number.isFinite) ? values : undefined;
      },
    };
  }

  const root = directory(data.getUint32(4, little));
  const exifOffset = root.number(0x8769);
  const gpsOffset = root.number(0x8825);
  const exif = exifOffset ? directory(exifOffset) : undefined;
  const gps = gpsOffset ? directory(gpsOffset) : undefined;
  const items: ExifItem[] = [];
  const add = (key: string, value: string | undefined, risk: ExifItem['risk'] = 'medium') => {
    if (value) items.push({ key, value, risk });
  };
  const orientation = root.number(0x0112) ?? 1;
  const rotated = orientation >= 2 && orientation <= 8;
  if (rotated) {
    items.push({ key: 'orientation', value: orientations[orientation] + ' (' + orientation + ')', risk: 'low', orientation });
  }

  if (gps) {
    const latRef = gps.text(1);
    const lonRef = gps.text(3);
    const decimal = (value: number[] | undefined, ref: string | undefined, extent: number, refs: string) => {
      if (!value || !ref || ref.length !== 1 || !refs.includes(ref)) return undefined;
      const [degrees, minutes, seconds] = value;
      if (degrees < 0 || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) return undefined;
      const absolute = degrees + minutes / 60 + seconds / 3600;
      return absolute <= extent ? Number((absolute * ('SW'.includes(ref) ? -1 : 1)).toFixed(8)) : undefined;
    };
    const latitude = decimal(gps.rationals(2, 3), latRef, 90, 'NS');
    const longitude = decimal(gps.rationals(4, 3), lonRef, 180, 'EW');
    if (latitude !== undefined) add('latitude', Math.abs(latitude) + '° ' + latRef, 'high');
    if (longitude !== undefined) add('longitude', Math.abs(longitude) + '° ' + lonRef, 'high');
    if (latitude === undefined && longitude === undefined) add('gpsBlock', 'GPS IFD', 'high');

    const altitude = gps.rationals(6, 1)?.[0];
    if (altitude !== undefined) add('altitude', (gps.number(5) === 1 ? -altitude : altitude) + ' m', 'high');
    const date = gps.text(29);
    const time = gps.rationals(7, 3)?.map(part => String(part).padStart(2, '0')).join(':');
    if (date || time) add('gpsTime', [date, time, 'UTC'].filter(Boolean).join(' '), 'high');
  }

  add('make', root.text(0x010f));
  add('model', root.text(0x0110));
  add('captureTime', exif?.text(0x9003) || root.text(0x0132));
  add('lens', exif?.text(0xa434));
  add('software', root.text(0x0131));
  add('artist', root.text(0x013b));
  add('copyright', root.text(0x8298));
  add('description', root.text(0x010e));
  add('serial', exif?.text(0xa431) || exif?.text(0xa435));
  if (root.next) {
    const thumbnail = directory(root.next);
    if ((thumbnail.number(0x0201) && thumbnail.number(0x0202)) || thumbnail.number(0x0111)) {
      add('thumbnail', 'TIFF IFD1');
    }
  }
  return { items, rotated };
}
