export type Language = 'zh' | 'en';
export type T = (zh: string, en: string) => string;

export function translator(language: Language): T {
  return (zh, en) => language === 'zh' ? zh : en;
}

export function localDate() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, '0')).join('-');
}

export function sizeLabel(size: number) {
  if (size < 1024) return size + ' B';
  if (size < 1024 ** 2) return (size / 1024).toFixed(1) + ' KB';
  return (size / (1024 ** 2)).toFixed(1) + ' MB';
}
