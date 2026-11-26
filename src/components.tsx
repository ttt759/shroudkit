import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Upload, File, CheckCircle2, AlertCircle, ScanLine } from 'lucide-react';
import type { T } from './i18n';
import { sizeLabel } from './i18n';

export function FilePicker({ id, accept, multiple, disabled, compact, onFiles, children, t }: {
  id: string; accept?: string; multiple?: boolean; disabled?: boolean; compact?: boolean;
  onFiles: (files: File[]) => void; children: ReactNode; t: T;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return <div className={'file-picker' + (compact ? ' compact' : '') + (over ? ' over' : '')}
    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'; if (!disabled) setOver(true); }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false); }}
    onDrop={event => {
      event.preventDefault();
      setOver(false);
      if (!disabled && event.dataTransfer.files.length) onFiles(Array.from(event.dataTransfer.files));
    }}>
    <input type="file" ref={input} data-testid={id} accept={accept} multiple={multiple}
      disabled={disabled} aria-label={t('选择文件', 'Choose files')} hidden onChange={event => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = '';
        if (files.length) onFiles(files);
      }} />
    <div className="pick-icon"><Upload size={compact ? 17 : 22} /></div>
    <div className="pick-text">{children}</div>
    <button type="button" className="button secondary" disabled={disabled} onClick={() => input.current?.click()}>
      {t('选择文件', 'Choose files')}
    </button>
  </div>;
}

export function PanelHeading({ icon, title, action }: { icon?: ReactNode; title: string; action?: ReactNode }) {
  return <div className="panel-heading"><h3>{icon}{title}</h3>{action}</div>;
}

export function EmptyState({ title, note, icon }: { title: string; note?: string; icon?: ReactNode }) {
  return <div className="empty-state">
    <span className="empty-icon">{icon ?? <ScanLine size={23} />}</span>
    <strong>{title}</strong>
    {note && <span>{note}</span>}
  </div>;
}

export function FileLine({ file, selected, onClick, testId }: {
  file: File; selected?: boolean; onClick?: () => void; testId?: string;
}) {
  const children = <><File size={17} /><span title={file.name}>{file.name}</span><small>{sizeLabel(file.size)}</small></>;
  return onClick
    ? <button type="button" className="file-line" data-testid={testId} aria-pressed={selected} onClick={onClick}>{children}</button>
    : <div className="file-line" data-testid={testId}>{children}</div>;
}

export function Status({ error, children, testId }: { error?: boolean; children?: ReactNode; testId?: string }) {
  if (!children) return null;
  return <div className={'status ' + (error ? 'error' : 'success')} data-testid={testId}
    role={error ? 'alert' : 'status'}>{error ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}<span>{children}</span></div>;
}

export function useBlobUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}
