import { canvasSurface, encodeCanvas, type CanvasType } from './canvas';
import { fileStem, type Output } from './downloads';
import { stripMetadata } from './metadata';

export type WatermarkOptions = {
  text: string; angle: number; opacity: number; size: number; density: number;
  color: string; enhanced: boolean; type: CanvasType; quality: number;
};

function textLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  return text.trim().split(/\r?\n/).flatMap(line => {
    const lines: string[] = [];
    let current = '';
    for (const character of line) {
      if (current && ctx.measureText(current + character).width > maxWidth) {
        lines.push(current);
        current = '';
      }
      current += character;
    }
    lines.push(current);
    return lines;
  });
}

export function paintWatermark(canvas: HTMLCanvasElement, bitmap: ImageBitmap, options: WatermarkOptions, maxSide = Infinity) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  if (options.type === 'image/jpeg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  if (!options.text.trim()) return;

  const size = Math.max(2, options.size * width / 1120);
  ctx.font = '700 ' + size + 'px "Microsoft YaHei", "PingFang SC", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const lines = textLines(ctx, options.text, Math.max(size * 3, width * 0.83));
  const spacing = (150 - options.density) / 100;
  const tileWidth = Math.max(size * 4, ...lines.map(line => ctx.measureText(line).width)) + size * spacing * 1.8;
  const tileHeight = size * (1.25 * lines.length + spacing * 2.2);
  const radius = Math.hypot(width, height) / 2;
  const rgb = Number.parseInt(options.color.slice(1), 16);
  const luma = (0.2126 * (rgb >> 16) + 0.7152 * ((rgb >> 8) & 255) + 0.0722 * (rgb & 255));
  const contrast = luma > 125 ? '#101924' : '#ffffff';

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(options.angle * Math.PI / 180);
  const columns = Math.ceil(radius / tileWidth) + 1;
  const rows = Math.ceil(radius / tileHeight) + 1;
  for (let row = -rows; row <= rows; row++) {
    for (let column = -columns; column <= columns; column++) {
      ctx.save();
      ctx.translate((column + (row % 2) * 0.5) * tileWidth, row * tileHeight);
      const variation = (Math.sin(row * 24.29 + column * 74.62) + 1) / 2;
      if (options.enhanced) {
        ctx.rotate((variation - 0.5) * 0.05);
        ctx.globalAlpha = options.opacity * (0.09 + variation * 0.06);
        ctx.strokeStyle = options.color;
        ctx.lineWidth = Math.max(0.5, size / 45);
        ctx.beginPath();
        ctx.moveTo(-tileWidth * 0.42, tileHeight * 0.36);
        ctx.lineTo(tileWidth * 0.42, -tileHeight * 0.36);
        ctx.moveTo(-tileWidth * 0.42, -tileHeight * 0.36);
        ctx.lineTo(tileWidth * 0.42, tileHeight * 0.36);
        ctx.stroke();
      }
      lines.forEach((line, index) => {
        const y = (index - (lines.length - 1) / 2) * size * 1.25;
        if (options.enhanced) {
          ctx.globalAlpha = options.opacity * (0.36 + variation * 0.15);
          ctx.lineWidth = Math.max(0.55, size * 0.09);
          ctx.strokeStyle = contrast;
          ctx.strokeText(line, size * 0.055, y + size * 0.04);
        }
        ctx.globalAlpha = options.opacity * (options.enhanced ? (0.90 + variation * 0.1) : 1);
        ctx.fillStyle = options.color;
        ctx.fillText(line, 0, y);
      });
      ctx.restore();
    }
  }
  ctx.restore();
}

export async function renderWatermark(file: File, options: WatermarkOptions): Promise<Output> {
  const bitmap = await createImageBitmap(file);
  try {
    const { canvas } = canvasSurface(1, 1);
    paintWatermark(canvas, bitmap, options);
    const encoded = await encodeCanvas(canvas, options.type, options.quality);
    const bytes = stripMetadata(new Uint8Array(await encoded.arrayBuffer()));
    return {
      name: fileStem(file.name) + '-watermarked.' + (options.type === 'image/png' ? 'png' : 'jpg'),
      blob: new Blob([bytes], { type: options.type }),
    };
  } finally {
    bitmap.close();
  }
}
