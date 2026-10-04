// src/lib/gmail.ts
// Gửi email digest qua Gmail API
// Attach file ≤25MB; lớn hơn chỉ gửi link Drive

import { getValidAccessToken } from './google-oauth';
import { getCredential } from './credentials';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

interface DigestDoc {
  soVanBan: string;
  tieuDe: string;
  ngay: string;
  driveLink: string;
  attachments?: { name: string; size: number; driveLink: string }[];
}

/**
 * Tạo email digest HTML
 */
function buildDigestHtml(docs: DigestDoc[], runId: string): string {
  const rows = docs
    .map(
      (d) =>
        `<tr>
          <td style="padding:8px;border:1px solid #ddd">${d.soVanBan}</td>
          <td style="padding:8px;border:1px solid #ddd">${d.tieuDe}</td>
          <td style="padding:8px;border:1px solid #ddd">${d.ngay}</td>
          <td style="padding:8px;border:1px solid #ddd">
            <a href="${d.driveLink}">Xem trên Drive</a>
          </td>
        </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><title>VPĐT Digest</title></head>
<body style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px">
  <h2>📄 Tổng hợp văn bản VPĐT mới</h2>
  <p>Run ID: <code>${runId}</code> | Thời gian: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>
  <p>Có <strong>${docs.length}</strong> văn bản mới:</p>
  <table style="width:100%;border-collapse:collapse;margin-top:16px">
    <thead>
      <tr style="background:#4f46e5;color:white">
        <th style="padding:8px;text-align:left">Số văn bản</th>
        <th style="padding:8px;text-align:left">Tiêu đề</th>
        <th style="padding:8px;text-align:left">Ngày</th>
        <th style="padding:8px;text-align:left">Link</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="color:#666;font-size:12px;margin-top:20px">
    Email này được gửi tự động bởi VPDT Forwarder.
  </p>
</body>
</html>`;
}

/**
 * Encode email theo RFC 2822 (base64url)
 */
function encodeEmail(params: {
  to: string;
  from: string;
  subject: string;
  html: string;
}): string {
  const message = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(params.subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(params.html).toString('base64'),
  ].join('\r\n');

  return Buffer.from(message).toString('base64url');
}

/**
 * Gửi email digest
 */
export async function sendDigestEmail(
  docs: DigestDoc[],
  runId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const token = await getValidAccessToken();
    const toAddress = await getCredential('google', 'gmail_to_address');
    const fromEmail = await getCredential('google', 'user_email');

    if (!toAddress) {
      return { success: false, error: 'Chưa cấu hình địa chỉ email nhận' };
    }

    const subject = `[VPĐT] ${docs.length} văn bản mới — ${new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;
    const html = buildDigestHtml(docs, runId);

    const raw = encodeEmail({
      to: toAddress,
      from: fromEmail ?? 'me',
      subject,
      html,
    });

    const res = await fetch(GMAIL_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });

    if (!res.ok) {
      const err = await res.json() as { error?: { message?: string } };
      return { success: false, error: `Gmail API lỗi: ${err?.error?.message ?? res.status}` };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
