type Value = { tag: number; type: number; count: number; bytes: Uint8Array };
const encoder = new TextEncoder();

export function addSampleExif(jpeg: Uint8Array, order: 'II' | 'MM' = 'II') {
  if (jpeg[0] !== 255 || jpeg[1] !== 216) throw new Error('Expected JPEG');
  const little = order === 'II';
  const string = (tag: number, value: string): Value => {
    const bytes = encoder.encode(value + '\0');
    return { tag, type: 2, count: bytes.length, bytes };
  };
  const int = (tag: number, value: number): Value => {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, little);
    return { tag, type: 4, count: 1, bytes };
  };
  const rational = (tag: number, pairs: [number, number][]): Value => {
    const bytes = new Uint8Array(pairs.length * 8);
    const view = new DataView(bytes.buffer);
    pairs.forEach(([num, den], index) => {
      view.setUint32(index * 8, num, little);
      view.setUint32(index * 8 + 4, den, little);
    });
    return { tag, type: 5, count: pairs.length, bytes };
  };
  const metadata = [
    string(0x010e, 'Synthetic landscape created for the metadata demo'),
    string(0x010f, 'ShroudKit Imaging'),
    string(0x0110, 'Demo Camera S1'),
    string(0x0131, 'ShroudKit Synthetic Studio'),
  ];
  const exif = [string(0x9003, '2026:11:26 10:24:00'), string(0xa434, 'Demo Lens 35mm')];
  const gps = [
    string(1, 'N'), rational(2, [[31, 1], [13, 1], [4944, 100]]),
    string(3, 'E'), rational(4, [[121, 1], [28, 1], [2532, 100]]),
    { tag: 5, type: 1, count: 1, bytes: new Uint8Array([0]) },
    rational(6, [[225, 10]]), rational(7, [[2, 1], [24, 1], [0, 1]]),
    string(29, '2026:11:26'),
  ];
  const directoryLength = (count: number) => 6 + count * 12;
  const exifOffset = 8 + directoryLength(metadata.length + 2);
  const gpsOffset = exifOffset + directoryLength(exif.length);
  const root = [...metadata, int(0x8769, exifOffset), int(0x8825, gpsOffset)];
  let cursor = gpsOffset + directoryLength(gps.length);
  const storage = [...root, ...exif, ...gps].reduce((total, { bytes }) => total + (bytes.length > 4 ? bytes.length : 0), cursor);
  const tiff = new Uint8Array(storage);
  const view = new DataView(tiff.buffer);
  tiff.set(encoder.encode(order));
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);

  for (const [start, entries] of [[8, root], [exifOffset, exif], [gpsOffset, gps]] as const) {
    view.setUint16(start, entries.length, little);
    entries.forEach(({ tag, type, count, bytes }, index) => {
      const offset = start + 2 + index * 12;
      view.setUint16(offset, tag, little);
      view.setUint16(offset + 2, type, little);
      view.setUint32(offset + 4, count, little);
      if (bytes.length <= 4) {
        tiff.set(bytes, offset + 8);
      } else {
        view.setUint32(offset + 8, cursor, little);
        tiff.set(bytes, cursor);
        cursor += bytes.length;
      }
    });
  }

  const comment = encoder.encode('Fictional sample created for the ShroudKit metadata audit');
  const commentOffset = 12 + tiff.length;
  const result = new Uint8Array(jpeg.length + 10 + tiff.length + 4 + comment.length);
  result.set([255, 216, 255, 225]);
  const resultView = new DataView(result.buffer);
  resultView.setUint16(4, 8 + tiff.length);
  result.set(encoder.encode('Exif\0\0'), 6);
  result.set(tiff, 12);
  result.set([255, 254], commentOffset);
  resultView.setUint16(commentOffset + 2, 2 + comment.length);
  result.set(comment, commentOffset + 4);
  result.set(jpeg.subarray(2), commentOffset + 4 + comment.length);
  return result;
}
