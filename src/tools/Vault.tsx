import { useRef, useState } from 'react';
import { ClipboardCopy, Download, Eye, EyeOff, FileLock2, Fingerprint, KeyRound, LockKeyhole, ShieldCheck, Sparkles, UnlockKeyhole, X } from 'lucide-react';
import { EmptyState, FileLine, FilePicker, PanelHeading, Status } from '../components';
import { download, fileStem, type Output } from '../core/downloads';
import { anonymousVaultName, decryptFile, encryptFile, estimatePassword, generatePassphrase, sampleContract } from '../core/vault';
import type { T } from '../i18n';
import { useTask } from '../hooks';

export function Vault({ t }: { t: T }) {
  const [mode, setMode] = useState<'encrypt' | 'decrypt'>('encrypt');
  const [file, setFile] = useState<File>();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [generated, setGenerated] = useState(false);
  const [shown, setShown] = useState(false);
  const [anonymous, setAnonymous] = useState(true);
  const issuedNames = useRef(new Set<string>());
  const { busy, run: runTask, cancel } = useTask<'file' | 'copy'>();
  const [result, setResult] = useState<Output>();
  const [message, setMessage] = useState<'mismatch' | 'auth' | 'header' | 'crypto' | 'copy' | 'copied'>();
  const encrypting = mode === 'encrypt';
  const strength = estimatePassword(password, generated);
  const score = !password ? 0 : strength.bits < 40 || password.length < 8 ? 1 : strength.bits < 70 || password.length < 12 ? 2 : strength.bits < 100 ? 3 : 4;
  const status = {
    mismatch: t('两次输入的密码不一致。', 'The passwords do not match.'),
    auth: t('身份验证失败。密码错误，或文件已被修改。', 'Authentication failed. The password is incorrect or the file was modified.'),
    header: t('无法识别容器头。文件可能损坏、被篡改或版本不受支持。', 'Invalid container header. The file may be corrupted, modified, or from an unsupported version.'),
    crypto: t('处理失败。请检查文件，并通过本机回环地址打开以启用 Web Crypto。', 'Processing failed. Check the file and open the app on a loopback address for Web Crypto.'),
    copy: t('无法访问剪贴板。', 'Clipboard access failed.'),
    copied: t('已复制密码短语', 'Passphrase copied'),
  };

  function clearResult() {
    setResult(undefined);
    setMessage(undefined);
  }

  function clearSession() {
    cancel();
    setFile(undefined);
    setPassword('');
    setGenerated(false);
    setShown(false);
    setAnonymous(true);
    changeMode('encrypt');
  }

  function changeMode(next: 'encrypt' | 'decrypt') {
    setMode(next);
    setConfirmation('');
    clearResult();
  }

  function load(next: File, forceEncrypt = false) {
    setFile(next);
    changeMode(forceEncrypt ? 'encrypt' : /\.shroud$/i.test(next.name) ? 'decrypt' : mode);
  }

  function generate() {
    const next = generatePassphrase();
    setGenerated(true);
    setPassword(next);
    setConfirmation(next);
    setMessage(undefined);
  }

  function copyPassword() {
    return runTask('copy', async signal => {
      try {
        await navigator.clipboard.writeText(password);
        if (!signal.aborted) setMessage('copied');
      } catch { if (!signal.aborted) setMessage('copy'); }
    });
  }

  async function run() {
    if (!file || !password || busy) return;
    clearResult();
    if (encrypting && password !== confirmation) {
      setMessage('mismatch');
      return;
    }
    await runTask('file', async signal => {
      try {
        if (encrypting) {
          const bytes = await encryptFile(file, password, signal);
          if (signal.aborted) return;
          const name = anonymous ? anonymousVaultName(issuedNames.current) : fileStem(file.name) + '.shroud';
          setResult({ blob: new Blob([bytes], { type: 'application/octet-stream' }), name });
        } else {
          const restored = await decryptFile(new Uint8Array(await file.arrayBuffer()), password, signal);
          if (!signal.aborted) setResult({ blob: restored, name: restored.name });
        }
      } catch (error) {
        if (signal.aborted) return;
        const detail = error instanceof Error ? error.message : '';
        setMessage(detail.includes('Authentication failed') ? 'auth' : detail.includes('container header') ? 'header' : 'crypto');
      }
    });
  }

  return <div className="workspace-grid">
    <section className="panel">
      <PanelHeading icon={<FileLock2 size={19} />} title={t('本地文件', 'Local file')}
        action={<div className="actions">
          {(file || password || confirmation || result || busy) &&
            <button type="button" className="button secondary small" data-testid="vault-clear" onClick={clearSession}>
              <X size={15} />{t('清空会话', 'Clear session')}
            </button>}
          <button type="button" className="button ghost small" data-testid="vault-sample" disabled={!!busy}
            onClick={() => load(new File([sampleContract], '虚构租房合同样本.txt', { type: 'text/plain' }), true)}>
            <Sparkles size={15} />{t('加载虚构合同样本', 'Load synthetic contract')}
          </button>
        </div>} />
      <div className="panel-body preview-body">
        <div className="mode-toggle">
          <button type="button" disabled={!!busy} data-testid="vault-encrypt" aria-pressed={encrypting} onClick={() => changeMode('encrypt')}>
            <LockKeyhole size={16} />{t('加密文件', 'Encrypt file')}</button>
          <button type="button" disabled={!!busy} data-testid="vault-decrypt" aria-pressed={!encrypting} onClick={() => changeMode('decrypt')}>
            <UnlockKeyhole size={16} />{t('解密还原', 'Decrypt file')}</button>
        </div>
        <FilePicker id="vault-file" t={t} disabled={!!busy} onFiles={files => load(files[0])}>
          <strong>{t('拖放文件到这里', 'Drop a file here')}</strong>
          <span>{t('支持任意文件类型 · 自动识别 .shroud', 'Any file type · Auto-detects .shroud')}</span>
        </FilePicker>
        {file && <FileLine file={file} />}
        {result ? <div className="verification-card vault-result">
          <div><ShieldCheck size={20} /><strong>{encrypting ? t('文件已加密', 'File encrypted') : t('文件已通过验证并还原', 'File authenticated and restored')}</strong></div>
          <p>{result.name}</p>
          <div className="actions">
            <button type="button" className="button primary" data-testid="vault-download" onClick={() => download(result)}>
              <Download size={16} />{encrypting ? t('下载 .shroud', 'Download .shroud') : t('下载原始文件', 'Download original file')}</button>
            {encrypting && <button type="button" className="button secondary" onClick={() => load(new File([result.blob], result.name, { type: result.blob.type }))}>
              <UnlockKeyhole size={15} />{t('解密此输出', 'Decrypt this output')}</button>}
          </div>
        </div> : <EmptyState title={t('等待输出', 'Waiting for output')}
          note={encrypting ? t('原文件内容、文件名与类型一同加密。', 'File contents, name, and type are encrypted together.')
            : t('文件通过认证后才会生成可下载的原始文件。', 'The original file is available after authentication.')}
          icon={<LockKeyhole size={23} />} />}
      </div>
    </section>
    <div className="panel-stack">
      <section className="panel">
        <PanelHeading icon={<KeyRound size={19} />} title={t('访问密码', 'Access password')} />
        <form className="panel-body settings" autoComplete="off" onSubmit={event => { event.preventDefault(); void run(); }}>
          <label className="field">
            <span>{t('密码短语', 'Passphrase')}</span>
            <span className="password-field">
              <input type={shown ? 'text' : 'password'} data-testid="vault-password" value={password}
                disabled={!!busy} autoComplete="off" spellCheck={false} autoCapitalize="none"
                onChange={event => { setPassword(event.target.value); setGenerated(false); setMessage(undefined); }} />
              <button type="button" className="icon-button" aria-label={shown ? t('隐藏密码', 'Hide password') : t('显示密码', 'Show password')}
                title={shown ? t('隐藏密码', 'Hide password') : t('显示密码', 'Show password')} onClick={() => setShown(!shown)}>
                {shown ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </span>
          </label>
          {encrypting && <>
            <div className="strength" data-score={score}>
              <div className="strength-bars" aria-hidden="true">{[1, 2, 3, 4].map(level => <i key={level} className={score >= level ? 'filled' : ''} />)}</div>
              <div><span>{t('强度估计', 'Strength estimate')}</span><strong className="mono">{strength.bits} bits</strong></div>
              {password && score <= 2 && <small>{strength.predictable ? t('检测到常见或重复模式。', 'Common or repeated pattern detected.')
                : t('增加长度，或生成随机密码短语。', 'Use a longer phrase or generate one at random.')}</small>}
            </div>
            <label className="field"><span>{t('确认密码', 'Confirm password')}</span>
              <input type={shown ? 'text' : 'password'} data-testid="vault-confirm" value={confirmation}
                disabled={!!busy} autoComplete="off" spellCheck={false} autoCapitalize="none"
                onChange={event => { setConfirmation(event.target.value); setMessage(undefined); }} />
            </label>
            <div className="actions">
              <button type="button" className="button secondary" data-testid="vault-generate" disabled={!!busy} onClick={generate}>
                <Sparkles size={16} />{t('生成强密码短语', 'Generate strong passphrase')}</button>
              <button type="button" className="button ghost" disabled={!password || !!busy} onClick={copyPassword}>
                <ClipboardCopy size={16} />{t('复制', 'Copy')}</button>
            </div>
            <label className="check-row">
              <input type="checkbox" data-testid="vault-anonymous" checked={anonymous} disabled={!!busy}
                onChange={event => { setAnonymous(event.target.checked); clearResult(); }} />
              {t('匿名文件名（推荐）', 'Anonymous filename (recommended)')}
            </label>
          </>}
          <button type="submit" className="button primary" data-testid="vault-run" disabled={!file || !password || (encrypting && !confirmation) || !!busy}>
            {encrypting ? <LockKeyhole size={16} /> : <UnlockKeyhole size={16} />}
            {busy === 'file' ? t('正在派生密钥并处理…', 'Deriving key and processing…') : encrypting ? t('加密文件', 'Encrypt file') : t('解密还原', 'Decrypt file')}
          </button>
          <Status error={message !== 'copied'} testId={message === 'copied' ? 'vault-status' : 'vault-error'}>
            {message ? status[message] : undefined}
          </Status>
        </form>
      </section>
      <section className="panel">
        <PanelHeading icon={<Fingerprint size={18} />} title={t('加密参数', 'Cryptographic parameters')} />
        <div className="panel-body settings">
          <dl className="facts"><div><dt>{t('认证加密', 'Authenticated cipher')}</dt><dd>AES-256-GCM</dd></div>
            <div><dt>{t('密钥派生', 'Key derivation')}</dt><dd>PBKDF2-SHA256 · 600k</dd></div>
            <div><dt>{t('认证容器头', 'Authenticated header')}</dt><dd>37 B AAD</dd></div></dl>
        </div>
      </section>
    </div>
  </div>;
}
