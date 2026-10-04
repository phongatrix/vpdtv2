// src/lib/gmail.ts
// Gửi email digest qua Nodemailer + App Password
// Attach file ≤25MB; lớn hơn chỉ gửi link Drive (Drive bị disable do dùng App Password)

import { getCredential } from './credentials';
import nodemailer from 'nodemailer';

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
            (Đã tải lên Telegram)
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
    Email này được gửi tự động bởi VPDT Forwarder (via App Password).
  </p>
</body>
</html>`;
}

/**
 * Gửi email digest
 */
export async function sendDigestEmail(
  docs: DigestDoc[],
  runId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const email = await getCredential('google', 'gmail_address');
    const appPassword = await getCredential('google', 'gmail_app_password');
    const toAddress = await getCredential('google', 'gmail_to_address');

    if (!email || !appPassword || !toAddress) {
      return { success: false, error: 'Chưa cấu hình tài khoản Gmail App Password' };
    }

    const subject = `[VPĐT] ${docs.length} văn bản mới — ${new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;
    const html = buildDigestHtml(docs, runId);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: email,
        pass: appPassword
      }
    });

    await transporter.sendMail({
      from: `"VPDT Forwarder" <${email}>`,
      to: toAddress,
      subject,
      html,
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

