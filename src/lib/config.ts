// src/lib/config.ts
// Cấu hình toàn cục — đọc từ env, validate khi startup

export const config = {
  // Security
  cronSecret: process.env.CRON_SECRET ?? '',
  dashboardPassword: process.env.DASHBOARD_PASSWORD ?? '',
  credentialsEncryptionKey: process.env.CREDENTIALS_ENCRYPTION_KEY ?? '',

  // Database
  databaseUrl: process.env.DATABASE_URL ?? '',
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN,

  // App
  nextAuthUrl: process.env.NEXTAUTH_URL ?? 'http://localhost:3000',

  // Proxy (tùy chọn)
  proxyUrl: process.env.PROXY_URL,
};

/**
 * Validate các biến bắt buộc — gọi trong middleware hoặc startup
 */
export function validateConfig(): { valid: boolean; missing: string[] } {
  const required = [
    'CREDENTIALS_ENCRYPTION_KEY',
    'CRON_SECRET',
    'DASHBOARD_PASSWORD',
    'DATABASE_URL',
  ];
  const missing = required.filter((key) => !process.env[key]);
  return { valid: missing.length === 0, missing };
}

/**
 * Mask sensitive string cho log — chỉ hiển thị 4 ký tự đầu
 */
export function maskSecret(value: string): string {
  if (!value || value.length < 4) return '***';
  return value.slice(0, 4) + '***';
}
