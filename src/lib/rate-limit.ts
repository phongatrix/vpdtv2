// src/lib/rate-limit.ts
// Simple in-memory rate limiter cho API routes onboarding
// (Dùng Map — đủ cho Vercel serverless, reset mỗi cold start)

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

/**
 * Kiểm tra rate limit
 * @param key - Định danh (VD: IP + endpoint)
 * @param maxRequests - Số request tối đa
 * @param windowMs - Cửa sổ thời gian (ms)
 * @returns true nếu bị rate-limited (quá giới hạn)
 */
export function isRateLimited(
  key: string,
  maxRequests = 5,
  windowMs = 60_000
): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  if (entry.count >= maxRequests) return true;

  entry.count++;
  return false;
}

/**
 * Tạo key từ request IP + path
 */
export function getRateLimitKey(ip: string, path: string): string {
  return `${ip}:${path}`;
}
