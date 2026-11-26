export const categories = ['ID', 'PHONE', 'CARD', 'EMAIL', 'IP', 'API_KEY', 'CUSTOM'] as const;
export type Category = typeof categories[number];
export type Mapping = { token: string; value: string; category: Category };
type Match = { start: number; end: number; value: string; category: Category };
type Options = { disabled?: Set<Category>; keywords?: string; mode?: 'reversible' | 'mask' };

const idWeights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];

export function validResidentId(value: string) {
  if (!/^[1-9]\d{16}[\dXx]$/.test(value)) return false;
  const year = Number(value.slice(6, 10));
  const month = Number(value.slice(10, 12));
  const day = Number(value.slice(12, 14));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1800 || date.getTime() > Date.now()
    || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  const sum = idWeights.reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
  return value[17].toUpperCase() === '10X98765432'[sum % 11];
}

export function validCard(value: string) {
  const digits = value.replace(/[ -]/g, '');
  if (!/^\d{16,19}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    const digit = Number(digits[i]) * ((digits.length - i) % 2 ? 1 : 2);
    sum += digit > 9 ? digit - 9 : digit;
  }
  return sum % 10 === 0;
}

function validIPv4(value: string) {
  return value.split('.').length === 4 && value.split('.').every(octet => /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) < 256);
}

function validIPv6(value: string) {
  if (value.split(':').length < 3) return false;
  try {
    new URL('http://[' + value + ']/');
    return true;
  } catch {
    return false;
  }
}

const rules: { category: Category; pattern: RegExp; validate?: (value: string) => boolean }[] = [
  { category: 'API_KEY', pattern: /\b(?:Bearer[ \t]+)?eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+(?![\w-])/gi },
  { category: 'API_KEY', pattern: /(?<![\w-])(?:sk-(?:proj-)?[A-Za-z0-9_-]{12,}|gh[po]_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,}|AIza[A-Za-z0-9_-]{35}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{10,})(?![\w-])/g },
  { category: 'EMAIL', pattern: /(?<![\w.%+-])[A-Z0-9_%+-]+(?:\.[A-Z0-9_%+-]+)*@(?:[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?\.)+[A-Z]{2,63}(?![\w-])/gi },
  { category: 'ID', pattern: /(?<!\d)[1-9]\d{16}[0-9Xx](?!\d)/g, validate: validResidentId },
  { category: 'IP', pattern: /(?<![\w:.])(?:[a-f0-9]{0,4}:){2,}[a-f0-9:.]*(?![\w:])/gi, validate: validIPv6 },
  { category: 'IP', pattern: /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w]|\.\d)/g, validate: validIPv4 },
  { category: 'CARD', pattern: /(?<!\d)(?:\d{16,19}|\d{4}([- ])\d{4}\1\d{4}\1(?:\d{4}\1\d{1,3}|\d{4,7}))(?!\d)/g, validate: validCard },
  { category: 'PHONE', pattern: /(?<![\w+])\+[1-9]\d{0,2}(?:[ -]?\d){7,14}(?!\d)/g, validate: value => value.replace(/\D/g, '').length <= 15 },
  { category: 'PHONE', pattern: /(?<!\d)1[3-9]\d(?:\d{8}|([ -])\d{4}\1\d{4})(?!\d)/g },
];

function collectMatches(input: string, options: Options) {
  const blocked = new Uint8Array(input.length);
  const matches: Match[] = [];
  function accept(value: string, start: number, category: Category) {
    const end = start + value.length;
    if (blocked.subarray(start, end).some(Boolean)) return;
    blocked.fill(1, start, end);
    matches.push({ start, end, value, category });
  }

  for (const { category, pattern, validate } of rules) {
    if (options.disabled?.has(category)) continue;
    for (const match of input.matchAll(pattern)) {
      const value = category === 'IP' && match[0].includes(':') ? match[0].replace(/\.+$/, '') : match[0];
      if (!validate || validate(value)) accept(value, match.index, category);
    }
  }

  if (!options.disabled?.has('CUSTOM')) {
    const keywords = [...new Set((options.keywords ?? '').split(/[,，\r\n]+/).map(word => word.trim()).filter(Boolean))];
    keywords.sort((a, b) => b.length - a.length);
    for (const keyword of keywords) {
      let offset = input.indexOf(keyword);
      while (offset !== -1) {
        accept(keyword, offset, 'CUSTOM');
        offset = input.indexOf(keyword, offset + keyword.length);
      }
    }
  }
  return matches.sort((a, b) => a.start - b.start);
}

