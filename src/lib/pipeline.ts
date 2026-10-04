// src/lib/pipeline.ts
// Orchestrator pipeline sync — emit stage_events, gọi Telegram theo từng bước

import { db } from './db';
import { telegram } from './telegram';
import { getActiveCookie } from './vpdt-client';
import { v4 as uuidv4 } from 'uuid';

export type StageStatus = 'STARTED' | 'DONE' | 'FAILED' | 'SKIPPED';

export interface StageEvent {
  runId: string;
  stage: string;
  status: StageStatus;
  detail?: string;
  createdAt: string;
}

/**
 * Tạo run mới trong DB
 */
async function createRun(): Promise<string> {
  const runId = `run_${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}`;
  await db.execute(
    `INSERT INTO runs (id, started_at, status) VALUES (?, ?, ?)`,
    [runId, new Date().toISOString(), 'running']
  );
  return runId;
}

/**
 * Emit stage event vào DB + Telegram
 */
async function emitStage(
  runId: string,
  stage: string,
  status: StageStatus,
  detail?: string
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO stage_events (id, run_id, stage, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), runId, stage, status, detail ?? null, now]
  );

  // Cập nhật stage_reached trong run
  await db.execute(`UPDATE runs SET stage_reached = ? WHERE id = ?`, [stage, runId]);

  // Gửi Telegram (không throw nếu fail)
  if (status === 'STARTED') {
    await telegram.notifyStage(runId, stage, 'STARTED', detail);
  } else if (status === 'DONE') {
    await telegram.notifyStage(runId, stage, 'DONE', detail);
  } else if (status === 'FAILED') {
    await telegram.notifyStage(runId, stage, 'FAILED', detail);
  }
}

/**
 * Cập nhật run khi hoàn tất
 */
async function finishRun(
  runId: string,
  status: 'completed' | 'failed',
  stats: {
    newCount: number;
    uploadedCount: number;
    emailedCount: number;
    telegramOk: boolean;
    error?: string;
  }
): Promise<void> {
  await db.execute(
    `UPDATE runs SET finished_at = ?, status = ?, new_count = ?, uploaded_count = ?,
     emailed_count = ?, telegram_ok = ?, error = ? WHERE id = ?`,
    [
      new Date().toISOString(),
      status,
      stats.newCount,
      stats.uploadedCount,
      stats.emailedCount,
      stats.telegramOk ? 1 : 0,
      stats.error ?? null,
      runId,
    ]
  );
}

/**
 * Pipeline chính — chạy đầy đủ 6 stage
 */
export async function runSyncPipeline(): Promise<{
  runId: string;
  status: 'completed' | 'failed';
  stats: Record<string, number>;
}> {
  const runId = await createRun();
  await telegram.notifyStart(runId);

  let newCount = 0;
  const uploadedCount = 0;
  const emailedCount = 0;
  let scrapedCount = 0;

  try {
    // ── Stage 1: Login VPĐT ─────────────────────────────────────────
    await emitStage(runId, 'Login VPĐT', 'STARTED');
    const cookie = await getActiveCookie();
    if (!cookie) {
      await emitStage(runId, 'Login VPĐT', 'FAILED', 'Chưa có session cookie. Vui lòng cấu hình tại /onboarding.');
      throw new Error('Không có VPDT session cookie');
    }
    await emitStage(runId, 'Login VPĐT', 'DONE', 'Đã lấy session cookie');

    // ── Stage 2: Scrape danh sách văn bản ───────────────────────────
    await emitStage(runId, 'Scrape Documents', 'STARTED');
    // Import lazy để tránh circular
    const { scrapeDocumentList } = await import('./vpdt-client');
    let docs = [];
    try {
      docs = await scrapeDocumentList(cookie, 1);
      scrapedCount = docs.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await emitStage(runId, 'Scrape Documents', 'FAILED', msg);
      throw err;
    }
    await emitStage(runId, 'Scrape Documents', 'DONE', `Đã quét ${scrapedCount} văn bản`);

    // ── Stage 3: Dedupe + Download ───────────────────────────────────
    await emitStage(runId, 'Download & Dedupe', 'STARTED');
    const { db: database } = await import('./db');
    const newDocs = [];

    for (const doc of docs) {
      // Kiểm tra đã xử lý chưa
      const existing = await database.execute(
        `SELECT id FROM documents WHERE url = ?`,
        [doc.url]
      );
      if (existing.rows.length === 0) {
        newDocs.push(doc);
        // Tạo record chờ xử lý
        await database.execute(
          `INSERT INTO documents (id, so_van_ban, tieu_de, ngay, url, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), doc.soVanBan, doc.tieuDe, doc.ngay, doc.url, 'pending', new Date().toISOString()]
        );
      }
    }
    newCount = newDocs.length;
    await emitStage(runId, 'Download & Dedupe', 'DONE', `${newCount} văn bản mới, ${scrapedCount - newCount} đã có`);

    // ── Stage 4: Upload Drive ────────────────────────────────────────
    await emitStage(runId, 'Upload Drive', 'STARTED');
    // TODO: implement upload per doc (Stage 4)
    // Placeholder — sẽ implement đầy đủ ở Stage 4
    await emitStage(runId, 'Upload Drive', 'SKIPPED', 'Stage 4 — sẽ implement sau');

    // ── Stage 5: Gửi email ──────────────────────────────────────────
    await emitStage(runId, 'Send Email', 'STARTED');
    // TODO: implement email digest (Stage 4)
    await emitStage(runId, 'Send Email', 'SKIPPED', 'Stage 4 — sẽ implement sau');

    // ── Stage 6: Telegram summary ────────────────────────────────────
    await emitStage(runId, 'Telegram Notify', 'STARTED');
    const telegramOk = await telegram.notifyCompleted(runId, {
      scraped: scrapedCount,
      new: newCount,
      uploaded: uploadedCount,
      emailed: emailedCount,
      failed: 0,
    });
    await emitStage(runId, 'Telegram Notify', telegramOk ? 'DONE' : 'FAILED');

    await finishRun(runId, 'completed', {
      newCount,
      uploadedCount,
      emailedCount,
      telegramOk: !!telegramOk,
    });

    return {
      runId,
      status: 'completed',
      stats: { scraped: scrapedCount, new: newCount, uploaded: uploadedCount, emailed: emailedCount },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await telegram.notifyError(runId, 'Pipeline', errorMsg);
    await finishRun(runId, 'failed', {
      newCount,
      uploadedCount,
      emailedCount,
      telegramOk: false,
      error: errorMsg,
    });

    return { runId, status: 'failed', stats: { scraped: scrapedCount, new: newCount, uploaded: 0, emailed: 0 } };
  }
}
