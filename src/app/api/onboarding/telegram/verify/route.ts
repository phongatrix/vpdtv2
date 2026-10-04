// src/app/api/onboarding/telegram/verify/route.ts
// Xác thực Telegram Bot Token + lấy chat_id

import { NextRequest, NextResponse } from 'next/server';
import { saveCredential, getCredential } from '@/lib/credentials';
import { telegramApiCall } from '@/lib/telegram';
import { isRateLimited, getRateLimitKey } from '@/lib/rate-limit';
import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (isRateLimited(getRateLimitKey(ip, '/api/onboarding/telegram/verify'), 5, 60_000)) {
    return NextResponse.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 });
  }

  const body = await req.json() as { botToken?: string };
  const { botToken } = body;

  if (!botToken) {
    return NextResponse.json({ error: 'Thiếu Bot Token' }, { status: 400 });
  }

  console.log(`[AUDIT] telegram-verify ip=${ip}`);

  // Gọi getMe để xác thực token
  const result = await telegramApiCall(botToken, 'getMe');

  if (!result.ok) {
    return NextResponse.json({
      success: false,
      error: `Token không hợp lệ: ${result.description}`,
    });
  }

  const botInfo = result.result as unknown as { username?: string; first_name?: string };

  // Lưu token vào DB
  await saveCredential('telegram', 'bot_token', botToken);

  return NextResponse.json({
    success: true,
    botName: botInfo.first_name ?? 'Bot',
    botUsername: botInfo.username ?? '',
    message: `Bot @${botInfo.username} đã xác thực. Bây giờ hãy chat /start với bot để lấy chat_id.`,
  });
}

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hasBotToken = !!(await getCredential('telegram', 'bot_token'));
  const chatId = await getCredential('telegram', 'chat_id');

  return NextResponse.json({
    connected: hasBotToken && !!chatId,
    hasBotToken,
    chatId: chatId ? '***' + chatId.slice(-4) : null,
    status: hasBotToken && chatId ? 'connected' : hasBotToken ? 'waiting_chat_id' : 'not_connected',
  });
}
