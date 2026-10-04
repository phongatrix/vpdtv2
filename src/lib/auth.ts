// src/lib/auth.ts
// Xác thực dashboard session dùng cookie + JWT (jose)

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'vpdt_session';
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 giờ (giây)

function getJwtSecret(): Uint8Array {
  const secret = process.env.DASHBOARD_PASSWORD;
  if (!secret) throw new Error('DASHBOARD_PASSWORD is not set');
  // Dùng password làm signing key (đủ cho use case này)
  return new TextEncoder().encode(secret + '_jwt_salt_vpdt_2026');
}

/**
 * Tạo JWT session token
 */
export async function createSessionToken(): Promise<string> {
  const secret = getJwtSecret();
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret);
}

/**
 * Verify JWT session token
 */
export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const secret = getJwtSecret();
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

/**
 * Đọc session từ cookie (dùng trong Server Components)
 */
export async function getSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return verifySessionToken(token);
}

/**
 * Set session cookie trong response
 */
export function setSessionCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  return response;
}

/**
 * Middleware check — dùng trong API routes
 */
export async function requireAuth(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return verifySessionToken(token);
}

/**
 * Xác thực CRON_SECRET từ Authorization header
 */
export function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  return token === process.env.CRON_SECRET;
}
