// src/lib/google-oauth.ts
// OAuth 2.0 flow cho Gmail + Drive
// Lưu client_id, client_secret, access_token, refresh_token trong DB (mã hóa)

import { getCredential, saveCredential } from './credentials';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

// Scope tối thiểu theo spec
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

/**
 * Tạo OAuth authorization URL
 */
export async function buildAuthUrl(redirectUri: string): Promise<string> {
  const clientId = await getCredential('google', 'client_id');
  if (!clientId) throw new Error('Google Client ID chưa được cấu hình');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent', // Bắt buộc để nhận refresh_token
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Đổi authorization code → access_token + refresh_token
 */
export async function exchangeCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; email: string }> {
  const clientId = await getCredential('google', 'client_id');
  const clientSecret = await getCredential('google', 'client_secret');

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials chưa được cấu hình');
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  const data = await res.json() as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!data.access_token || !data.refresh_token) {
    throw new Error(`OAuth error: ${data.error} — ${data.error_description}`);
  }

  // Lưu tokens vào DB
  await saveCredential('google', 'access_token', data.access_token);
  await saveCredential('google', 'refresh_token', data.refresh_token);

  // Lấy email của user
  const email = await getGoogleUserEmail(data.access_token);
  if (email) await saveCredential('google', 'user_email', email);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    email: email ?? 'unknown',
  };
}

/**
 * Lấy access token (tự refresh nếu hết hạn)
 */
export async function getValidAccessToken(): Promise<string> {
  const accessToken = await getCredential('google', 'access_token');
  if (accessToken) {
    // Verify token còn hạn
    const valid = await verifyToken(accessToken);
    if (valid) return accessToken;
  }

  // Refresh token
  return refreshAccessToken();
}

/**
 * Refresh access token từ refresh_token
 */
export async function refreshAccessToken(): Promise<string> {
  const refreshToken = await getCredential('google', 'refresh_token');
  const clientId = await getCredential('google', 'client_id');
  const clientSecret = await getCredential('google', 'client_secret');

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Thiếu refresh_token hoặc OAuth credentials. Vui lòng xác thực lại Google.');
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }).toString(),
  });

  const data = await res.json() as { access_token?: string; error?: string };

  if (!data.access_token) {
    throw new Error(`Refresh token thất bại: ${data.error}. Vui lòng xác thực lại Google.`);
  }

  await saveCredential('google', 'access_token', data.access_token);
  return data.access_token;
}

async function verifyToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function getGoogleUserEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json() as { email?: string };
    return data.email ?? null;
  } catch {
    return null;
  }
}
