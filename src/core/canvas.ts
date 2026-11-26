import { addSampleExif } from './sample-exif';
import { stripMetadata } from './metadata';

export type CanvasType = 'image/png' | 'image/jpeg';

export function canvasSurface(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  return { canvas, ctx };
}

export function encodeCanvas(canvas: HTMLCanvasElement, type: CanvasType, quality = 0.92) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image encoding failed')), type, quality);
  });
}

export async function reencodeImage(blob: Blob, type: CanvasType, quality?: number) {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    const { canvas, ctx } = canvasSurface(bitmap.width, bitmap.height);
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0);
    return await encodeCanvas(canvas, type, quality);
  } finally {
    bitmap.close();
  }
}

export async function syntheticId() {
  const { canvas, ctx } = canvasSurface(1120, 702);
  const gradient = ctx.createLinearGradient(0, 0, 1120, 702);
  gradient.addColorStop(0, '#ecf2f1');
  gradient.addColorStop(1, '#c8ddd9');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1120, 702);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 1120, 702);
  ctx.clip();
  for (let row = 0; row < 46; row++) {
    ctx.beginPath();
    ctx.strokeStyle = row % 8 === 0 ? '#457a782e' : '#4a7e7a1e';
    for (let x = 0; x <= 1120; x += 5) {
      const y = row * 22 - 110 + 37 * Math.sin(x / 152 + row / 7) + 16 * Math.cos(x / 49 + row / 12);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#618886';
  ctx.strokeRect(24, 24, 1072, 654);
  ctx.fillStyle = '#214c49';
  ctx.fillRect(55, 54, 1010, 83);
  ctx.font = '700 32px "Microsoft YaHei", sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText('测试样本  ·  虚构演示证件', 83, 107);
  ctx.font = '600 18px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('DEMO ONLY', 1037, 106);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#aecac7';
  ctx.fillRect(756, 186, 269, 328);
  ctx.fillStyle = '#799f9d';
  for (let y = 204; y < 513; y += 14) ctx.fillRect(757, y, 267, 1);
  ctx.fillStyle = '#476b6d';
  ctx.beginPath();
  ctx.ellipse(890, 305, 61, 78, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(780, 490);
  ctx.bezierCurveTo(777, 363, 1003, 363, 999, 490);
  ctx.fill();
  ctx.font = '600 14px monospace';
  ctx.fillStyle = '#e9f2ef';
  ctx.fillText('SYNTHETIC PORTRAIT', 812, 480);

  const rows = [['姓 名', '张明远'], ['出 生', '1996 年 02 月 19 日'], ['住 址', '虚构市青禾区星桥路 18 号'], ['编 号', 'DEMO · SK 024 618']];
  rows.forEach(([field, value], i) => {
    const y = 235 + i * 88;
    ctx.font = '600 25px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#396562';
    ctx.fillText(field, 84, y);
    ctx.font = '700 32px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#17363b';
    ctx.fillText(value, 210, y);
    ctx.fillStyle = '#54777646';
    ctx.fillRect(84, y + 20, 600, 1);
  });
  ctx.fillStyle = '#234947';
  ctx.font = '700 25px "Microsoft YaHei", sans-serif';
  ctx.fillText('非真实信息 · 不具备证件效力', 83, 619);
  ctx.font = '600 16px monospace';
  ctx.fillText('SHROUDKIT / FICTIONAL ID SPECIMEN', 83, 649);

  return new File([await encodeCanvas(canvas, 'image/png')], '虚构证件样本.png', { type: 'image/png' });
}

export async function syntheticPhoto() {
  const { canvas, ctx } = canvasSurface(960, 570);
  const sky = ctx.createLinearGradient(0, 0, 0, 570);
  sky.addColorStop(0, '#497d8b');
  sky.addColorStop(0.53, '#b3cbcc');
  sky.addColorStop(0.55, '#629197');
  sky.addColorStop(1, '#184b54');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 960, 570);
  ctx.fillStyle = '#e7d9a7';
  ctx.beginPath();
  ctx.arc(682, 160, 59, 0, Math.PI * 2);
  ctx.fill();
  const range = (coords: number[][], color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 315);
    coords.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(960, 326);
    ctx.lineTo(0, 326);
    ctx.fill();
  };
  range([[0, 264], [130, 130], [217, 229], [321, 112], [452, 258], [500, 215], [636, 312], [788, 188], [960, 289]], '#557a83');
  range([[0, 207], [105, 250], [195, 207], [353, 300], [523, 268], [652, 309], [820, 246], [960, 215]], '#2e626c');
  range([[0, 276], [132, 287], [254, 315], [773, 320], [871, 290], [960, 288]], '#25535b');
  for (let i = 0; i < 210; i++) {
    const y = 329 + ((i * 173) % 214);
    const x = (i * 413) % 960;
    ctx.fillStyle = i % 3 ? '#cae0dc35' : '#0f424d44';
    ctx.fillRect(x, y, 17 + (i * 7 % 89), i % 8 === 0 ? 2 : 1);
  }
  ctx.fillStyle = '#c7ca9a5e';
  for (let i = 0; i < 19; i++) ctx.fillRect(628 - i, 331 + i * 8, ((i * 41) % 122) + 15, 2);
  ctx.fillStyle = '#132f386e';
  ctx.fillRect(24, 508, 255, 35);
  ctx.fillStyle = '#e3f1ef';
  ctx.font = '600 15px monospace';
  ctx.fillText('SYNTHETIC PHOTO / DEMO', 39, 531);
  const jpeg = new Uint8Array(await (await encodeCanvas(canvas, 'image/jpeg', 0.93)).arrayBuffer());
  return new File([addSampleExif(stripMetadata(jpeg))], 'shroudkit-gps-sample.jpg', { type: 'image/jpeg' });
}
