import { useId, useMemo, useState } from 'react';
import { ArrowRight, Braces, Check, ChevronDown, ClipboardCopy, Eraser, Fingerprint, ScanText, Sparkles, Trash2 } from 'lucide-react';
import { PanelHeading, Status } from '../components';
import { categories, restoreText, scrubText, syntheticLog, type Category } from '../core/scrubber';
import type { T } from '../i18n';

export function Scrubber({ t }: { t: T }) {
  const [input, setInput] = useState('');
  const [keywords, setKeywords] = useState('');
  const [mode, setMode] = useState<'reversible' | 'mask'>('reversible');
  const [disabled, setDisabled] = useState(new Set<Category>());
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [restored, setRestored] = useState('');
  const [status, setStatus] = useState<'copied' | 'copyError' | 'shredded'>();
  const drawerId = useId();
  const result = useMemo(() => scrubText(input, { keywords, mode, disabled }), [input, keywords, mode, disabled]);
  const total = Object.values(result.counts).reduce((sum, count) => sum + count, 0);
  const labels: Record<Category, string> = {
    ID: t('身份证号', 'Resident ID'), PHONE: t('手机号', 'Phone number'), CARD: t('银行卡号', 'Bank card'),
    EMAIL: t('电子邮箱', 'Email'), IP: t('IP 地址', 'IP address'),
    API_KEY: t('密钥与 Token', 'Keys and tokens'), CUSTOM: t('自定义敏感词', 'Custom terms'),
  };

  function toggle(category: Category) {
    const next = new Set(disabled);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    setDisabled(next);
    setRestored('');
    setStatus(undefined);
  }

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setStatus('copied'); }
    catch { setStatus('copyError'); }
  }

  function sample() {
    setInput(syntheticLog);
    setKeywords('星桥实验室');
    setDisabled(new Set());
    setMode('reversible');
    setReply('');
    setRestored('');
    setStatus(undefined);
  }

  function shred() {
    setInput('');
    setKeywords('');
    setReply('');
    setRestored('');
    setStatus('shredded');
  }

  return <div className="panel-stack scrub-workspace">
    <section className="panel">
      <PanelHeading icon={<ScanText size={19} />} title={t('文本脱敏', 'Text scrubbing')}
        action={<button type="button" data-testid="scrubber-sample" className="button ghost small" onClick={sample}>
          <Sparkles size={15} />{t('加载虚构事故日志', 'Load synthetic incident log')}
        </button>} />
      <div className="panel-body scrub-body">
        <div className="scrub-toolbar">
          <div className="mode-toggle">
            <button type="button" aria-pressed={mode === 'reversible'} onClick={() => { setMode('reversible'); setRestored(''); setStatus(undefined); }}>
              <Braces size={17} />{t('可逆占位符', 'Reversible placeholders')}</button>
            <button type="button" aria-pressed={mode === 'mask'} onClick={() => {
              setMode('mask'); setOpen(false); setReply(''); setRestored(''); setStatus(undefined);
            }}><Eraser size={16} />{t('不可逆遮盖', 'Irreversible masking')}</button>
          </div>
          <span className="tag match-summary"><Fingerprint size={15} />{t('匹配 ', 'Matches: ')}<strong className="mono">{total}</strong></span>
        </div>
        <div className="chips detection-chips" aria-label={t('匹配类别', 'Detection categories')} role="group">
          {categories.map(category => <button type="button" className="chip" aria-pressed={!disabled.has(category)} key={category}
            onClick={() => toggle(category)}>{labels[category]}<span className="mono">{result.counts[category]}</span></button>)}
        </div>
        <label className="field"><span>{t('自定义关键词', 'Custom keywords')}</span>
          <textarea rows={1} value={keywords} placeholder={t('公司、人名或地址，用逗号或换行分隔', 'Company, person, or address, separated by commas or newlines')}
            autoComplete="off" spellCheck={false} onChange={event => { setKeywords(event.target.value); setRestored(''); setStatus(undefined); }} />
        </label>
        <div className="text-grid">
          <label className="field text-field"><span>{t('原始文本', 'Source text')}</span>
            <textarea rows={8} data-testid="scrubber-input" autoComplete="off" spellCheck={false} value={input}
              onChange={event => { setInput(event.target.value); setRestored(''); setStatus(undefined); }}
              placeholder={t('粘贴日志、邮件或合同文本…', 'Paste a log, email, or contract…')} />
          </label>
          <label className="field text-field"><span><ArrowRight size={16} />{t('脱敏结果', 'Scrubbed output')}</span>
            <textarea rows={8} data-testid="scrubber-output" readOnly value={result.text} spellCheck={false}
              placeholder={t('匹配项将实时替换', 'Matches are replaced as you type')} />
          </label>
        </div>
        <div className="scrub-actions">
          <small>{t('发送前请复核结果，必要时添加自定义词。', 'Review the output before sharing and add custom terms as needed.')}</small>
          <button type="button" className="button primary" disabled={!input} onClick={() => copy(result.text)}>
            <ClipboardCopy size={17} />{t('复制脱敏文本', 'Copy scrubbed text')}
          </button>
        </div>
        <Status error={status === 'copyError'}>
          {status === 'copied' ? t('已复制文本', 'Text copied')
            : status === 'copyError' ? t('无法访问剪贴板。可手动选择文本。', 'Clipboard access failed. Select the text to copy it manually.')
            : status === 'shredded' ? t('映射表及工作区文本已清空', 'Mapping and workspace text cleared') : undefined}
        </Status>
      </div>
    </section>

    {mode === 'reversible' && <section className="panel restore-panel">
      <button type="button" className="drawer-trigger" data-testid="scrubber-drawer" aria-expanded={open} aria-controls={drawerId} onClick={() => setOpen(!open)}>
        <span><Braces size={20} />{t('还原 AI 回复', 'Restore AI reply')}<small className="mono">{result.mapping.length}</small></span>
        <ChevronDown size={19} />
      </button>
      <div id={drawerId} hidden={!open} className="panel-body scrub-body">
        <div className="scrub-actions">
          <p className="muted">{t('映射只存在于当前页面。编辑原文或类别会更新映射。', 'The mapping lives in this page. Changing the source or categories updates it.')}</p>
          <button type="button" className="button danger" data-testid="scrubber-shred" onClick={shred}>
            <Trash2 size={17} />{t('立即焚毁映射表', 'Shred mapping')}
          </button>
        </div>
        {result.mapping.length > 0 && <dl className="mapping-table">
          {result.mapping.map(({ token, value }) =>
            <div key={token}><dt className="mono">{token}</dt><dd>{value}</dd></div>)}
        </dl>}
        <div className="text-grid">
          <label className="field text-field"><span>{t('包含占位符的回复', 'Reply with placeholders')}</span>
            <textarea rows={5} data-testid="scrubber-reply" autoComplete="off" spellCheck={false} value={reply}
              onChange={event => { setReply(event.target.value); setRestored(''); setStatus(undefined); }} />
          </label>
          <label className="field text-field"><span><ArrowRight size={16} />{t('已还原的文本', 'Restored text')}</span>
            <textarea rows={5} data-testid="scrubber-restored" spellCheck={false} readOnly value={restored} />
          </label>
        </div>
        <div className="actions">
          <button type="button" className="button primary" data-testid="scrubber-restore" disabled={!reply || !result.mapping.length}
            onClick={() => { setRestored(restoreText(reply, result.mapping)); setStatus(undefined); }}>
            <Check size={17} />{t('还原回复', 'Restore reply')}
          </button>
          <button type="button" className="button secondary" disabled={!restored} onClick={() => copy(restored)}>
            <ClipboardCopy size={17} />{t('复制已还原文本', 'Copy restored text')}
          </button>
        </div>
      </div>
    </section>}
  </div>;
}