function maskValue(category: Category, value: string) {
  switch (category) {
    case 'PHONE': {
      const digits = value.replace(/\D/g, '');
      const prefix = value.startsWith('+') ? '+' : '';
      return prefix + digits.slice(0, 3) + '****' + digits.slice(-4);
    }
    case 'CARD': {
      const digits = value.replace(/[ -]/g, '');
      const middle = '*'.repeat(digits.length - 8).match(/.{1,4}/g) ?? [];
      return [digits.slice(0, 4), ...middle, digits.slice(-4)].join(' ');
    }
    case 'ID':
      return value.slice(0, 4) + '*'.repeat(10) + value.slice(-4);
    case 'EMAIL': {
      const [local, domain] = value.split('@');
      return (local.length > 1 ? local[0] : '') + '***@' + domain;
    }
    case 'IP': {
      if (value.includes(':')) return '[IP_MASKED]';
      const octets = value.split('.');
      return octets[0] + '.***.***.' + octets[3];
    }
    case 'API_KEY': {
      const prefix = /^Bearer[ \t]+/i.exec(value)?.[0] ?? '';
      const token = value.slice(prefix.length);
      return token.length >= 12 ? prefix + token.slice(0, 4) + '***' + token.slice(-4) : '[REDACTED]';
    }
    default:
      return '[REDACTED]';
  }
}

export function scrubText(input: string, options: Options = {}) {
  const counts = { ID: 0, PHONE: 0, CARD: 0, EMAIL: 0, IP: 0, API_KEY: 0, CUSTOM: 0 };
  const sequences = { ...counts };
  const reserved = new Set(input.match(/\[(?:ID|PHONE|CARD|EMAIL|IP|API_KEY|CUSTOM)_\d+\]/g));
  const entries = new Map<string, Mapping>();
  const parts: string[] = [];
  let cursor = 0;

  for (const { start, end, value, category } of collectMatches(input, options)) {
    counts[category]++;
    parts.push(input.slice(cursor, start));
    cursor = end;
    if (options.mode === 'mask') {
      parts.push(maskValue(category, value));
      continue;
    }
    const key = category + '\0' + value;
    let entry = entries.get(key);
    if (!entry) {
      let token: string;
      do { token = '[' + category + '_' + ++sequences[category] + ']'; } while (reserved.has(token));
      entry = { token, value, category };
      entries.set(key, entry);
    }
    parts.push(entry.token);
  }

  parts.push(input.slice(cursor));
  return { text: parts.join(''), counts, mapping: [...entries.values()] };
}

export function restoreText(input: string, mapping: Mapping[]) {
  const values = new Map(mapping.map(entry => [entry.token, entry.value]));
  return input.replace(/\[(?:ID|PHONE|CARD|EMAIL|IP|API_KEY|CUSTOM)_\d+\]/g, token => values.get(token) ?? token);
}

export const syntheticLog = `[演示事故日志 / SYNTHETIC INCIDENT LOG]
2026-11-26 · 星桥实验室 · 工单 SK-042
客户证件 / ID: 999999199602190024
联系电话 / Mobile: 13812345678
测试卡号 / Test card: 4111 1111 1111 1111
收件邮箱 / Email: qa@example.invalid
访问来源 / Client IP: 192.0.2.41
环境变量 / Environment:
sk-demo_FAKE_KEY_only_for_shroudkit_2026
ghp_FAKEONLYSHROUDKIT00000000000000000000
AIza${'0'.repeat(35)}
Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJkZW1vIn0.FAKESIGNATURE
订单编号 / Order reference: 999999199602190020
回拨联系人 / Callback: 13812345678`;
