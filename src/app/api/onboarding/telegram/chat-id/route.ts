// src/app/api/onboarding/telegram/chat-id/route.ts
// Poll getUpdates để lấy chat_id sau khi user gửi /start cho bot

import { NextRequest, NextResponse } from 'next/server';
import { saveCredential, getCredential } from '@/lib/credentials';
import { telegramApiCall } from '@/lib/telegram';
import { requireAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const botToken = await getCredential('telegram', 'bot_token');
  if (!botToken) {
    return NextResponse.json({ error: 'Bot token chưa được cấu hình' }, { status: 400 });
  }

  // Poll getUpdates (lấy updates mới nhất)
  const result = await telegramApiCall(botToken, 'getUpdates', {
    limit: 10,
    timeout: 5,
  });

  if (!result.ok) {
    return NextResponse.json({ error: `Lỗi Telegram API: ${result.description}` }, { status: 500 });
  }

  const updates = result.result as Array<{
    message?: { chat?: { id: number; type?: string; first_name?: string } };
  }>;

  // Tìm chat_id từ /start message
  let chatId: string | null = null;
  let chatName: string | null = null;

  for (const update of updates.reverse()) {
    const chat = update.message?.chat;
    if (chat?.id) {
      chatId = String(chat.id);
      chatName = chat.first_name ?? `Chat ${chat.id}`;
      break;
    }
  }

  if (!chatId) {
    return NextResponse.json({
      found: false,
      message: 'Chưa tìm thấy chat_id. Hãy gửi /start cho bot trong Telegram rồi thử lại.',
    });
  }

  // Lưu chat_id
  await saveCredential('telegram', 'chat_id', chatId);

  return NextResponse.json({
    found: true,
    chatId: '***' + chatId.slice(-4), // Mask
    chatName,
    message: `chat_id đã được lưu. Bot sẵn sàng gửi thông báo.`,
  });
}
