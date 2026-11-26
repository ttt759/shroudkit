import assert from 'node:assert/strict';
import test from 'node:test';
import { restoreText, scrubText, syntheticLog } from '../src/core/scrubber';

test('valid resident ID and Luhn card match while invalid values are preserved', () => {
  const input = '11010519491231002X 110105194912310021 110105200102300021 4111 1111 1111 1111 4111111111111112 999138123456789';
  const result = scrubText(input);
  assert.equal(result.counts.ID, 1);
  assert.equal(result.counts.CARD, 1);
  assert.equal(result.counts.PHONE, 0);
  for (const value of ['110105194912310021', '110105200102300021', '4111111111111112']) {
    assert.ok(result.text.includes(value));
  }
});

test('sample identifies required API tokens and preserves the invalid-ID order', () => {
  const result = scrubText(syntheticLog, { keywords: '星桥实验室' });
  assert.equal(result.counts.ID, 1);
  assert.equal(result.counts.CARD, 1);
  assert.equal(result.counts.API_KEY, 4);
  assert.equal(result.counts.CUSTOM, 1);
  assert.ok(result.text.includes('999999199602190020'));
});

test('IPv4, compressed IPv6, IPv4-mapped IPv6 and international phone validate', () => {
  const result = scrubText('192.0.2.41 [::1]:80 2001:db8::7 ::ffff:192.0.2.1 999.0.0.1 1::2::3 +44 7700 900123');
  assert.equal(result.counts.IP, 4);
  assert.equal(result.counts.PHONE, 1);
  assert.ok(result.text.includes('999.0.0.1'));
  assert.ok(result.text.includes('1::2::3'));
});

test('stable tokens, literal token collisions, disabled categories and masks', () => {
  const original = 'a@demo.invalid, 13812345678, 13812345678, [PHONE_1]';
  const result = scrubText(original);
  assert.equal(result.text, '[EMAIL_1], [PHONE_2], [PHONE_2], [PHONE_1]');
  assert.deepEqual(scrubText(original).mapping, result.mapping);
  assert.equal(restoreText(result.text, result.mapping), original);
  assert.equal(scrubText(original, { disabled: new Set(['PHONE']) }).counts.PHONE, 0);
  const masked = scrubText(original, { mode: 'mask' });
  assert.match(masked.text, /138\*{4}5678/);
  assert.equal(masked.mapping.length, 0);
});

test('formatted Mainland phones and five-group Luhn cards are detected and restored exactly', () => {
  const input = '138-1234-5678, 138 1234 5678, 6222 0210 0112 3456 789, 6222-0210-0112-3456-789, 6222-0210-0112-3456-788, 9138-1234-5678';
  const result = scrubText(input);
  assert.equal(result.counts.PHONE, 2);
  assert.equal(result.counts.CARD, 2);
  assert.equal(result.text, '[PHONE_1], [PHONE_2], [CARD_1], [CARD_2], 6222-0210-0112-3456-788, 9138-1234-5678');
  assert.equal(restoreText(result.text, result.mapping), input);
});

test('irreversible masking keeps readable context while removing each sensitive value', () => {
  const input = '11010519491231002X, 138-1234-5678, 4111111111111111, qa@example.invalid, 192.0.2.41, 2001:db8::7, sk-demo_FAKE_KEY_2026, Bearer eyJ.eyJ.a, 星桥实验室';
  const masked = scrubText(input, { mode: 'mask', keywords: '星桥实验室' });
  assert.equal(masked.text, '1101**********002X, 138****5678, 4111 **** **** 1111, q***@example.invalid, 192.***.***.41, [IP_MASKED], sk-d***2026, [REDACTED], [REDACTED]');
  assert.deepEqual(masked.mapping, []);
});
