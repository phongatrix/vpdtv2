// src/app/api/cron/sync/route.ts
// Cron endpoint — xác thực CRON_SECRET → chạy pipeline
// Schedule: 23:00 UTC (06:00 VN) và 10:00 UTC (17:00 VN)

import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/auth';
import { runSyncPipeline } from '@/lib/pipeline';

export const maxDuration = 300; // 5 phút timeout cho Vercel Pro; Hobby = 10s

export async function POST(req: NextRequest) {
  // Xác thực CRON_SECRET
  if (!verifyCronSecret(req)) {
    console.warn('[CRON] Unauthorized request — wrong or missing CRON_SECRET');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[CRON] Sync started at', new Date().toISOString());

  try {
    const result = await runSyncPipeline();
    console.log('[CRON] Sync finished:', result.status, result.stats);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[CRON] Pipeline error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Vercel cron gọi bằng GET
export async function GET(req: NextRequest) {
  return POST(req);
}
