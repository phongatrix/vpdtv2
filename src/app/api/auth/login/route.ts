// src/app/api/auth/login/route.ts
// Đăng nhập dashboard bằng DASHBOARD_PASSWORD

import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, setSessionCookie } from '@/lib/auth';
import { isRateLimited, getRateLimitKey } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  // Rate limit: 5 lần/phút
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (isRateLimited(getRateLimitKey(ip, '/api/auth/login'), 5, 60_000)) {
    return NextResponse.json({ error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' }, { status: 429 });
  }

  const body = await req.json() as { password?: string };
  const { password } = body;

  if (!password || password !== process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }

  const token = await createSessionToken();
  const response = NextResponse.json({ success: true });
  return setSessionCookie(response, token);
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('vpdt_session');
  return response;
}
