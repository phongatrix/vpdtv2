// src/lib/vpdt-client.ts
// Client truy cập cổng VPĐT — login + scrape + download
// Lưu ý: WAF/bot-detection có thể chặn IP datacenter (Attack ID 20000051)
// FALLBACK: chế độ cookie thủ công (user paste từ trình duyệt)

import * as cheerio from 'cheerio';
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
    // Bước 1: GET trang login
    const loginPageRes = await fetch(`${VPDT_BASE}/Account/Login`, {
      headers: { ...BROWSER_HEADERS, Referer: VPDT_BASE },
      redirect: 'manual',
    });

    // Kiểm tra WAF block
    if (loginPageRes.status === 403 || loginPageRes.status === 406) {
      return {
        success: false,
        blocked: true,
        error: `WAF chặn IP (HTTP ${loginPageRes.status}). Vui lòng dùng chế độ cookie thủ công.`,
      };
    }

    const loginHtml = await loginPageRes.text();

    // Kiểm tra block page
    if (
      loginHtml.includes('Access Denied') ||
      loginHtml.includes('Attack ID') ||
      loginHtml.includes('20000051')
    ) {
      return {
        success: false,
        blocked: true,
        error: 'WAF chặn IP — trang trả về Access Denied. Vui lòng dùng chế độ cookie thủ công.',
      };
    }

    // Trích xuất CSRF token (nếu có)
    const $ = cheerio.load(loginHtml);
    const csrfToken =
      $('input[name="__RequestVerificationToken"]').val() ||
      $('input[name="_token"]').val() ||
      '';

    // Bước 2: POST credentials
    const formData = new URLSearchParams({
      UserName: username,
      Password: password,
      ...(csrfToken ? { __RequestVerificationToken: String(csrfToken) } : {}),
    });

    const loginRes = await fetch(`${VPDT_BASE}/Account/Login`, {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `${VPDT_BASE}/Account/Login`,
        Origin: VPDT_BASE,
      },
      body: formData.toString(),
      redirect: 'manual',
    });

    // Bước 3: Kiểm tra kết quả
    if (loginRes.status === 302 || loginRes.status === 301) {
      const setCookie = loginRes.headers.get('set-cookie') ?? '';
      const location = loginRes.headers.get('location') ?? '';

      // Nếu redirect về Login → sai credentials
      if (location.includes('Login') && !location.includes('ReturnUrl')) {
        return { success: false, blocked: false, error: 'Sai tên đăng nhập hoặc mật khẩu.' };
      }

      // Lấy session cookie
      const cookies = setCookie
        .split(',')
        .map((c) => c.split(';')[0].trim())
        .filter((c) => c.includes('='))
        .join('; ');

      if (!cookies) {
        return { success: false, blocked: false, error: 'Không nhận được session cookie sau login.' };
      }

      // TTL 8 tiếng
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
      return { success: true, cookie: cookies, expiresAt };
    }

    // HTTP 200 sau POST thường nghĩa là login fail (form hiển thị lại)
    const resultHtml = await loginRes.text();
    if (resultHtml.includes('Attack ID') || resultHtml.includes('Access Denied')) {
      return {
        success: false,
        blocked: true,
        error: 'WAF chặn IP sau POST. Vui lòng dùng chế độ cookie thủ công.',
      };
    }

    return { success: false, blocked: false, error: 'Đăng nhập thất bại. Kiểm tra lại thông tin.' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const blocked =
      message.includes('ECONNREFUSED') ||
      message.includes('ETIMEDOUT') ||
      message.includes('fetch failed');
    return {
      success: false,
      blocked,
      error: `Lỗi kết nối: ${message}`,
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
  page = 0
): Promise<VpdtDocument[]> {
  const dateStr = encodeURIComponent("2026-07-05T00:00.000+0000");
  const url = `https://apicqs.dongthap.gov.vn/do/document-forwarding/--search?status=2&saved-from=${dateStr}&assignee=628d053bedd83e6bebbb54cc&checkBookNumber=false&sort=id,desc&page=${page}&size=10&document-flow-id=5f714e1bfa1d20b3c61f429b&root-agency-code=H20.4.82&status=1&mark=false&ignore-count=true`;
  const res = await fetch(url, {
    headers: {
      Authorization: cookie.startsWith('Bearer') ? cookie : `Bearer ${cookie}`,
      Accept: 'application/json, text/plain, */*',
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} API lỗi`);
  }

  const json = await res.json();
  
  // Throw the first item as an error so we can see its structure in the UI!
  if (json.content && json.content.length > 0) {
    throw new Error('DEBUG_JSON: ' + JSON.stringify(json.content[0]).substring(0, 500));
  }

  return [];
}

/**
 * Parser danh sách văn bản từ HTML
 * NOTE: Cần fixture HTML thật từ site để verify selector
 */
export function parseDocumentList(html: string): VpdtDocument[] {
  const $ = cheerio.load(html);
  const docs: VpdtDocument[] = [];

  // Selector cần verify với HTML thật — đây là guess based on common VPDT patterns
  $('table tbody tr, .van-ban-item, .document-item').each((_, el) => {
    const $el = $(el);
    const tieuDe = $el.find('.tieu-de, td:nth-child(3), .title').text().trim();
    const soVanBan = $el.find('.so-van-ban, td:nth-child(2), .doc-number').text().trim();
    const ngay = $el.find('.ngay, td:nth-child(4), .date').text().trim();
    const coQuan = $el.find('.co-quan, td:nth-child(5), .agency').text().trim();
    const href =
      $el.find('a').attr('href') ||
      $el.find('[href]').attr('href') ||
      '';
    const url = href.startsWith('http') ? href : `${VPDT_BASE}${href}`;

    if (tieuDe && href) {
      docs.push({ soVanBan, tieuDe, ngay, coQuan, url, attachments: [] });
    }
  });

  return docs;
}

/**
 * Trích xuất chi tiết 1 văn bản
 * CHƯA VERIFY — selector cần verify với HTML thật
 */
export async function scrapeDocumentDetail(
  url: string,
  cookie: string
): Promise<{ content: string; attachments: { name: string; url: string }[] }> {
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, Cookie: cookie, Referer: VPDT_BASE },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} khi tải chi tiết văn bản: ${url}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // Content (selector cần verify)
  const content = $('.content-detail, .van-ban-content, article, .body-content').html() ?? html;

  // Attachments
  const attachments: { name: string; url: string }[] = [];
  $('a[href*=".pdf"], a[href*=".doc"], a[href*=".docx"], a[href*="download"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const name = $(el).text().trim() || 'file';
    if (href) {
      attachments.push({
        name,
        url: href.startsWith('http') ? href : `${VPDT_BASE}${href}`,
      });
    }
  });

  return { content, attachments };
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
