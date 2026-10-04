// src/lib/db.ts
// Database layer — SQLite via @libsql/client (Turso) hoặc file local cho dev

import { createClient, InArgs } from '@libsql/client';

let _client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (_client) return _client;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  _client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  return _client;
}

let _initPromise: Promise<void> | null = null;

async function ensureDb() {
  if (!_initPromise) {
    _initPromise = (async () => {
      const client = getClient();
      await client.batch([
        {
          sql: `CREATE TABLE IF NOT EXISTS credentials (
            id TEXT PRIMARY KEY,
            service TEXT NOT NULL,
            key_name TEXT NOT NULL,
            value_encrypted TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(service, key_name)
          )`,
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            so_van_ban TEXT,
            tieu_de TEXT NOT NULL,
            ngay TEXT,
            url TEXT UNIQUE NOT NULL,
            drive_file_id TEXT,
            email_sent_at TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL
          )`,
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            status TEXT NOT NULL DEFAULT 'running',
            stage_reached TEXT,
            new_count INTEGER DEFAULT 0,
            uploaded_count INTEGER DEFAULT 0,
            emailed_count INTEGER DEFAULT 0,
            telegram_ok INTEGER DEFAULT 0,
            error TEXT
          )`,
        },
        {
          sql: `CREATE TABLE IF NOT EXISTS stage_events (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            stage TEXT NOT NULL,
            status TEXT NOT NULL,
            detail TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (run_id) REFERENCES runs(id)
          )`,
        },
      ], 'write');
    })();
  }
  return _initPromise;
}

export const db = {
  execute: async (sql: string, args?: InArgs) => {
    await ensureDb();
    const client = getClient();
    return client.execute({ sql, args: args ?? [] });
  },
  batch: async (statements: { sql: string; args?: InArgs }[]) => {
    await ensureDb();
    const client = getClient();
    return client.batch(
      statements.map((s) => ({ sql: s.sql, args: s.args ?? [] })),
      'write'
    );
  },
};

export async function initializeDatabase() {
  await ensureDb();
}
