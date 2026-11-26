import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptFile, encryptFile, HEADER_BYTES, ITERATIONS } from '../src/core/vault';

const raw = new Uint8Array([0, 255, 1, 2, 3, 7, 10, 234]);
const file = new File([raw], '虚构合同.pdf', { type: 'application/pdf', lastModified: 1700000000000 });
const password = 'synthetic sample only - 7e92';
const encrypted = encryptFile(file, password);

test('AES-GCM restores original file and all encrypted metadata', async () => {
  const container = await encrypted;
  const header = new DataView(container.buffer);
  assert.equal(new TextDecoder().decode(container.subarray(0, 4)), 'SHRD');
  assert.equal(container[4], 1);
  assert.equal(header.getUint32(5), ITERATIONS);
  assert.equal(ITERATIONS, 600_000);
  assert.equal(HEADER_BYTES, 37);
  assert.ok(!new TextDecoder().decode(container).includes(file.name));
  const result = await decryptFile(container, password);
  assert.equal(result.name, file.name);
  assert.equal(result.type, file.type);
  assert.equal(result.lastModified, file.lastModified);
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), raw);
});

test('wrong password and mutations of every header field or ciphertext are rejected', async () => {
  const container = await encrypted;
  await assert.rejects(decryptFile(container, 'wrong password'), /authentication/i);
  for (const position of [0, 4, 8, 9, 25, 37, container.length - 1]) {
    const changed = container.slice();
    changed[position] ^= 1;
    await assert.rejects(decryptFile(changed, password));
  }
});

test('fresh encryption uses an independent salt and IV', async () => {
  const [first, second] = await Promise.all([encrypted, encryptFile(file, password)]);
  assert.notDeepEqual(first.subarray(9, 25), second.subarray(9, 25));
  assert.notDeepEqual(first.subarray(25, 37), second.subarray(25, 37));
});
