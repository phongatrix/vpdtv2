// src/lib/vpdt-client.ts
// Client truy cập cổng VPĐT — login + scrape + download
// Lưu ý: WAF/bot-detection có thể chặn IP datacenter (Attack ID 20000051)
// FALLBACK: chế độ cookie thủ công (user paste từ trình duyệt)


import { getCredential } from './credentials';

const VPDT_BASE = 'https://vpdt.dongthap.gov.vn';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
};

export type VpdtLoginResult =
  | { success: true; cookie: string; expiresAt: string }
  | { success: false; blocked: boolean; error: string };

/**
 * Đăng nhập VPĐT tự động
 * Flow: GET trang login (lấy CSRF token nếu có) → POST credentials → kiểm tra redirect
 */
export async function loginVpdt(
  username: string,
  password: string
): Promise<VpdtLoginResult> {
  try {
    const tokenUrl = 'https://ssocqs.dongthap.gov.vn/auth/realms/digo/protocol/openid-connect/token';
    const params = new URLSearchParams({
      client_id: 'test-public',
      grant_type: 'password',
      username: username,
      password: password
    });

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    const json = await res.json().catch(() => ({}));

    if (res.ok && json.access_token) {
      const expiresAt = new Date(Date.now() + (json.expires_in || 3600) * 1000).toISOString();
      return {
        success: true,
        cookie: `Bearer ${json.access_token}`, // Return as Bearer token format
        expiresAt
      };
    } else {
      console.error('[loginVpdt] Keycloak error:', json);
      return {
        success: false,
        blocked: false,
        error: json.error_description || json.error || 'Sai tên đăng nhập hoặc mật khẩu.'
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      blocked: false,
      error: `Lỗi kết nối SSO: ${message}`,
    };
  }
}


/**
 * Lấy cookie hiện tại từ DB (tự động hoặc thủ công)
 */
export async function getActiveCookie(): Promise<string | null> {
  // Ưu tiên cookie thủ công (manual_cookie)
  const manual = await getCredential('vpdt', 'manual_cookie');
  if (manual) return manual;

  // Fallback: cookie tự động
  const auto = await getCredential('vpdt', 'session_cookie');
  return auto;
}

export interface VpdtDocument {
  soVanBan: string;
  tieuDe: string;
  ngay: string;
  coQuan: string;
  url: string;
  attachments: string[];
}

/**
 * Quét danh sách văn bản chưa xử lý
 * CHƯA VERIFY — WAF có thể chặn IP Vercel
 */
export async function scrapeDocumentList(
  cookie: string,
  _page = 0 // Ignored, we fetch all pages now
): Promise<VpdtDocument[]> {
  const dateStr = encodeURIComponent("2026-07-05T00:00.000+0000");
  const baseUrl = `https://apicqs.dongthap.gov.vn/do/document-forwarding/--search?saved-from=${dateStr}&assignee=628d053bedd83e6bebbb54cc&checkBookNumber=false&sort=id,desc&document-flow-id=5f714e1bfa1d20b3c61f429b&root-agency-code=H20.4.82&status=1&mark=false&ignore-count=true`;
  const headers = {
    Authorization: cookie.startsWith('Bearer') ? cookie : `Bearer ${cookie}`,
    Accept: 'application/json, text/plain, */*',
  };

  // Fetch first page to get totalPages
  const firstRes = await fetch(`${baseUrl}&page=0&size=50`, { headers });
  if (!firstRes.ok) throw new Error(`HTTP ${firstRes.status} API lỗi`);
  const firstJson = await firstRes.json();

  const totalPages = firstJson.totalPages || 1;
  const docs: VpdtDocument[] = [];

  // Parse items function
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parseItems = (content: any[]) => {
    if (!content || !Array.isArray(content)) return;
    for (const item of content) {
      if (!item.document) continue;
      const doc = item.document;
      let dateStr = doc.promulgationInfo?.date || '';
      if (dateStr) {
        try {
          const d = new Date(dateStr);
          dateStr = d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        } catch (_e) {}
      }
      docs.push({
        soVanBan: doc.code?.value || '(Không số)',
        tieuDe: doc.subject || '(Không có tiêu đề)',
        ngay: dateStr,
        coQuan: doc.promulgationInfo?.place || '(Không rõ cơ quan)',
        url: `https://vpdt.dongthap.gov.vn/vi/document-process/info/5f714e1bfa1d20b3c61f429b/${doc.id}/${item.id}/undefined`,
        attachments: [],
      });
    }
  };

  parseItems(firstJson.content);

  // Fetch remaining pages in parallel
  if (totalPages > 1) {
    const promises = [];
    for (let p = 1; p < totalPages; p++) {
      promises.push(
        fetch(`${baseUrl}&page=${p}&size=50`, { headers })
          .then(res => res.json())
          .then(json => parseItems(json.content))
          .catch(err => console.error(`Failed to fetch page ${p}:`, err))
      );
    }
    await Promise.all(promises);
  }

  return docs;
}

export async function scrapeDocumentDetail(
  _url: string,
  _cookie: string
): Promise<{ content: string; attachments: { name: string; url: string }[] }> {
  // VPĐT mới là SPA (Angular/React), giao diện HTML chỉ chứa thẻ <app-root>.
  // Để tối ưu, ta tạm bỏ qua việc đọc nội dung chi tiết & file đính kèm qua API (vì cần trace API rất phức tạp).
  // Hệ thống sẽ chỉ gửi thông tin cơ bản và đường link để người dùng bấm vào xem.
  return { content: '', attachments: [] };
}

/**
 * Tải file đính kèm
 */
export async function downloadAttachment(
  url: string,
  cookie: string
): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, Cookie: cookie, Referer: VPDT_BASE },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} khi tải file: ${url}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';

  // Lấy tên file từ header hoặc URL
  const disposition = res.headers.get('content-disposition') ?? '';
  const filenameMatch = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  const filename = filenameMatch
    ? decodeURIComponent(filenameMatch[1].replace(/['"]/g, ''))
    : url.split('/').pop() ?? 'attachment';

  return { buffer, contentType, filename };
}
