// src/lib/credentials.ts
// Module mã hóa/giải mã credential dùng AES-256-GCM
// Mọi password/token/session đi qua đây trước khi lưu DB

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { db } from './db';
import { v4 as uuidv4 } from 'uuid';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error(
      'CREDENTIALS_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). ' +
      'Generate with: openssl rand -hex 32'
    );
  }
  return Buffer.from(key, 'hex');
}

/**
 * Mã hóa plaintext → base64 string (iv:authTag:ciphertext)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: base64(iv):base64(authTag):base64(ciphertext)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Giải mã chuỗi mã hóa → plaintext
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted credential format');
  const [ivB64, authTagB64, encryptedB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export type CredentialService = 'vpdt' | 'google' | 'telegram';

/**
 * Lưu credential vào DB (mã hóa AES-256-GCM)
 */
export async function saveCredential(
  service: CredentialService,
  keyName: string,
  value: string,
  status = 'active'
): Promise<void> {
  const encrypted = encrypt(value);
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO credentials (id, service, key_name, value_encrypted, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(service, key_name) DO UPDATE SET
       value_encrypted = excluded.value_encrypted,
       status = excluded.status,
       updated_at = excluded.updated_at`,
    [uuidv4(), service, keyName, encrypted, status, now, now]
  );
}

/**
 * Lấy credential từ DB (giải mã)
 */
export async function getCredential(
  service: CredentialService,
  keyName: string
): Promise<string | null> {
  const result = await db.execute(
    `SELECT value_encrypted FROM credentials WHERE service = ? AND key_name = ? AND status = 'active'`,
    [service, keyName]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as unknown as { value_encrypted: string };
  return decrypt(row.value_encrypted);
}

/**
 * Lấy tất cả credentials của một service (không trả về giá trị, chỉ metadata)
 */
export async function listCredentials(service: CredentialService) {
  const result = await db.execute(
    `SELECT id, service, key_name, status, created_at, updated_at
     FROM credentials WHERE service = ?`,
    [service]
  );
  return result.rows;
}

/**
 * Xóa credential (đổi status thành 'revoked', không xóa vật lý)
 */
export async function revokeCredential(
  service: CredentialService,
  keyName: string
): Promise<void> {
  await db.execute(
    `UPDATE credentials SET status = 'revoked', updated_at = ? WHERE service = ? AND key_name = ?`,
    [new Date().toISOString(), service, keyName]
  );
}

/**
 * Test mã hóa round-trip — dùng cho unit test
 */
export function testEncryptionRoundTrip(plaintext: string): boolean {
  const encrypted = encrypt(plaintext);
  const decrypted = decrypt(encrypted);
  return decrypted === plaintext;
}
