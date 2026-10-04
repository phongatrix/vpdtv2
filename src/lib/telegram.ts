// src/lib/telegram.ts
// Module thông báo Telegram — theo 04-TELEGRAM.md
// Token và chat_id lấy từ DB (onboarding), KHÔNG từ env

import { getCredential } from './credentials';

const TELEGRAM_BASE = 'https://api.telegram.org/bot';

interface TelegramStats {
  scraped: number;
  new: number;
  uploaded: number;
  emailed: number;
  failed: number;
}

async function sendMessage(text: string, retries = 3): Promise<boolean> {
  // Lấy token + chat_id từ DB
  const botToken = await getCredential('telegram', 'bot_token');
  const chatId = await getCredential('telegram', 'chat_id');

  if (!botToken || !chatId) {
    console.warn('[TELEGRAM] bot_token hoặc chat_id chưa được cấu hình, bỏ qua.');
    return false;
  }

  const url = `${TELEGRAM_BASE}${botToken}/sendMessage`;

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        }),
      });
      if (res.ok) return true;
      const body = await res.text();
      console.warn(`[TELEGRAM] Lần ${i + 1}/${retries} thất bại: ${res.status} — ${body}`);
    } catch (err) {
      console.warn(`[TELEGRAM] Lần ${i + 1}/${retries} lỗi:`, err);
    }
    if (i < retries - 1) {
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  // Hết retry → log, KHÔNG throw (pipeline phải tiếp tục)
  console.error('[TELEGRAM] Không gửi được sau 3 lần thử. Pipeline tiếp tục.');
  return false;
}

export const telegram = {
  notifyStart: (runId: string) =>
    sendMessage(
      `🚀 <b>VPDT Sync Started</b>\n` +
      `Run ID: <code>${runId}</code>\n` +
      `Time: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
    ),

  notifyStage: (
    runId: string,
    stage: string,
    status: 'STARTED' | 'DONE' | 'FAILED',
    detail?: string
  ) =>
    sendMessage(
      `${status === 'DONE' ? '✅' : status === 'FAILED' ? '❌' : '⏳'} <b>${stage}</b> — ${status}\n` +
      `Run: <code>${runId}</code>\n` +
      (detail ? `Chi tiết: ${detail}\n` : '') +
      `Time: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
    ),

  notifyCompleted: (runId: string, stats: TelegramStats) =>
    sendMessage(
      `🏁 <b>VPDT Sync Hoàn tất</b>\n` +
      `Run: <code>${runId}</code>\n` +
      `📊 Kết quả:\n` +
      `  • Đã quét: ${stats.scraped}\n` +
      `  • Văn bản mới: ${stats.new}\n` +
      `  • Đã upload Drive: ${stats.uploaded}\n` +
      `  • Đã gửi email: ${stats.emailed}\n` +
      `  • Thất bại: ${stats.failed}\n` +
      `Time: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
    ),

  notifyError: (runId: string, stage: string, error: string) =>
    sendMessage(
      `🚨 <b>VPDT Sync Lỗi</b>\n` +
      `Run: <code>${runId}</code>\n` +
      `Stage: ${stage}\n` +
      `Lỗi: ${error.slice(0, 500)}\n` +
      `Time: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
    ),

  /**
   * Test gửi message — dùng cho nút "Test Telegram" trên dashboard
   */
  testSend: (chatId?: string) => {
    const text =
      `✅ <b>Kết nối Telegram thành công!</b>\n` +
      `Bot đã sẵn sàng gửi thông báo.\n` +
      `Time: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;
    // Nếu có chatId override (dùng khi poll getUpdates)
    if (chatId) {
      return sendMessage(text); // sẽ dùng DB value
    }
    return sendMessage(text);
  },
};

/**
 * Gọi Telegram Bot API trực tiếp với token bất kỳ (dùng trong onboarding verify)
 */
export async function telegramApiCall(
  botToken: string,
  method: string,
  params?: Record<string, unknown>
): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  const url = `${TELEGRAM_BASE}${botToken}/${method}`;
  const res = await fetch(url, {
    method: params ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: params ? JSON.stringify(params) : undefined,
  });
  return res.json();
}
