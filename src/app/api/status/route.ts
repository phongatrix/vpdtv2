// src/app/api/status/route.ts
// Trả về trạng thái tổng thể: runs gần đây, credential status, onboarding status

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getCredential } from '@/lib/credentials';

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Lấy 10 runs gần nhất
    const runsResult = await db.execute(
      `SELECT id, started_at, finished_at, status, stage_reached,
              new_count, uploaded_count, emailed_count, telegram_ok, error
       FROM runs ORDER BY started_at DESC LIMIT 10`
    );

    // Lấy stage_events cho run gần nhất
    const runs = runsResult.rows as Array<{ id: string; [key: string]: unknown }>;
    let latestRunEvents: unknown[] = [];

    if (runs.length > 0) {
      const eventsResult = await db.execute(
        `SELECT stage, status, detail, created_at FROM stage_events
         WHERE run_id = ? ORDER BY created_at ASC`,
        [runs[0].id]
      );
      latestRunEvents = eventsResult.rows;
    }

    // Kiểm tra trạng thái kết nối từng service
    const [
      vpdtUsername,
      vpdtHasSession,
      googleEmail,
      googleHasRefresh,
      telegramHasToken,
      telegramHasChatId,
    ] = await Promise.all([
      getCredential('vpdt', 'username'),
      getCredential('vpdt', 'session_cookie').then(Boolean),
      getCredential('google', 'user_email'),
      getCredential('google', 'refresh_token').then(Boolean),
      getCredential('telegram', 'bot_token').then(Boolean),
      getCredential('telegram', 'chat_id').then(Boolean),
    ]);

    const onboardingComplete = (vpdtHasSession || !!(await getCredential('vpdt', 'manual_cookie')))
      && googleHasRefresh
      && telegramHasToken
      && telegramHasChatId;

    return NextResponse.json({
      onboardingComplete,
      credentials: {
        vpdt: {
          username: vpdtUsername ?? null,
          connected: vpdtHasSession || !!(await getCredential('vpdt', 'manual_cookie')),
        },
        google: {
          email: googleEmail ?? null,
          connected: googleHasRefresh,
        },
        telegram: {
          connected: telegramHasToken && telegramHasChatId,
        },
      },
      recentRuns: runs,
      latestRunEvents,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
