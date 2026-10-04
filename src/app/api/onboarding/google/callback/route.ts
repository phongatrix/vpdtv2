// src/app/api/onboarding/google/callback/route.ts
// OAuth callback — nhận code từ Google → đổi lấy tokens → lưu DB

import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/google-oauth';
import { getCredential } from '@/lib/credentials';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    // Redirect về onboarding với thông báo lỗi
    return NextResponse.redirect(
      new URL(`/onboarding?section=google&error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/onboarding?section=google&error=no_code', req.url)
    );
  }

  try {
    const appUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
    const redirectUri = `${appUrl}/api/onboarding/google/callback`;

    const { email } = await exchangeCode(code, redirectUri);

    console.log(`[AUDIT] google-oauth callback success email=${email}`);

    return NextResponse.redirect(
      new URL(`/onboarding?section=google&success=1&email=${encodeURIComponent(email)}`, req.url)
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[google-callback] Lỗi:', msg);
    return NextResponse.redirect(
      new URL(`/onboarding?section=google&error=${encodeURIComponent(msg)}`, req.url)
    );
  }
}

// GET status
export async function POST() {
  const email = await getCredential('google', 'user_email');
  const hasRefreshToken = !!(await getCredential('google', 'refresh_token'));

  return NextResponse.json({
    connected: hasRefreshToken,
    email: email ?? null,
    status: hasRefreshToken ? 'connected' : 'not_connected',
  });
}
