// src/app/api/onboarding/vpdt/route.ts
// Onboarding Section A — VPĐT
// POST: nhận username+password (hoặc cookie thủ công) → login → lưu DB

import { NextRequest, NextResponse } from 'next/server';
import { loginVpdt } from '@/lib/vpdt-client';
import { saveCredential, getCredential } from '@/lib/credentials';
import { isRateLimited, getRateLimitKey } from '@/lib/rate-limit';
import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  // Auth
  if (!await requireAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (isRateLimited(getRateLimitKey(ip, '/api/onboarding/vpdt'), 5, 60_000)) {
    return NextResponse.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 });
  }

  const body = await req.json() as {
    username?: string;
    password?: string;
    cookie?: string;
    mode?: 'auto' | 'manual';
  };

  const { username, password, cookie, mode = 'auto' } = body;

  // Audit log (không ghi giá trị secret)
  console.log(`[AUDIT] vpdt-onboarding mode=${mode} user=${username ?? 'N/A'} ip=${ip}`);

  try {
    if (mode === 'manual' && cookie) {
      // Chế độ cookie thủ công
      await saveCredential('vpdt', 'manual_cookie', cookie);
      await saveCredential('vpdt', 'username', username ?? '');
      return NextResponse.json({
        success: true,
        message: 'Cookie thủ công đã được lưu',
        status: 'manual_cookie',
      });
    }

    // Chế độ tự động
    if (!username || !password) {
      return NextResponse.json({ error: 'Thiếu username hoặc password' }, { status: 400 });
    }

    // Lưu username (không lưu password — chỉ lưu session)
    await saveCredential('vpdt', 'username', username);

    const result = await loginVpdt(username, password);

    if (result.success) {
      await saveCredential('vpdt', 'session_cookie', result.cookie);
      // Xóa cookie thủ công cũ (nếu có) khi auto login thành công
      // (Giữ nguyên nếu muốn — auto có ưu tiên cao hơn trong getActiveCookie)
      return NextResponse.json({
        success: true,
        message: `Đã kết nối VPĐT (hết hạn lúc ${new Date(result.expiresAt).toLocaleString('vi-VN')})`,
        status: 'connected',
        expiresAt: result.expiresAt,
      });
    } else if (result.blocked) {
      return NextResponse.json({
        success: false,
        blocked: true,
        message: `LỖI: ${result.error}`,
        status: 'blocked',
      });
    } else {
      return NextResponse.json({
        success: false,
        message: `LỖI: ${result.error}`,
        status: 'error',
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[vpdt-onboarding] Lỗi:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const username = await getCredential('vpdt', 'username');
  const hasSessionCookie = !!(await getCredential('vpdt', 'session_cookie'));
  const hasManualCookie = !!(await getCredential('vpdt', 'manual_cookie'));

  return NextResponse.json({
    username: username ?? null,
    status: hasSessionCookie || hasManualCookie ? 'connected' : 'not_connected',
    mode: hasManualCookie ? 'manual' : hasSessionCookie ? 'auto' : 'none',
  });
}
