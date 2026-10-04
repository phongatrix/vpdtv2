// src/app/api/onboarding/google/start/route.ts
// Bắt đầu Google OAuth flow — lưu client_id/secret → trả về auth URL

import { NextRequest, NextResponse } from 'next/server';
import { saveCredential } from '@/lib/credentials';
import { buildAuthUrl } from '@/lib/google-oauth';
import { isRateLimited, getRateLimitKey } from '@/lib/rate-limit';
import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (isRateLimited(getRateLimitKey(ip, '/api/onboarding/google/start'), 5, 60_000)) {
    return NextResponse.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 });
  }

  const body = await req.json() as {
    clientId?: string;
    clientSecret?: string;
    gmailToAddress?: string;
  };

  const { clientId, clientSecret, gmailToAddress } = body;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Thiếu Client ID hoặc Client Secret' }, { status: 400 });
  }

  console.log(`[AUDIT] google-onboarding start ip=${ip}`);

  // Lưu credentials
  await saveCredential('google', 'client_id', clientId);
  await saveCredential('google', 'client_secret', clientSecret);
  if (gmailToAddress) {
    await saveCredential('google', 'gmail_to_address', gmailToAddress);
  }

  // Tạo OAuth URL
  const appUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  const redirectUri = `${appUrl}/api/onboarding/google/callback`;
  const authUrl = await buildAuthUrl(redirectUri);

  return NextResponse.json({ authUrl });
}
