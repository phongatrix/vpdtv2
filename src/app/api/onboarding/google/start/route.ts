import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { saveCredential } from '@/lib/credentials';
import nodemailer from 'nodemailer';

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as {
    email?: string;
    appPassword?: string;
  };

  const { email, appPassword } = body;

  if (!email || !appPassword) {
    return NextResponse.json({ error: 'Thiếu email hoặc mật khẩu ứng dụng' }, { status: 400 });
  }

  try {
    // Test the connection
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: email,
        pass: appPassword
      }
    });

    await transporter.verify();

    // Save credentials
    await saveCredential('google', 'gmail_address', email);
    await saveCredential('google', 'gmail_app_password', appPassword);
    
    // Legacy support to mark it connected
    await saveCredential('google', 'refresh_token', 'app_password_mode');
    await saveCredential('google', 'gmail_to_address', email); // send to self

    return NextResponse.json({ success: true, message: 'Đã kết nối qua Mật khẩu ứng dụng' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Lỗi xác thực App Password:', msg);
    return NextResponse.json({ error: 'Xác thực thất bại. Vui lòng kiểm tra lại Email và Mật khẩu ứng dụng.' }, { status: 400 });
  }
}
