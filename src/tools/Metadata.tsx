import { useState } from 'react';
import { Aperture, BadgeCheck, Download, FileSearch, Layers3, MapPin, ShieldCheck, SlidersHorizontal, Sparkles, TriangleAlert, X } from 'lucide-react';
import { EmptyState, FileLine, FilePicker, PanelHeading, Status, useBlobUrl } from '../components';
import { reencodeImage, syntheticPhoto, type CanvasType } from '../core/canvas';
import { download, fileStem, imageAccept, zipOutputs, type Output } from '../core/downloads';
import { auditMetadata, stripMetadata, type Audit, type MetadataItem } from '../core/metadata';
import { sizeLabel, type T } from '../i18n';
import { useImagePaste, useTask } from '../hooks';

type RecordItem = { file: File; audit?: Audit; clean?: { output: Output; audit: Audit }; failed?: boolean };
const orientationNames = ['', '', '水平镜像', '旋转 180°', '垂直镜像', '沿主对角线镜像',
  '顺时针旋转 90°', '沿副对角线镜像', '逆时针旋转 90°'];

function fieldName(item: MetadataItem, t: T) {
  const names: Record<string, string> = {
    latitude: t('纬度', 'Latitude'), longitude: t('经度', 'Longitude'),
    altitude: t('GPS 海拔', 'GPS altitude'), gpsTime: t('GPS 时间', 'GPS timestamp'), gpsBlock: t('GPS 数据块', 'GPS block'),
    make: t('相机品牌', 'Camera make'), model: t('相机型号', 'Camera model'), captureTime: t('拍摄时间', 'Capture time'),
    lens: t('镜头型号', 'Lens model'), software: t('软件与编辑器', 'Software / editor'), artist: t('作者', 'Artist'),
    copyright: t('版权', 'Copyright'), description: t('图像描述', 'Image description'), serial: t('设备序列号', 'Device serial'),
    thumbnail: t('内嵌缩略图', 'Embedded thumbnail'), exif: 'EXIF', xmp: 'XMP', icc: t('ICC 色彩配置', 'ICC color profile'),
    iptc: 'IPTC / Photoshop', comment: t('JPEG 注释', 'JPEG comment'),
    pngTime: t('图像修改时间', 'PNG modification time'), trailing: t('文件尾部附加数据', 'Trailing bytes'),
    orientation: t('EXIF 图像方向', 'EXIF orientation'),
  };
  return item.label || names[item.key] || item.key;
}

