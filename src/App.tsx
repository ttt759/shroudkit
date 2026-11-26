import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Braces, Check, CircleAlert, Fingerprint, Globe2, ImageOff, LockKeyhole, Moon, ScanLine, Shield, ShieldCheck, Sun } from 'lucide-react';
import { Metadata } from './tools/Metadata';
import { Scrubber } from './tools/Scrubber';
import { Vault } from './tools/Vault';
import { Watermark } from './tools/Watermark';
import { translator, type Language, type T } from './i18n';

const tools = ['watermark', 'metadata', 'vault', 'scrubber'] as const;
const logo = import.meta.env.BASE_URL + 'favicon.svg';
const languageKey = 'shroudkit-language';
const themeKey = 'shroudkit-theme';

function stored(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function savePreference(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* The current page still uses the selected preference. */ }
}

function useNetworkAudit() {
  const [external, setExternal] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    function refreshNetwork() { setOnline(navigator.onLine); }
    function isExternal(entry: PerformanceEntry) {
      try {
        const url = new URL(entry.name);
        return /^(https?|wss?):$/.test(url.protocol) && url.origin !== location.origin;
      } catch { return false; }
    }
    performance.setResourceTimingBufferSize(2_000);
    const previous = performance.getEntriesByType('resource');
    let count = previous.filter(isExternal).length;
    setExternal(count);
    const observer = new PerformanceObserver(list => {
      count += list.getEntries().filter(isExternal).length;
      setExternal(count);
    });
    observer.observe({ entryTypes: ['resource'] });
    addEventListener('online', refreshNetwork);
    addEventListener('offline', refreshNetwork);
    return () => {
      observer.disconnect();
      removeEventListener('online', refreshNetwork);
      removeEventListener('offline', refreshNetwork);
    };
  }, []);
  return { external, online };
}

function NetworkShield({ t }: { t: T }) {
  const { external, online } = useNetworkAudit();
  const policy = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content');
  const details = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (details.current && event.target instanceof Node && !details.current.contains(event.target)) details.current.open = false;
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape' && details.current?.open) {
        details.current.open = false;
        details.current.querySelector('summary')?.focus();
      }
    }
    addEventListener('pointerdown', dismiss);
    addEventListener('keydown', escape);
    return () => { removeEventListener('pointerdown', dismiss); removeEventListener('keydown', escape); };
  }, []);

  return <details className="network" ref={details}>
    <summary className={'network-trigger' + (external ? ' network-alert' : '')} data-testid="shield">
      {external ? <CircleAlert size={17} /> : <ShieldCheck size={17} />}
      <span className="network-label">{external ? t('检测到外部请求', 'External requests detected') : t('零外部请求', 'Zero external requests')}</span>
      <span className="network-count mono">{external}</span>
      <span className="network-online" data-testid="offline-status" title={t('浏览器连接状态', 'Browser connection status')}>
        <i />{online ? t('在线', 'Online') : t('离线', 'Offline')}</span>
    </summary>
    <div className="audit-popover">
      <h2><Shield size={17} />{t('安全审计', 'Security audit')}</h2>
      <dl className="facts">
        <div><dt>{t('已观测外部请求', 'Observed external requests')}</dt><dd data-testid="audit-count">{external}</dd></div>
        <div><dt>{t('文件加密', 'File encryption')}</dt><dd>AES-256-GCM</dd></div>
        <div><dt>{t('密钥派生', 'Key derivation')}</dt><dd>PBKDF2-SHA256 600k</dd></div>
      </dl>
      <h3>{t('内容安全策略', 'Content Security Policy')}</h3>
      <code data-testid="audit-policy">{policy ?? t('页面没有声明 CSP。', 'No CSP declared by the page.')}</code>
    </div>
  </details>;
}

