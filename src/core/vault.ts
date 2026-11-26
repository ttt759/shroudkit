import { localDate } from '../i18n';

export const HEADER_BYTES = 37;
export const ITERATIONS = 600_000;
const magic = new Uint8Array([83, 72, 82, 68]);
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

async function deriveKey(password: string, salt: Uint8Array, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const bytes = encoder.encode(password);
  let material: CryptoKey;
  try {
    material = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey']);
  } finally {
    bytes.fill(0);
  }
  signal?.throwIfAborted();
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

function parameters(header: Uint8Array): AesGcmParams {
  return { name: 'AES-GCM', iv: header.subarray(25, 37), additionalData: header, tagLength: 128 };
}

export async function encryptFile(file: File, password: string, signal?: AbortSignal) {
  if (!password) throw new Error('Empty password');
  signal?.throwIfAborted();
  const header = new Uint8Array(HEADER_BYTES);
  header.set(magic);
  header[4] = 1;
  new DataView(header.buffer).setUint32(5, ITERATIONS);
  crypto.getRandomValues(header.subarray(9, 25));
  crypto.getRandomValues(header.subarray(25, 37));

  const key = await deriveKey(password, header.subarray(9, 25), signal);
  signal?.throwIfAborted();
  const metadata = encoder.encode(JSON.stringify({
    name: file.name, type: file.type, size: file.size, createdAt: file.lastModified,
  }));
  const plaintext = new Uint8Array(4 + metadata.length + file.size);
  new DataView(plaintext.buffer).setUint32(0, metadata.length);
  plaintext.set(metadata, 4);
  try {
    const contents = new Uint8Array(await file.arrayBuffer());
    try {
      signal?.throwIfAborted();
      plaintext.set(contents, 4 + metadata.length);
    } finally {
      contents.fill(0);
    }
    const encrypted = await crypto.subtle.encrypt(parameters(header), key, plaintext);
    signal?.throwIfAborted();
    const container = new Uint8Array(HEADER_BYTES + encrypted.byteLength);
    container.set(header);
    container.set(new Uint8Array(encrypted), HEADER_BYTES);
    return container;
  } finally {
    plaintext.fill(0);
    metadata.fill(0);
  }
}

export async function decryptFile(bytes: Uint8Array, password: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const header = bytes.slice(0, HEADER_BYTES);
  if (bytes.length < HEADER_BYTES + 20 || !magic.every((value, index) => value === header[index])
    || header[4] !== 1 || new DataView(header.buffer).getUint32(5) !== ITERATIONS) {
    throw new Error('Invalid or unsupported Shroud container header');
  }

  const key = await deriveKey(password, header.subarray(9, 25), signal);
  signal?.throwIfAborted();
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(parameters(header), key, bytes.subarray(HEADER_BYTES));
  } catch {
    throw new Error('Authentication failed: wrong password or modified file');
  }

  try {
    signal?.throwIfAborted();
    const size = new DataView(plaintext).getUint32(0);
    if (size < 2 || size > plaintext.byteLength - 4) throw new Error('Invalid metadata length');
    const metadata = JSON.parse(decoder.decode(new Uint8Array(plaintext, 4, size)));
    const contents = new Uint8Array(plaintext, 4 + size);
    if (typeof metadata?.name !== 'string' || typeof metadata.type !== 'string'
      || !Number.isSafeInteger(metadata.createdAt) || metadata.size !== contents.length) {
      throw new Error('Invalid encrypted metadata');
    }
    return new File([contents], metadata.name, { type: metadata.type, lastModified: metadata.createdAt });
  } finally {
    new Uint8Array(plaintext).fill(0);
  }
}

const passphraseAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function anonymousVaultName(issued: Set<string>) {
  const date = localDate().replaceAll('-', '');
  const [random] = crypto.getRandomValues(new Uint16Array(1));
  for (let offset = 0; offset < 65536; offset++) {
    const suffix = ((random + offset) & 0xffff).toString(16).padStart(4, '0');
    const name = 'sealed-' + date + '-' + suffix + '.shroud';
    if (!issued.has(name)) {
      issued.add(name);
      return name;
    }
  }
  throw new Error('No anonymous filenames left for this date');
}

export function generatePassphrase() {
  const random = crypto.getRandomValues(new Uint8Array(24));
  return Array.from({ length: 6 }, (_, group) =>
    Array.from(random.subarray(group * 4, group * 4 + 4), byte => passphraseAlphabet[byte & 31]).join(''),
  ).join('-');
}

export function estimatePassword(password: string, generated: boolean) {
  if (generated) return { bits: 120, predictable: false };
  const pools = [/\p{Ll}/u, /\p{Lu}/u, /[0-9]/, /[^\p{L}\p{N}\s]/u, /[^\x00-\x7f]/, /\s/];
  const alphabet = pools.reduce((total, regex, i) => total + (regex.test(password) ? [26, 26, 10, 32, 50, 1][i] : 0), 0);
  const predictable = /password|qwerty|1234|abcd|letmein|(.{1,4})\1{2,}/i.test(password);
  const estimate = Math.floor(Array.from(password).length * Math.log2(Math.max(1, alphabet)));
  return { bits: predictable ? Math.min(24, estimate) : estimate, predictable };
}

export const sampleContract = '【虚构样本 · 禁止作为真实合同使用】\n\n星桥实验室场地租赁演示合同\n甲方：演示出租方　乙方：演示承租方\n用途：验证 ShroudKit 文件加密及还原。\n日期：2026-11-26\n';