export function Metadata({ t, active: visible }: { t: T; active: boolean }) {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<'lossless' | 'pixels'>('lossless');
  const [keepIcc, setKeepIcc] = useState(false);
  const [type, setType] = useState<CanvasType>('image/png');
  const { busy, run, cancel } = useTask<'load' | 'clean' | 'zip'>();
  const [error, setError] = useState(false);
  const active = records[selected];
  const preview = useBlobUrl(active?.audit ? active.file : undefined);
  const before = active?.audit;
  const clean = active?.clean;
  const gps = before?.items.filter(item => item.risk === 'high') ?? [];
  const lat = gps.find(item => item.key === 'latitude');
  const lon = gps.find(item => item.key === 'longitude');
  const location = [lat?.value, lon?.value].filter(Boolean).join(', ');
  const good = records.filter(item => item.audit).length;
  const outputs = records.flatMap(record => record.clean ? [record.clean.output] : []);
  const retainedIccOnly = clean?.audit.items.every(item => item.key === 'icc') && keepIcc && mode === 'lossless';
  const verified = clean && (clean.audit.items.length === 0 || retainedIccOnly);

  function load(files: File[] | 'sample') {
    return run('load', async signal => {
      setError(false);
      setRecords([]);
      setSelected(0);
      try {
        const items = files === 'sample' ? [await syntheticPhoto()] : files;
        const next: RecordItem[] = [];
        for (const file of items) {
          signal.throwIfAborted();
          try { next.push({ file, audit: await auditMetadata(new Uint8Array(await file.arrayBuffer())) }); }
          catch { next.push({ file }); }
        }
        if (!signal.aborted) setRecords(next);
      } catch { if (!signal.aborted) setError(true); }
    });
  }

  useImagePaste(visible && !busy, load);

  function clearImages() {
    cancel();
    setRecords([]);
    setSelected(0);
    setError(false);
  }

  function chooseMode(next: typeof mode) {
    setMode(next);
    resetOutputs();
  }

  function resetOutputs() {
    setRecords(previous => previous.map(({ file, audit }) => ({ file, audit })));
    setError(false);
  }

  function cleanFiles() {
    return run('clean', async signal => {
      const next: RecordItem[] = [];
      for (const record of records) {
        if (signal.aborted) return;
        const { file, audit } = record;
        if (!audit) {
          next.push(record);
          continue;
        }
        try {
          const format = mode === 'pixels' ? (type === 'image/png' ? 'png' : 'jpeg') : audit.format;
          const source = mode === 'pixels' ? await reencodeImage(file, type) : file;
          if (signal.aborted) return;
          const bytes = stripMetadata(new Uint8Array(await source.arrayBuffer()), { keepIcc: mode === 'lossless' && keepIcc });
          if (signal.aborted) return;
          const after = await auditMetadata(bytes);
          next.push({ file, audit, clean: {
            audit: after, output: {
              blob: new Blob([bytes], { type: 'image/' + format }),
              name: fileStem(file.name) + '-clean.' + (format === 'jpeg' ? 'jpg' : format),
            },
          } });
        } catch { next.push({ file, audit, failed: true }); }
      }
      if (!signal.aborted) setRecords(next);
    });
  }

  function exportZip() {
    return run('zip', async signal => {
      setError(false);
      try { await zipOutputs(outputs, 'shroudkit-cleaned.zip', signal); }
      catch { if (!signal.aborted) setError(true); }
    });
  }

  return <div className="workspace-grid">
    <section className="panel">
      <PanelHeading icon={<FileSearch size={19} />} title={t('元数据检查', 'Metadata inspection')}
        action={<div className="actions">
          {(records.length > 0 || busy) && <button type="button" className="button secondary small" data-testid="metadata-clear" onClick={clearImages}>
            <X size={15} />{t('清空图像', 'Clear')}
          </button>}
          <button type="button" className="button ghost small" data-testid="metadata-sample" disabled={!!busy} onClick={() => load('sample')}>
            <Sparkles size={15} />{t('加载带 GPS 泄露的测试照片', 'Load sample photo with GPS EXIF')}
          </button>
        </div>} />
      <div className="panel-body preview-body">
        <FilePicker id="metadata-files" accept={imageAccept} t={t} multiple compact disabled={!!busy} onFiles={load}>
          <strong>{t('拖放照片或 Ctrl+V 粘贴', 'Drop photos or paste with Ctrl+V')}</strong>
          <span>{t('JPEG、PNG、WebP · 支持批量', 'JPEG, PNG, WebP · Batch supported')}</span>
        </FilePicker>
        {records.length > 0 && <div className="file-list">{records.map(({ file }, i) =>
          <FileLine file={file} key={i} testId={'metadata-file-' + i} selected={selected === i} onClick={() => setSelected(i)} />)}</div>}
        {before && <>
          <div className="photo-card">
            {preview && <img src={preview} alt={t('待检查图像预览', 'Inspected image preview')} />}
            <div className="photo-details"><span className="mono">{before.format.toUpperCase()} · {sizeLabel(active.file.size)}</span>
              <strong>{t('检测到 ', 'Detected ') + before.items.length + t(' 项元数据', ' metadata findings')}</strong>
              {gps.length ? <div className="gps-pill" data-testid="metadata-location"><MapPin size={16} />{location || t('发现 GPS 数据', 'GPS data found')}</div>
                : <span className="muted">{t('未检测到 EXIF GPS 数据', 'No EXIF GPS data detected')}</span>}</div>
          </div>
          {before.items.length > 0 && <dl className="results-list">
            {before.items.map((item, i) => <div key={i}>
              <dt><span className={'risk-dot ' + item.risk} />{fieldName(item, t)}</dt>
              <dd>{item.orientation ? t(orientationNames[item.orientation] + ' (' + item.orientation + ')', item.value) : item.value}</dd>
            </div>)}
          </dl>}
        </>}
        {!before && (active ? <Status error>{t('无法解析此文件。请选择结构有效的 JPEG、PNG 或 WebP。', 'Cannot parse this file. Choose a valid JPEG, PNG, or WebP.')}</Status>
          : <EmptyState title={busy === 'load' ? t('正在检查文件结构…', 'Inspecting file structure…') : t('等待检查照片', 'Waiting for photos')}
            note={t('检查 GPS、拍摄设备和图像注释等隐藏字段。', 'Inspect hidden GPS, device details, and image comments.')}
            icon={<Aperture size={23} />} />)}
      </div>
    </section>
    <div className="panel-stack">
      <section className="panel">
        <PanelHeading icon={<SlidersHorizontal size={18} />} title={t('净化方式', 'Cleaning method')} />
        <div className="panel-body settings">
          {mode === 'lossless' && before?.rotated && <div className="orientation-notice" data-testid="metadata-orientation-notice">
            <TriangleAlert size={18} />
            <div>
              <strong>{t('此照片依靠 EXIF 调整方向', 'This photo uses EXIF orientation')}</strong>
              <p>{t('无损清理会移除方向标签，竖拍手机照片可能因此横过来或翻转。',
                'Lossless stripping removes the orientation tag, so portrait phone photos can appear sideways or flipped.')}</p>
              <button type="button" className="button secondary small" data-testid="metadata-auto-orient"
                disabled={!!busy} onClick={() => chooseMode('pixels')}>
                {t('改用像素重编码以自动摆正', 'Switch to Pixel Re-encode to auto-orient')}
              </button>
            </div>
          </div>}
          <div className="radio-stack">
            <label className="radio-card"><input type="radio" name="metadata-mode" checked={mode === 'lossless'} data-testid="metadata-lossless"
              onChange={() => chooseMode('lossless')} disabled={!!busy} /><span>
              <strong>{t('无损二进制清理', 'Lossless binary strip')}</strong>
              <small>{t('移除识别出的元数据块，保留原有压缩像素。', 'Remove identified metadata blocks and preserve compressed pixels.')}</small>
            </span></label>
            <label className="radio-card"><input type="radio" name="metadata-mode" checked={mode === 'pixels'}
              onChange={() => chooseMode('pixels')} disabled={!!busy} /><span>
              <strong>{t('像素重编码', 'Pixel re-encode')}</strong>
              <small>{t('用新画布生成图像，去除原文件结构及尾部数据。', 'Create a fresh image to remove the original structure and trailing data.')}</small>
            </span></label>
          </div>
          {mode === 'lossless' ? <label className="check-row"><input type="checkbox" checked={keepIcc} disabled={!!busy}
            onChange={event => { setKeepIcc(event.target.checked); resetOutputs(); }} />{t('保留 ICC 色彩配置', 'Keep ICC color profile')}</label>
            : <label className="field"><span>{t('输出格式', 'Output format')}</span>
              <select value={type} disabled={!!busy} onChange={event => { setType(event.target.value as CanvasType); resetOutputs(); }}>
                <option value="image/png">PNG</option><option value="image/jpeg">JPEG</option>
              </select><small>{t('仅导出首帧，像素内隐写数据可能保留。', 'Exports the first frame. Data hidden in the pixels can survive.')}</small>
            </label>}
          <button type="button" className="button primary" data-testid="metadata-clean" disabled={!good || !!busy} onClick={cleanFiles}>
            <ShieldCheck size={17} />{busy === 'clean' ? t('正在清理并复查…', 'Cleaning and rechecking…')
              : t('净化并验证', 'Strip and verify') + (good > 1 ? ' · ' + good : '')}
          </button>
        </div>
      </section>

      <section className="panel">
        <PanelHeading icon={<BadgeCheck size={18} />} title={t('前后对照', 'Before and after')} />
        <div className="panel-body settings">
          {clean && before ? <>
            <div className={'verification-card' + (verified ? '' : ' attention')} data-testid={verified ? 'metadata-verified' : 'metadata-unverified'}>
              <div><BadgeCheck size={19} /><strong>{verified ? t('输出已通过复查', 'Output verified') : t('复查发现残留项', 'Findings remain after recheck')}</strong></div>
              <dl>
                <div><dt>{t('泄露项', 'Metadata findings')}</dt><dd>{before.items.length} → {clean.audit.items.length}</dd></div>
                <div><dt>{t('GPS 定位', 'EXIF GPS')}</dt><dd>{clean.audit.items.some(item => item.risk === 'high')
                  ? t('仍有数据', 'Still present') : gps.length ? t('已清除', 'Removed') : t('未检测到', 'None detected')}</dd></div>
                <div><dt>{t('文件体积', 'File size')}</dt><dd>{sizeLabel(active.file.size)} → {sizeLabel(clean.output.blob.size)}</dd></div>
              </dl>
              {retainedIccOnly && clean.audit.items.length > 0 && <small>{t('已按设置保留 ICC 色彩配置。', 'ICC color profile retained by choice.')}</small>}
            </div>
            <button type="button" className="button secondary" data-testid="metadata-download" onClick={() => download(clean.output)}>
              <Download size={16} />{t('下载净化图像', 'Download cleaned image')}</button>
          </> : <p className="muted">{t('净化后将重新解析输出文件，核对残留项和文件大小。', 'The output is parsed again to verify remaining findings and file size.')}</p>}
          {outputs.length > 1 && <button type="button" className="button secondary" data-testid="metadata-zip" disabled={!!busy} onClick={exportZip}>
            <Layers3 size={16} />{t('批量 ZIP', 'Batch ZIP')} · {outputs.length}
          </button>}
          <Status error={true}>{active?.failed ? t('该图像净化失败。请尝试另一种净化方式。', 'Cleaning failed. Try another cleaning method.')
            : error ? t('处理失败。请重试。', 'Processing failed. Try again.') : undefined}</Status>
        </div>
      </section>
    </div>
  </div>;
}