function ShieldArt() {
  return <svg className="hero-art" viewBox="0 0 480 230" fill="none" aria-hidden="true">
    <defs>
      <pattern id="instrument-grid" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M24 0H0v24" stroke="currentColor" strokeOpacity=".16" />
      </pattern>
      <linearGradient id="shield-fill" x1="196" y1="46" x2="326" y2="199" gradientUnits="userSpaceOnUse">
        <stop stopColor="#51e3b0" stopOpacity=".24" /><stop offset="1" stopColor="#159a79" stopOpacity=".02" />
      </linearGradient>
      <radialGradient id="grid-mask">
        <stop offset=".42" stopColor="white" /><stop offset="1" stopColor="white" stopOpacity="0" />
      </radialGradient>
      <mask id="art-fade"><rect width="480" height="230" fill="url(#grid-mask)" /></mask>
    </defs>
    <g mask="url(#art-fade)">
      <path d="M0 0h480v230H0z" fill="url(#instrument-grid)" />
      <path d="M0 115h480M240 0v230" stroke="currentColor" strokeOpacity=".27" strokeDasharray="3 5" />
      <circle cx="240" cy="115" r="107" stroke="currentColor" strokeOpacity=".26" />
      <circle cx="240" cy="115" r="85" stroke="currentColor" strokeOpacity=".21" strokeDasharray="2 5" />
      <path d="M90 77h36l35 26h34m90-11h63l24-22h48M90 166h36l43-28h26m89 4h65l27 23h53" stroke="currentColor" strokeOpacity=".49" />
      <path d="M125 58v12m-6-6h12m230 119v12m-6-6h12m-7-134v10m-5-5h10m-223 120v10m-5-5h10" stroke="currentColor" strokeOpacity=".67" />
    </g>
    <path d="m240 30 72 30v48c0 49-30 75-72 98-42-23-72-49-72-98V60l72-30Z" fill="url(#shield-fill)" stroke="currentColor" strokeOpacity=".75" />
    <path d="m240 43 61 25v40c0 40-25 65-61 86-36-21-61-46-61-86V68l61-25Z" stroke="currentColor" strokeOpacity=".36" />
    <path d="m240 66 42 60-42 32-42-32 42-60Z" fill="currentColor" fillOpacity=".14" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round" />
    <path d="M240 66v92l42-32-42-19-42 19" fill="currentColor" fillOpacity=".15" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <circle cx="240" cy="107" r="3.1" fill="currentColor" />
    <circle cx="240" cy="30" r="2" fill="currentColor" /><circle cx="240" cy="206" r="2" fill="currentColor" />
  </svg>;
}

