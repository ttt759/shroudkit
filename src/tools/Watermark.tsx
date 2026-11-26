import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Aperture, ClipboardCopy, Download, FileImage, Layers3, ScanLine, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { FileLine, FilePicker, PanelHeading, Status } from '../components';
import { syntheticId, type CanvasType } from '../core/canvas';
import { download, imageAccept, zipOutputs } from '../core/downloads';
import { paintWatermark, renderWatermark, type WatermarkOptions } from '../core/watermark';
import { localDate, type T } from '../i18n';
import { useImagePaste, useTask } from '../hooks';

function Range({ label, value, min, max, display, onChange }: {
  label: string; value: number; min: number; max: number; display: ReactNode; onChange: (value: number) => void;
}) {
  return <label className="range-control">
    <span>{label}<output>{display}</output></span>
    <input type="range" min={min} max={max} value={value} onChange={event => onChange(event.target.valueAsNumber)} />
  </label>;
}

export function Watermark({ t, active }: { t: T; active: boolean }) {
  const [files, setFiles] = useState<File[]>([]);
  const [index, setIndex] = useState(0);
  const [preset, setPreset] = useState<number | null>(null);
  const [customText, setCustomText] = useState('');
  const [angle, setAngle] = useState(-30);
  const [opacity, setOpacity] = useState(34);
  const [size, setSize] = useState(32);
  const [density, setDensity] = useState(55);
  const [color, setColor] = useState('#334155');
  const [enhanced, setEnhanced] = useState(false);
  const [type, setType] = useState<CanvasType>('image/png');
  const [quality, setQuality] = useState(92);
  const { busy, run, cancel } = useTask<true>();
  const [message, setMessage] = useState<'saved' | 'copied' | 'image' | 'export' | 'clipboard'>();
  const [bitmap, setBitmap] = useState<{ image: ImageBitmap; file: File }>();
  const [invalid, setInvalid] = useState<File>();
  const preview = useRef<HTMLCanvasElement>(null);
  const file = files[index];
  const image = bitmap?.file === file ? bitmap?.image : undefined;
  const purposes = [t('租房签约', 'Rental agreement'), t('入职审核', 'Onboarding'),
    t('宽带办理', 'Internet setup'), t('银行开户', 'Bank account')];
  const text = preset === null
    ? customText || t('仅供本人授权用途使用 · 他用无效', 'For authorized use only')
    : t('仅供' + purposes[preset] + '核验使用 · ' + localDate() + ' · 他用无效',
      'For ' + purposes[preset].toLowerCase() + ' verification only · ' + localDate());
  const [isCustom, setIsCustom] = useState(false);
  const watermarkText = isCustom ? customText : text;
  const options: WatermarkOptions = { text: watermarkText, angle, opacity: opacity / 100, size, density, color, enhanced, type, quality: quality / 100 };

  function load(next: File[]) {
    const images = next.filter(candidate => /^(image\/(png|jpeg|webp))$/i.test(candidate.type) || /\.(png|jpe?g|webp)$/i.test(candidate.name));
    setMessage(images.length === next.length ? undefined : 'image');
    if (images.length) {
      setFiles(images);
      setIndex(0);
    }
  }

  useImagePaste(active && !busy, load);

  function clearImages() {
    cancel();
    if (preview.current) preview.current.width = 0;
    setFiles([]);
    setIndex(0);
    setBitmap(undefined);
    setInvalid(undefined);
    setMessage(undefined);
    setCustomText('');
    setIsCustom(false);
  }

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let decoded: ImageBitmap | undefined;
    createImageBitmap(file).then(result => {
      decoded = result;
      if (cancelled) result.close();
      else {
        setBitmap({ image: result, file });
        setInvalid(undefined);
      }
    }).catch(() => { if (!cancelled) setInvalid(file); });
    return () => { cancelled = true; decoded?.close(); };
  }, [file]);

  useEffect(() => {
    if (image && preview.current) paintWatermark(preview.current, image, options, 1440);
  });

  function sample() {
    return run(true, async signal => {
      try {
        const sampleFile = await syntheticId();
        if (!signal.aborted) load([sampleFile]);
      } catch { if (!signal.aborted) setMessage('image'); }
    });
  }

  async function save(batch: boolean) {
    if (!file) return;
    await run(true, async signal => {
      try {
        if (batch) {
          const outputs = [];
          for (const item of files) {
            signal.throwIfAborted();
            outputs.push(await renderWatermark(item, options));
          }
          await zipOutputs(outputs, 'shroudkit-watermarked.zip', signal);
        } else {
          const output = await renderWatermark(file, options);
          signal.throwIfAborted();
          download(output);
        }
        if (!signal.aborted) setMessage('saved');
      } catch { if (!signal.aborted) setMessage('export'); }
    });
  }

  async function copy() {
    if (!file) return;
    await run(true, async signal => {
      try {
        const blob = renderWatermark(file, { ...options, type: 'image/png' }).then(result => {
          signal.throwIfAborted();
          return result.blob;
        });
        // ClipboardItem consumes the promise in supported browsers. Some reject before reading it.
        void blob.catch(() => {});
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        if (!signal.aborted) setMessage('copied');
      } catch { if (!signal.aborted) setMessage('clipboard'); }
    });
  }

  const swatches = [
    ['#ffffff', t('白色', 'White')], ['#334155', t('炭黑', 'Charcoal')],
    ['#dc264b', t('红色', 'Red')], ['#2563eb', t('蓝色', 'Blue')],
  ];
  return <div className="workspace-grid">
    <section className="panel preview-panel">
      <PanelHeading icon={<Aperture size={19} />} title={t('图像预览', 'Image preview')}
        action={<div className="actions">
          {(files.length > 0 || busy) && <button type="button" className="button secondary small" data-testid="watermark-clear" onClick={clearImages}>
            <X size={15} />{t('清空图像', 'Clear')}
          </button>}
          <button type="button" data-testid="watermark-sample" className="button ghost small" disabled={busy} onClick={sample}>
            <Sparkles size={15} />{t('加载虚构证件样本', 'Load synthetic ID sample')}
          </button>
        </div>} />
      <div className="panel-body preview-body">
        {image ? <div className="canvas-stage"><canvas data-testid="watermark-preview" ref={preview}
          aria-label={t('实时水印预览', 'Live watermark preview')} /></div>
          : <div className="preview-stage">
            <div className="id-outline" aria-hidden="true"><div className="id-face" /><i /><i /><i /><b /><b /></div>
            <strong>{t('将水印叠加到证件图像', 'Apply a watermark to an ID image')}</strong>
            <span>{t('上传图像后在这里查看效果', 'Your image preview will appear here')}</span>
          </div>}
        {file && <div className="preview-meta"><span><FileImage size={15} />{file.name}</span>
          {image && <span className="mono">{image.width} × {image.height}</span>}</div>}
        <FilePicker id="watermark-files" t={t} accept={imageAccept} multiple compact disabled={busy} onFiles={load}>
          <strong>{t('拖放图片或 Ctrl+V 粘贴', 'Drop images or paste with Ctrl+V')}</strong>
          <span>{t('PNG、JPG、WebP · 支持批量', 'PNG, JPG, WebP · Batch supported')}</span>
        </FilePicker>
        {files.length > 1 && <div className="file-list">{files.map((item, i) =>
          <FileLine key={i} file={item} selected={index === i} onClick={() => setIndex(i)} />)}</div>}
        <Status testId="watermark-status" error={invalid === file && !!file || message === 'clipboard' || message === 'image' || message === 'export'}>
          {file && invalid === file ? t('无法解码此图片。请选择有效的 PNG、JPG 或 WebP。', 'This image could not be decoded. Choose a valid PNG, JPG, or WebP.')
            : message === 'image' ? t('请选择 PNG、JPG 或 WebP 图片。', 'Choose PNG, JPG, or WebP images.')
            : message === 'export' ? t('无法导出。请检查图像格式和尺寸。', 'Export failed. Check the image format and dimensions.')
            : message === 'clipboard' ? t('无法访问剪贴板。可通过下载保存。', 'Clipboard access failed. Use Download to save the image.')
            : message === 'copied' ? t('已复制 PNG 图像', 'PNG image copied')
            : message === 'saved' ? t('已生成图像下载', 'Image download ready') : undefined}
        </Status>
      </div>
    </section>

    <section className="panel">
      <PanelHeading icon={<SlidersHorizontal size={18} />} title={t('水印设置', 'Watermark settings')} />
      <div className="panel-body settings">
        <div className="field">
          <span className="field-label">{t('用途预设', 'Purpose presets')}</span>
          <div className="chips">{purposes.map((purpose, i) =>
            <button type="button" key={i} data-testid={'watermark-preset-' + (i + 1)} className="chip"
              aria-pressed={!isCustom && preset === i} onClick={() => { setIsCustom(false); setPreset(i); }}>{purpose}</button>)}</div>
        </div>
        <label className="field"><span>{t('水印文案', 'Watermark text')}</span>
          <textarea rows={2} maxLength={360} value={watermarkText}
            onChange={event => { setCustomText(event.target.value); setIsCustom(true); }} />
        </label>
        <div className="ranges">
          <Range label={t('倾斜角度', 'Angle')} value={angle} min={-60} max={60} display={angle + '°'} onChange={setAngle} />
          <Range label={t('不透明度', 'Opacity')} value={opacity} min={8} max={65} display={opacity + '%'} onChange={setOpacity} />
          <Range label={t('文字大小', 'Text size')} value={size} min={14} max={68} display={size} onChange={setSize} />
          <Range label={t('平铺密度', 'Tile density')} value={density} min={10} max={90} display={density + '%'} onChange={setDensity} />
        </div>
        <div className="color-row"><span className="field-label">{t('水印颜色', 'Watermark color')}</span>
          <div className="swatches">
            {swatches.map(([hex, label]) => <button type="button" key={hex} className="swatch"
              style={{ background: hex }} title={label} aria-label={label} aria-pressed={color === hex} onClick={() => setColor(hex)} />)}
            <label className="custom-swatch" title={t('自定义颜色', 'Custom color')}>
              <input type="color" value={color} aria-label={t('自定义颜色', 'Custom color')} onChange={event => setColor(event.target.value)} />
            </label>
          </div>
        </div>
        <label className="switch-row"><ScanLine size={17} /><span>
          <strong>{t('防 AI 去水印增强', 'Anti-removal enhancement')}</strong>
          <small>{t('加入双层描边、错位和细线叠印，提高去除难度。', 'Adds offset outlines and fine cross-lines to make removal harder.')}</small>
        </span><input type="checkbox" role="switch" data-testid="watermark-enhance" checked={enhanced}
          onChange={event => setEnhanced(event.target.checked)} /></label>
      </div>
      <div className="panel-body export-strip">
        <label className="field"><span>{t('输出格式', 'Output format')}</span>
          <select value={type} onChange={event => setType(event.target.value as CanvasType)}>
            <option value="image/png">PNG</option><option value="image/jpeg">JPEG</option>
          </select>
        </label>
        <div className="actions">
          <button type="button" className="button primary" data-testid="watermark-download" disabled={!image || busy} onClick={() => save(false)}>
            <Download size={17} />{t('下载图像', 'Download image')}
          </button>
          <button type="button" className="button secondary" data-testid="watermark-copy" disabled={!image || busy} onClick={copy}>
            <ClipboardCopy size={16} />{t('复制 PNG', 'Copy PNG')}
          </button>
          {files.length > 1 && <button type="button" className="button secondary" data-testid="watermark-zip" disabled={busy} onClick={() => save(true)}>
            <Layers3 size={17} />{t('批量 ZIP', 'Batch ZIP')}
          </button>}
        </div>
        {type === 'image/jpeg' && <Range label={t('JPEG 质量', 'JPEG quality')} value={quality} min={40} max={100}
          display={quality + '%'} onChange={setQuality} />}
      </div>
    </section>
  </div>;
}
