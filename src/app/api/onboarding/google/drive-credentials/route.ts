// src/app/api/onboarding/google/drive-credentials/route.ts
// Nhận Client ID + Secret → lưu DB → trả về OAuth URL để redirect

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { saveCredential } from '@/lib/credentials';
import { buildAuthUrl } from '@/lib/google-oauth';

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { clientId?: string; clientSecret?: string };
  const { clientId, clientSecret } = body;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Thiếu Client ID hoặc Client Secret' }, { status: 400 });
  }

  try {
    // Lưu credentials vào DB
    await saveCredential('google', 'client_id', clientId);
    await saveCredential('google', 'client_secret', clientSecret);

    // Tạo OAuth authorization URL
    const appUrl = process.env.NEXTAUTH_URL ?? 'https://vpdtv2-ikl4.vercel.app';
    const redirectUri = `${appUrl}/api/onboarding/google/callback`;
    const authUrl = await buildAuthUrl(redirectUri);

    return NextResponse.json({ success: true, authUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