export function App() {
  const [language, setLanguage] = useState<Language>(() => stored(languageKey) === 'en' ? 'en' : 'zh');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => stored(themeKey) === 'light' ? 'light' : 'dark');
  const [tool, setTool] = useState<typeof tools[number]>('watermark');
  const t = translator(language);
  const names = {
    watermark: { short: t('证件水印', 'ID watermark'), icon: ScanLine, tag: t('实时画布', 'Live canvas'),
      title: t('证件防盗斜纹水印', 'ID Watermark Shield'),
      detail: t('在发送证件前，叠加带用途和日期的斜纹水印。', 'Add a tiled watermark with its intended use and date before sharing an ID image.') },
    metadata: { short: t('照片隐私', 'Photo metadata'), icon: ImageOff, tag: 'EXIF / GPS',
      title: t('照片隐私体检与净化', 'Photo Metadata Inspector'),
      detail: t('检查位置、设备和注释等隐藏元数据，清理后复查输出。', 'Find hidden location, device, and comment metadata, then audit the cleaned file.') },
    vault: { short: t('文件加密', 'File vault'), icon: LockKeyhole, tag: 'AES-256-GCM',
      title: t('本地文件加密锁', 'Local File Vault'),
      detail: t('加密文件内容、文件名和类型，或用密码还原已验证的 .shroud 文件。', 'Seal file contents, name, and type, or restore an authenticated .shroud file with its passphrase.') },
    scrubber: { short: t('文本脱敏', 'Text scrubber'), icon: Braces, tag: t('可逆映射', 'Reversible'),
      title: t('敏感文本脱敏与还原', 'Sensitive Text Scrubber'),
      detail: t('在分享日志、邮件或合同时替换敏感字段，并按需还原占位符。', 'Replace sensitive values before sharing logs, emails, or contracts, then restore placeholders when needed.') },
  };

  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.title = 'ShroudKit · ' + (language === 'zh' ? '离线隐私工作台' : 'Offline privacy workbench');
  }, [language]);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  function chooseLanguage(next: Language) {
    setLanguage(next);
    savePreference(languageKey, next);
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    savePreference(themeKey, next);
  }

  return <>
    <header className="topbar">
      <div className="shell topbar-inner">
        <div className="brand"><img src={logo} width="38" height="38" alt="" /><span>Shroud<span>Kit</span></span></div>
        <div className="header-actions">
          <NetworkShield t={t} />
          <div className="header-preferences">
            <div className="language" role="group" aria-label={t('语言', 'Language')}>
              <Globe2 size={16} />
              <button type="button" data-testid="zh" aria-pressed={language === 'zh'} lang="zh-CN" onClick={() => chooseLanguage('zh')}>中文</button>
              <button type="button" data-testid="en" aria-pressed={language === 'en'} lang="en" onClick={() => chooseLanguage('en')}>EN</button>
            </div>
            <button className="icon-button theme-button" type="button" data-testid="theme-toggle" onClick={toggleTheme}
              aria-label={theme === 'dark' ? t('切换浅色主题', 'Switch to light theme') : t('切换深色主题', 'Switch to dark theme')}
              title={theme === 'dark' ? t('切换浅色主题', 'Switch to light theme') : t('切换深色主题', 'Switch to dark theme')}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </div>
    </header>

    <main className="shell">
      <div className="hero">
        <div className="hero-content">
          <div className="hero-label"><ShieldCheck size={17} />{t('离线隐私工作台', 'Offline privacy workbench')}</div>
          <h1>{t('把隐私留在本机。', 'Keep your private data local.')}</h1>
          <p>{t('证件水印、照片净化、文件加密、文本脱敏。所有处理都在浏览器内完成。', 'Watermark IDs, strip photo metadata, encrypt files, and scrub text entirely in your browser.')}</p>
        </div>
        <ShieldArt />
      </div>

      <nav className="workspace-nav" aria-label={t('隐私工具', 'Privacy tools')}>
        {tools.map(key => {
          const Icon = names[key].icon;
          return <button type="button" className="tool-nav" data-testid={'nav-' + key} key={key}
            aria-current={tool === key ? 'page' : undefined} onClick={() => setTool(key)}>
            <span className="nav-icon"><Icon size={21} /></span>
            <span className="nav-text"><strong>{names[key].short}</strong><small>{names[key].tag}</small></span>
            {tool === key && <span className="nav-indicator"><ArrowUpRight size={15} /></span>}
          </button>;
        })}
      </nav>

      <div className="workspace-heading">
        <div><h2>{names[tool].title}</h2><p>{names[tool].detail}</p></div>
        <span className="tag local-tag"><Check size={15} />{t('本机处理', 'On-device processing')}</span>
      </div>
      <div hidden={tool !== 'watermark'}><Watermark t={t} active={tool === 'watermark'} /></div>
      <div hidden={tool !== 'metadata'}><Metadata t={t} active={tool === 'metadata'} /></div>
      <div hidden={tool !== 'vault'}><Vault t={t} /></div>
      <div hidden={tool !== 'scrubber'}><Scrubber t={t} /></div>

      <footer className="footer">
        <span><Fingerprint size={16} />ShroudKit</span>
        <span>{t('偏好保存在本机 · 文件和文本仅在当前会话中处理', 'Preferences stay on this device · Files and text are processed in this session')}</span>
      </footer>
    </main>
  </>;
}
