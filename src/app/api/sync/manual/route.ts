// src/app/api/sync/manual/route.ts
// Manual trigger — rate-limited, yêu cầu dashboard auth

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { isRateLimited, getRateLimitKey } from '@/lib/rate-limit';
import { runSyncPipeline } from '@/lib/pipeline';

// Rate limit: 1 lần / 5 phút
const MANUAL_RATE_LIMIT = 1;
const MANUAL_WINDOW_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (isRateLimited(getRateLimitKey(ip, '/api/sync/manual'), MANUAL_RATE_LIMIT, MANUAL_WINDOW_MS)) {
    return NextResponse.json(
      { error: 'Manual trigger đã được gọi gần đây. Vui lòng chờ 5 phút.' },
      { status: 429 }
    );
  }

  console.log('[MANUAL] Sync triggered by user, ip=', ip);

  try {
    const result = await runSyncPipeline();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
