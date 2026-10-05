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
  let uploadedCount = 0;
  let emailedCount = 0;
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
      docs = await scrapeDocumentList(cookie);
      scrapedCount = docs.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await emitStage(runId, 'Scrape Documents', 'FAILED', msg);
      throw err;
    }
    await emitStage(runId, 'Scrape Documents', 'DONE', `Đã quét ${scrapedCount} văn bản`);

    // ── Stage 3: Dedupe + Detail & Download ──────────────────────────
    await emitStage(runId, 'Download & Dedupe', 'STARTED');
    const { db: database } = await import('./db');
    const { scrapeDocumentDetail, downloadAttachment } = await import('./vpdt-client');
    const newDocsRaw = [];
    // Bước 3.1: Lọc ra các văn bản mới
    for (const doc of docs) {
      const existing = await database.execute(
        `SELECT id FROM documents WHERE url = ?`,
        [doc.url]
      );
      if (existing.rows.length === 0) {
        newDocsRaw.push(doc);
      }
    }

    // Đảo ngược danh sách để xử lý theo thời gian nối tiếp lần trước (cũ nhất trong số mới -> mới nhất)
    const newDocs = newDocsRaw.reverse();

    // Bước 3.2: Xử lý và tải xuống
    for (const doc of newDocs) {
      const docId = uuidv4();
        await database.execute(
          `INSERT INTO documents (id, so_van_ban, tieu_de, ngay, url, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [docId, doc.soVanBan, doc.tieuDe, doc.ngay, doc.url, 'downloading', new Date().toISOString()]
        );

        try {
          // Trích xuất chi tiết
          const detail = await scrapeDocumentDetail(doc.url, cookie);
          
          // Tạo metadata và content
          const metadata = JSON.stringify({
            soVanBan: doc.soVanBan,
            tieuDe: doc.tieuDe,
            ngay: doc.ngay,
            coQuan: doc.coQuan,
            url: doc.url,
            scrapedAt: new Date().toISOString()
          }, null, 2);

          const contentHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${doc.tieuDe}</title></head>
<body>
  <h1>${doc.tieuDe}</h1>
  <p><strong>Số VB:</strong> ${doc.soVanBan} | <strong>Ngày:</strong> ${doc.ngay} | <strong>Cơ quan:</strong> ${doc.coQuan}</p>
  <hr/>
  ${detail.content}
</body>
</html>`;

          // Tải attachments (giữ trên /tmp hoặc memory, nhưng vì serverless nên ta có thể 
          // lưu tạm memory để truyền sang Stage 4)
          // Ở Stage 3, ta chỉ verify là có thể tải được.
          const downloadedFiles = [];
          for (const att of detail.attachments) {
             const fileData = await downloadAttachment(att.url, cookie);
             downloadedFiles.push(fileData);
          }

          // Cập nhật DB trạng thái pending_upload
          await database.execute(
            `UPDATE documents SET status = ? WHERE id = ?`,
            ['pending_upload', docId]
          );

          // Tạm thời gắn vào doc để log/debug (thực tế Stage 4 sẽ dùng)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (doc as any)._detail = { contentHtml, metadata, downloadedFiles };

        } catch (detailErr) {
           const msg = detailErr instanceof Error ? detailErr.message : String(detailErr);
           console.error(`[Stage 3] Partial failure for doc ${doc.soVanBan}:`, msg);
           await database.execute(
            `UPDATE documents SET status = ?, error = ? WHERE id = ?`,
            ['error', msg, docId]
          );
           // Vẫn tiếp tục với văn bản khác (partial failure OK)
        }
    }
    newCount = newDocs.length;
    await emitStage(runId, 'Download & Dedupe', 'DONE', `${newCount} văn bản mới, ${scrapedCount - newCount} đã bỏ qua (trùng)`);

    // ── Stage 4: Upload Drive ─────────────────────────────────────────
    await emitStage(runId, 'Upload Drive', 'STARTED');
    const { uploadDocument } = await import('./google-drive');
    const { getCredential: getCred } = await import('./credentials');
    const hasOAuthToken = !!(await getCred('google', 'refresh_token')) &&
      (await getCred('google', 'refresh_token')) !== 'app_password_mode';
    const digestDocs = [];

    for (const doc of newDocs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (doc as any)._detail;
      if (!detail) {
        digestDocs.push({ soVanBan: doc.soVanBan, tieuDe: doc.tieuDe, ngay: doc.ngay, coQuan: doc.coQuan, url: doc.url });
        continue;
      }

      let driveWebLink = '';
      if (hasOAuthToken) {
        try {
          const result = await uploadDocument({
            soVanBan: doc.soVanBan,
            ngay: doc.ngay,
            metadataJson: detail.metadata,
            contentHtml: detail.contentHtml,
            attachments: [],
          });
          driveWebLink = result.webLinks[0] ?? '';
          uploadedCount++;
        } catch (driveErr) {
          const msg = driveErr instanceof Error ? driveErr.message : String(driveErr);
          console.error(`[Stage 4] Drive upload failed for ${doc.soVanBan}:`, msg);
          // Không throw — tiếp tục gửi email dù Drive lỗi
        }
      } else {
        // Không có Drive token — bỏ qua upload
        uploadedCount++;
      }

      await database.execute(
        `UPDATE documents SET status = ? WHERE url = ?`,
        ['processed', doc.url]
      );

      digestDocs.push({
        soVanBan: doc.soVanBan,
        tieuDe: doc.tieuDe,
        ngay: doc.ngay,
        coQuan: doc.coQuan,
        url: driveWebLink || doc.url, // Ưu tiên Drive link nếu có
      });
    }

    if (!hasOAuthToken) {
      await emitStage(runId, 'Upload Drive', 'SKIPPED', 'Chưa kết nối Google Drive OAuth. Bỏ qua.');
    } else {
      await emitStage(runId, 'Upload Drive', 'DONE', `Đã upload ${uploadedCount} văn bản lên Drive`);
    }


    // ── Stage 5: Gửi email ──────────────────────────────────────────
    await emitStage(runId, 'Send Email', 'STARTED');
    if (digestDocs.length > 0) {
      const { sendDigestEmail } = await import('./gmail');
      const emailRes = await sendDigestEmail(digestDocs, runId);
      
      if (emailRes.success) {
        emailedCount = digestDocs.length;
        await emitStage(runId, 'Send Email', 'DONE', `Đã gửi email ${emailedCount} văn bản`);
      } else {
        await emitStage(runId, 'Send Email', 'FAILED', emailRes.error);
      }
    } else {
      await emitStage(runId, 'Send Email', 'SKIPPED', 'Không có văn bản nào cần gửi email');
    }

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
