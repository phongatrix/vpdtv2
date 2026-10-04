/**
 * tests/credentials.test.ts
 * Unit test cho module mã hóa credential — không gọi network
 * Gate Stage 1: test phải xanh
 */

import { describe, test, expect, beforeAll } from 'vitest';

// Set env trước khi import module
beforeAll(() => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = 'a'.repeat(64); // 64-char hex (32 bytes)
});

// Import sau khi set env
import { encrypt, decrypt, testEncryptionRoundTrip } from '../src/lib/credentials';

describe('Credential Encryption (AES-256-GCM)', () => {
  test('encrypt produces non-empty string', () => {
    const result = encrypt('hello world');
    expect(result).toBeTruthy();
    expect(result).not.toBe('hello world');
  });

  test('encrypt produces iv:authTag:ciphertext format', () => {
    const result = encrypt('test value');
    const parts = result.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0].length).toBeGreaterThan(0); // IV
    expect(parts[1].length).toBeGreaterThan(0); // AuthTag
    expect(parts[2].length).toBeGreaterThan(0); // Ciphertext
  });

  test('decrypt reverses encrypt (round-trip)', () => {
    const original = 'mật khẩu bí mật 123!@#';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  test('round-trip works for empty string', () => {
    const encrypted = encrypt('');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe('');
  });

  test('round-trip works for long string (URL/token)', () => {
    const longValue = 'a'.repeat(1000);
    expect(testEncryptionRoundTrip(longValue)).toBe(true);
  });

  test('round-trip works for special characters', () => {
    const special = 'token: "abc123"; cookie=xyz; charset=utf-8; 日本語; emoji🎉';
    expect(testEncryptionRoundTrip(special)).toBe(true);
  });

  test('two encryptions of same plaintext produce different ciphertext (random IV)', () => {
    const value = 'same plaintext';
    const enc1 = encrypt(value);
    const enc2 = encrypt(value);
    expect(enc1).not.toBe(enc2); // Random IV mỗi lần
  });

  test('decrypt throws on invalid format', () => {
    expect(() => decrypt('invalid-format')).toThrow();
  });

  test('testEncryptionRoundTrip returns true for valid plaintext', () => {
    expect(testEncryptionRoundTrip('vpdt username 311589430')).toBe(true);
    expect(testEncryptionRoundTrip('session=abc123; path=/')).toBe(true);
  });
});
