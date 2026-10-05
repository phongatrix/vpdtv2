'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
type ConnectionStatus = 'idle' | 'loading' | 'connected' | 'blocked' | 'error' | 'waiting';

interface SectionStatus {
  vpdt: ConnectionStatus;
  vpdtMsg: string;
  google: ConnectionStatus;
  googleMsg: string;
  telegram: ConnectionStatus;
  telegramMsg: string;
}

// ──────────────────────────────────────────────
// StatusBadge component
// ──────────────────────────────────────────────
function StatusBadge({ status, message }: { status: ConnectionStatus; message: string }) {
  const configs: Record<ConnectionStatus, { bg: string; text: string; icon: React.ReactNode }> = {
    idle: {
      bg: 'bg-white/5 border-white/10',
      text: 'text-white/40',
      icon: <span className="w-2 h-2 rounded-full bg-white/20 inline-block" />,
    },
    loading: {
      bg: 'bg-blue-500/10 border-blue-500/30',
      text: 'text-blue-300',
      icon: (
        <svg className="animate-spin w-3 h-3 inline" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ),
    },
    connected: {
      bg: 'bg-emerald-500/10 border-emerald-500/30',
      text: 'text-emerald-300',
      icon: <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />,
    },
    blocked: {
      bg: 'bg-amber-500/10 border-amber-500/30',
      text: 'text-amber-300',
      icon: <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />,
    },
    error: {
      bg: 'bg-red-500/10 border-red-500/30',
      text: 'text-red-300',
      icon: <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />,
    },
    waiting: {
      bg: 'bg-yellow-500/10 border-yellow-500/30',
      text: 'text-yellow-300',
      icon: <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse inline-block" />,
    },
  };

  const c = configs[status];
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${c.bg} ${c.text}`}>
      {c.icon}
      <span>{message || 'Chưa kết nối'}</span>
    </div>
  );
}

// ──────────────────────────────────────────────
// Section A: VPĐT
// ──────────────────────────────────────────────
function VpdtSection({
  status,
  message,
  onStatusChange,
}: {
  status: ConnectionStatus;
  message: string;
  onStatusChange: (s: ConnectionStatus, m: string) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [cookie, setCookie] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const handleAutoConnect = async () => {
    if (!username || !password) return;
    onStatusChange('loading', 'Đang kết nối VPĐT...');
    try {
      const res = await fetch('/api/onboarding/vpdt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, mode: 'auto' }),
      });
      const data = await res.json() as { success?: boolean; blocked?: boolean; message?: string; status?: string; error?: string };
      if (data.success) {
        onStatusChange('connected', data.message ?? 'Đã kết nối');
      } else if (data.blocked) {
        onStatusChange('blocked', data.message ?? 'WAF chặn IP');
        setShowManual(true);
      } else {
        onStatusChange('error', data.error ?? data.message ?? 'Lỗi kết nối');
      }
    } catch (e) {
      onStatusChange('error', 'Lỗi: ' + String(e));
    }
  };

  const handleManualCookie = async () => {
    if (!cookie) return;
    onStatusChange('loading', 'Đang lưu cookie thủ công...');
    try {
      const res = await fetch('/api/onboarding/vpdt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, cookie, mode: 'manual' }),
      });
      const data = await res.json() as { success?: boolean; message?: string; error?: string };
      if (data.success) {
        onStatusChange('connected', 'Cookie thủ công đã được lưu');
      } else {
        onStatusChange('error', data.error ?? data.message ?? 'Lỗi');
      }
    } catch (e) {
      onStatusChange('error', 'Lỗi: ' + String(e));
    }
  };

  return (
    <div className="space-y-4">
      <StatusBadge status={status} message={message || 'Chưa kết nối'} />

      {/* Auto login form */}
      <div className="space-y-3">
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Tên đăng nhập VPĐT"
          className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Mật khẩu"
          className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={handleAutoConnect}
          disabled={status === 'loading' || !username || !password}
          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          {status === 'loading' ? 'Đang kết nối...' : 'Kết nối tự động'}
        </button>
      </div>

      {/* Toggle manual cookie */}
      <button
        onClick={() => setShowManual(!showManual)}
        className="text-xs text-white/40 hover:text-white/60 underline transition-colors"
      >
        {showManual ? 'Ẩn' : 'Bị WAF chặn? Dùng cookie thủ công'}
      </button>

      {showManual && (
        <div className="space-y-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
          <div className="flex items-start gap-2">
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="text-xs text-amber-300 hover:text-amber-200 flex items-center gap-1"
            >
              <span>📖 Hướng dẫn copy Cookie</span>
              <span>{showGuide ? '▲' : '▼'}</span>
            </button>
          </div>

          {showGuide && (
            <ol className="text-xs text-white/50 space-y-1 list-decimal list-inside">
              <li>Mở trình duyệt cá nhân, đăng nhập <a href="https://vpdt.dongthap.gov.vn" target="_blank" className="text-indigo-400 underline">vpdt.dongthap.gov.vn</a></li>
              <li>Nhấn F12 → tab Network → tải lại trang (F5)</li>
              <li>Click request đầu tiên → tab Headers</li>
              <li>Tìm header <code className="bg-white/10 px-1 rounded">Cookie</code> → copy toàn bộ giá trị</li>
              <li>Dán vào ô bên dưới</li>
            </ol>
          )}

          <textarea
            value={cookie}
            onChange={e => setCookie(e.target.value)}
            placeholder="Dán Cookie header vào đây..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/20 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
          />
          <button
            onClick={handleManualCookie}
            disabled={!cookie || status === 'loading'}
            className="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            Lưu Cookie thủ công
          </button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Section B: Gmail App Password + Drive OAuth
// ──────────────────────────────────────────────
function GoogleSection({
  status,
  message,
  onStatusChange,
}: {
  status: ConnectionStatus;
  message: string;
  onStatusChange: (s: ConnectionStatus, m: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [showDriveGuide, setShowDriveGuide] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const driveSaved = false;

  const handleConnect = async () => {
    if (!email || !appPassword) return;
    onStatusChange('loading', 'Đang xác thực...');
    try {
      const res = await fetch('/api/onboarding/google/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, appPassword }),
      });
      const data = await res.json() as { success?: boolean; message?: string; error?: string };
      if (data.success) {
        onStatusChange('connected', data.message ?? 'Đã kết nối qua App Password');
      } else {
        onStatusChange('error', data.error ?? data.message ?? 'Lỗi');
      }
    } catch (e) {
      onStatusChange('error', 'Lỗi: ' + String(e));
    }
  };

  const handleSaveDrive = async () => {
    if (!clientId || !clientSecret) return;
    try {
      const res = await fetch('/api/onboarding/google/drive-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret }),
      });
      const data = await res.json() as { success?: boolean; authUrl?: string; error?: string };
      if (data.success && data.authUrl) {
        // Redirect to Google consent screen
        window.location.href = data.authUrl;
      } else {
        alert(data.error ?? 'Lỗi khi lưu Drive credentials');
      }
    } catch (e) {
      alert('Lỗi kết nối: ' + String(e));
    }
  };

  return (
    <div className="space-y-4">
      <StatusBadge status={status} message={message || 'Chưa kết nối'} />

      {/* ─── App Password (Email) ─── */}
      <div className="p-4 rounded-xl bg-white/3 border border-white/10 space-y-3">
        <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">📧 Gmail — Gửi Email thông báo</p>

        <button
          onClick={() => setShowGuide(!showGuide)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-blue-500/5 border border-blue-500/20 text-sm text-blue-300 hover:bg-blue-500/10 transition-colors"
        >
          <span>📋 Hướng dẫn tạo Mật khẩu ứng dụng Gmail</span>
          <span>{showGuide ? '▲' : '▼'}</span>
        </button>

        {showGuide && (
          <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 space-y-2">
            <ol className="text-xs text-white/60 space-y-2 list-decimal list-inside">
              <li>Vào tài khoản Google của bạn → Bảo mật (Security)</li>
              <li>Bật <strong>Xác minh 2 bước (2-Step Verification)</strong> nếu chưa bật.</li>
              <li>Sau khi bật, tìm mục <strong>Mật khẩu ứng dụng (App Passwords)</strong>.</li>
              <li>Tạo một mật khẩu mới (nhập tên bất kỳ, ví dụ: &quot;VPDT App&quot;).</li>
              <li>Copy mật khẩu (16 chữ cái) đó và dán vào ô bên dưới.</li>
            </ol>
          </div>
        )}

        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Địa chỉ Gmail (VD: ten@gmail.com)"
          className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="password"
          value={appPassword}
          onChange={e => setAppPassword(e.target.value)}
          placeholder="Mật khẩu ứng dụng (16 ký tự, không chứa dấu cách)"
          className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleConnect}
          disabled={status === 'loading' || !email || !appPassword}
          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          Xác thực Gmail
        </button>
      </div>

      {/* ─── Google Drive OAuth ─── */}
      <div className="p-4 rounded-xl bg-white/3 border border-white/10 space-y-3">
        <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">☁️ Google Drive — Lưu trữ văn bản</p>

        <button
          onClick={() => setShowDriveGuide(!showDriveGuide)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-sm text-emerald-300 hover:bg-emerald-500/10 transition-colors"
        >
          <span>📋 Hướng dẫn tạo Google OAuth Client ID</span>
          <span>{showDriveGuide ? '▲' : '▼'}</span>
        </button>

        {showDriveGuide && (
          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 space-y-2">
            <ol className="text-xs text-white/60 space-y-2 list-decimal list-inside">
              <li>Vào <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" className="text-emerald-400 underline">console.cloud.google.com</a></li>
              <li>Tạo Project mới (hoặc chọn project hiện có)</li>
              <li>Vào <strong>APIs &amp; Services → Enable APIs</strong> → bật <strong>Google Drive API</strong></li>
              <li>Vào <strong>APIs &amp; Services → OAuth consent screen</strong> → chọn External → điền tên app</li>
              <li>Thêm scope: <code className="bg-white/10 px-1 rounded">.../auth/drive.file</code></li>
              <li>Vào <strong>APIs &amp; Services → Credentials → Create Credentials → OAuth 2.0 Client ID</strong></li>
              <li>Application type: <strong>Web application</strong></li>
              <li>Authorized redirect URIs: thêm <code className="bg-white/10 px-1 rounded text-yellow-300">https://vpdtv2-ikl4.vercel.app/api/onboarding/google/callback</code></li>
              <li>Copy <strong>Client ID</strong> và <strong>Client Secret</strong> dán vào bên dưới</li>
            </ol>
          </div>
        )}

        <input
          type="text"
          value={clientId}
          onChange={e => setClientId(e.target.value)}
          placeholder="Google Client ID (kết thúc bằng .apps.googleusercontent.com)"
          className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <input
          type="password"
          value={clientSecret}
          onChange={e => setClientSecret(e.target.value)}
          placeholder="Google Client Secret"
          className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {driveSaved && (
          <p className="text-xs text-emerald-400">✅ Đã lưu credentials. Nhấn nút bên dưới để xác thực với Google.</p>
        )}
        <button
          onClick={handleSaveDrive}
          disabled={!clientId || !clientSecret}
          className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          🔗 Kết nối Google Drive (OAuth)
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Section C: Telegram
// ──────────────────────────────────────────────
function TelegramSection({
  status,
  message,
  onStatusChange,
}: {
  status: ConnectionStatus;
  message: string;
  onStatusChange: (s: ConnectionStatus, m: string) => void;
}) {
  const [botToken, setBotToken] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [botVerified, setBotVerified] = useState(false);
  const [botName, setBotName] = useState('');

  const handleVerifyBot = async () => {
    if (!botToken) return;
    onStatusChange('loading', 'Đang xác thực Bot Token...');
    try {
      const res = await fetch('/api/onboarding/telegram/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken }),
      });
      const data = await res.json() as { success?: boolean; botUsername?: string; botName?: string; error?: string; message?: string };
      if (data.success) {
        setBotVerified(true);
        setBotName(data.botUsername ?? '');
        onStatusChange('waiting', data.message ?? `Bot @${data.botUsername} đã xác thực`);
      } else {
        onStatusChange('error', data.error ?? 'Token không hợp lệ');
      }
    } catch (e) {
      onStatusChange('error', 'Lỗi: ' + String(e));
    }
  };

  const handleGetChatId = async () => {
    onStatusChange('loading', 'Đang tìm chat_id...');
    try {
      const res = await fetch('/api/onboarding/telegram/chat-id');
      const data = await res.json() as { found?: boolean; chatId?: string; chatName?: string; message?: string };
      if (data.found) {
        onStatusChange('connected', `Đã kết nối (bot: @${botName}, chat: ${data.chatId})`);
      } else {
        onStatusChange('waiting', data.message ?? 'Chưa tìm thấy chat_id');
      }
    } catch (e) {
      onStatusChange('error', 'Lỗi: ' + String(e));
    }
  };

  return (
    <div className="space-y-4">
      <StatusBadge status={status} message={message || 'Chưa kết nối'} />

      {/* Guide accordion */}
      <button
        onClick={() => setShowGuide(!showGuide)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-sky-500/5 border border-sky-500/20 text-sm text-sky-300 hover:bg-sky-500/10 transition-colors"
      >
        <span>📱 Hướng dẫn tạo Telegram Bot</span>
        <span>{showGuide ? '▲' : '▼'}</span>
      </button>

      {showGuide && (
        <div className="p-4 rounded-xl bg-sky-500/5 border border-sky-500/10 space-y-2">
          <ol className="text-xs text-white/60 space-y-2 list-decimal list-inside">
            <li>Mở Telegram → tìm kiếm <strong className="text-white/80">@BotFather</strong></li>
            <li>Gõ lệnh <code className="bg-white/10 px-1 rounded">/newbot</code></li>
            <li>Đặt tên cho bot (VD: <em>VPDT Forwarder Bot</em>)</li>
            <li>Đặt username (phải kết thúc bằng <em>bot</em>, VD: <em>vpdt_forwarder_bot</em>)</li>
            <li>BotFather gửi lại <strong className="text-white/80">Bot Token</strong> → copy và dán vào bên dưới</li>
          </ol>
          <p className="text-xs text-amber-300/70 mt-2">
            ⚠️ QR Login không khả thi trên Vercel serverless. Vui lòng dùng Bot.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <input
          type="text"
          value={botToken}
          onChange={e => setBotToken(e.target.value)}
          placeholder="Bot Token (123456789:ABCdefGhI...)"
          className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
        />
        <button
          onClick={handleVerifyBot}
          disabled={status === 'loading' || !botToken}
          className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          {status === 'loading' && !botVerified ? 'Đang xác thực...' : 'Xác thực Bot Token'}
        </button>
      </div>

      {botVerified && status !== 'connected' && (
        <div className="space-y-3 p-4 rounded-xl bg-sky-500/5 border border-sky-500/20">
          <p className="text-xs text-white/60">
            ✅ Bot <strong className="text-sky-300">@{botName}</strong> đã xác thực.<br />
            Bây giờ: mở Telegram → tìm <strong className="text-sky-300">@{botName}</strong> → gửi <code className="bg-white/10 px-1 rounded">/start</code>
          </p>
          <button
            onClick={handleGetChatId}
            disabled={status === 'loading'}
            className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {status === 'loading' ? 'Đang tìm...' : '🔍 Tôi đã gửi /start — Lấy chat_id'}
          </button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Main OnboardingPage
// ──────────────────────────────────────────────
function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<'vpdt' | 'google' | 'telegram'>('vpdt');

  const [sectionStatus, setSectionStatus] = useState<SectionStatus>({
    vpdt: 'idle',
    vpdtMsg: 'Chưa kết nối',
    google: 'idle',
    googleMsg: 'Chưa kết nối',
    telegram: 'idle',
    telegramMsg: 'Chưa kết nối',
  });

  // Xử lý callback từ Google OAuth
  useEffect(() => {
    const section = searchParams.get('section');
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const email = searchParams.get('email');

    if (section === 'google') {
      if (success === '1') {
        setSectionStatus(prev => ({
          ...prev,
          google: 'connected',
          googleMsg: `Đã kết nối (Gmail: ${email ?? 'unknown'})`,
        }));
        setActiveSection('telegram');
      } else if (error) {
        setSectionStatus(prev => ({
          ...prev,
          google: 'error',
          googleMsg: `LỖI: ${decodeURIComponent(error)}`,
        }));
        setActiveSection('google');
      }
    }
  }, [searchParams]);

  const allConnected =
    (sectionStatus.vpdt === 'connected') &&
    (sectionStatus.google === 'connected') &&
    (sectionStatus.telegram === 'connected');

  const sections = [
    { key: 'vpdt' as const, label: 'VPĐT Đồng Tháp', icon: '🏛️', status: sectionStatus.vpdt },
    { key: 'google' as const, label: 'Gmail / Drive', icon: '📧', status: sectionStatus.google },
    { key: 'telegram' as const, label: 'Telegram Bot', icon: '📱', status: sectionStatus.telegram },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-2xl mx-auto py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/30">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white">Thiết lập kết nối</h1>
          <p className="text-white/50 mt-2">Kết nối 3 dịch vụ để bắt đầu tự động hóa</p>
        </div>

        {/* Section tabs */}
        <div className="grid grid-cols-3 gap-2 mb-6">
            {sections.map((s) => (
              <button
                key={s.key}
              onClick={() => setActiveSection(s.key)}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
                activeSection === s.key
                  ? 'bg-white/10 border-white/20 text-white'
                  : 'bg-white/5 border-white/5 text-white/40 hover:border-white/15'
              }`}
            >
              <span className="text-xl">{s.icon}</span>
              <span className="text-xs font-medium">{s.label}</span>
              <div className={`w-1.5 h-1.5 rounded-full ${
                s.status === 'connected' ? 'bg-emerald-400' :
                s.status === 'error' ? 'bg-red-400' :
                s.status === 'waiting' ? 'bg-yellow-400 animate-pulse' :
                s.status === 'blocked' ? 'bg-amber-400' :
                s.status === 'loading' ? 'bg-blue-400 animate-pulse' :
                'bg-white/20'
              }`} />
            </button>
          ))}
        </div>

        {/* Section content */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
          {activeSection === 'vpdt' && (
            <>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                🏛️ Section A — VPĐT Đồng Tháp
              </h2>
              <VpdtSection
                status={sectionStatus.vpdt}
                message={sectionStatus.vpdtMsg}
                onStatusChange={(s, m) => setSectionStatus(p => ({ ...p, vpdt: s, vpdtMsg: m }))}
              />
              {(sectionStatus.vpdt === 'connected' || sectionStatus.vpdt === 'blocked') && (
                <button
                  onClick={() => setActiveSection('google')}
                  className="mt-4 w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm transition-colors"
                >
                  Tiếp theo: Gmail / Drive →
                </button>
              )}
            </>
          )}

          {activeSection === 'google' && (
            <>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                📧 Section B — Gmail / Google Drive
              </h2>
              <GoogleSection
                status={sectionStatus.google}
                message={sectionStatus.googleMsg}
                onStatusChange={(s, m) => setSectionStatus(p => ({ ...p, google: s, googleMsg: m }))}
              />
              {sectionStatus.google === 'connected' && (
                <button
                  onClick={() => setActiveSection('telegram')}
                  className="mt-4 w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm transition-colors"
                >
                  Tiếp theo: Telegram Bot →
                </button>
              )}
            </>
          )}

          {activeSection === 'telegram' && (
            <>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                📱 Section C — Telegram Bot
              </h2>
              <TelegramSection
                status={sectionStatus.telegram}
                message={sectionStatus.telegramMsg}
                onStatusChange={(s, m) => setSectionStatus(p => ({ ...p, telegram: s, telegramMsg: m }))}
              />
            </>
          )}
        </div>

        {/* All connected banner */}
        {allConnected && (
          <div className="mt-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center">
            <p className="text-emerald-300 font-semibold">✅ Tất cả dịch vụ đã kết nối!</p>
            <button
              onClick={() => router.push('/')}
              className="mt-3 px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
            >
              Vào Dashboard →
            </button>
          </div>
        )}

        {/* Skip */}
        <div className="text-center mt-4">
          <button
            onClick={() => router.push('/')}
            className="text-xs text-white/30 hover:text-white/50 underline transition-colors"
          >
            Bỏ qua — vào dashboard (một số tính năng sẽ bị vô hiệu hóa)
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white/50">Đang tải...</div>
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}
