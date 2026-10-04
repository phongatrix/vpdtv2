'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
interface Run {
  id: string;
  started_at: string;
  finished_at?: string;
  status: 'running' | 'completed' | 'failed';
  stage_reached?: string;
  new_count: number;
  uploaded_count: number;
  emailed_count: number;
  telegram_ok: number;
  error?: string;
}

interface StageEvent {
  stage: string;
  status: 'STARTED' | 'DONE' | 'FAILED' | 'SKIPPED';
  detail?: string;
  created_at: string;
}

interface StatusData {
  onboardingComplete: boolean;
  credentials: {
    vpdt: { username?: string; connected: boolean };
    google: { email?: string; connected: boolean };
    telegram: { connected: boolean };
  };
  recentRuns: Run[];
  latestRunEvents: StageEvent[];
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function formatTime(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function RunStatusBadge({ status }: { status: Run['status'] }) {
  const map = {
    running: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    completed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    failed: 'bg-red-500/20 text-red-300 border-red-500/30',
  };
  const labels = { running: '⏳ Đang chạy', completed: '✅ Hoàn tất', failed: '❌ Thất bại' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border font-medium ${map[status]}`}>
      {labels[status]}
    </span>
  );
}

function StagePill({ event }: { event: StageEvent }) {
  const icons = { STARTED: '⏳', DONE: '✅', FAILED: '❌', SKIPPED: '⏭️' };
  const colors = {
    STARTED: 'border-blue-500/30 bg-blue-500/10',
    DONE: 'border-emerald-500/30 bg-emerald-500/10',
    FAILED: 'border-red-500/30 bg-red-500/10',
    SKIPPED: 'border-white/10 bg-white/5',
  };
  return (
    <div className={`flex items-start gap-2 p-3 rounded-xl border ${colors[event.status]}`}>
      <span className="text-sm">{icons[event.status]}</span>
      <div>
        <p className="text-sm font-medium text-white">{event.stage}</p>
        {event.detail && <p className="text-xs text-white/50 mt-0.5">{event.detail}</p>}
        <p className="text-xs text-white/30 mt-1">{formatTime(event.created_at)}</p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main Dashboard
// ──────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string>('');
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [activeTab, setActiveTab] = useState<'runs' | 'docs'>('runs');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json() as StatusData;
      setData(json);
      if (!json.onboardingComplete) {
        router.push('/onboarding');
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000); // Auto-refresh 30s
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleManualSync = async () => {
    setSyncing(true);
    setSyncResult('');
    try {
      const res = await fetch('/api/sync/manual', { method: 'POST' });
      const json = await res.json() as { status?: string; runId?: string; error?: string };
      if (res.ok) {
        setSyncResult(`✅ Sync hoàn tất (Run: ${json.runId})`);
        await fetchStatus();
      } else {
        setSyncResult(`❌ ${json.error ?? 'Lỗi không xác định'}`);
      }
    } catch (e) {
      setSyncResult(`❌ Lỗi: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/login', { method: 'DELETE' });
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white/50 flex items-center gap-3">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Đang tải...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-500/8 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-blue-500/8 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">VPĐT Forwarder</h1>
              <p className="text-xs text-white/40">Cron: 06:00 & 17:00 VN</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/onboarding')}
              className="px-3 py-1.5 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-white/60 border border-white/10 transition-colors"
            >
              ⚙️ Cấu hình
            </button>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-white/60 border border-white/10 transition-colors"
            >
              Đăng xuất
            </button>
          </div>
        </div>

        {/* Connection status cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            {
              label: 'VPĐT',
              icon: '🏛️',
              connected: data?.credentials.vpdt.connected,
              detail: data?.credentials.vpdt.username ?? 'Chưa cấu hình',
            },
            {
              label: 'Gmail / Drive',
              icon: '📧',
              connected: data?.credentials.google.connected,
              detail: data?.credentials.google.email ?? 'Chưa cấu hình',
            },
            {
              label: 'Telegram',
              icon: '📱',
              connected: data?.credentials.telegram.connected,
              detail: data?.credentials.telegram.connected ? 'Bot sẵn sàng' : 'Chưa cấu hình',
            },
          ].map((service) => (
            <div
              key={service.label}
              className={`p-4 rounded-2xl border backdrop-blur-xl ${
                service.connected
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-red-500/5 border-red-500/20'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span>{service.icon}</span>
                <span className="text-sm font-medium text-white">{service.label}</span>
                <span className={`ml-auto w-2 h-2 rounded-full ${service.connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
              </div>
              <p className="text-xs text-white/40 truncate">{service.detail}</p>
            </div>
          ))}
        </div>

        {/* Manual sync button */}
        <div className="mb-6">
          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600
                       hover:from-indigo-500 hover:to-blue-500
                       disabled:opacity-50 text-white font-semibold text-sm
                       transition-all shadow-lg shadow-indigo-500/20
                       flex items-center gap-2"
          >
            {syncing ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Đang chạy sync...
              </>
            ) : (
              <>▶ Chạy thử ngay</>
            )}
          </button>
          {syncResult && (
            <p className={`text-sm mt-2 ${syncResult.startsWith('✅') ? 'text-emerald-300' : 'text-red-300'}`}>
              {syncResult}
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {(['runs', 'docs'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              {tab === 'runs' ? '🔄 Lịch sử chạy' : '📄 Văn bản đã chuyển'}
            </button>
          ))}
        </div>

        {/* Runs list */}
        {activeTab === 'runs' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Run list */}
            <div className="space-y-2">
              {data?.recentRuns.length === 0 && (
                <div className="text-center py-12 text-white/30 text-sm">
                  Chưa có lần chạy nào. Nhấn &quot;Chạy thử ngay&quot; để bắt đầu.
                </div>
              )}
              {data?.recentRuns.map((run) => (
                <button
                  key={run.id}
                  onClick={() => setSelectedRun(run)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${
                    selectedRun?.id === run.id
                      ? 'bg-white/10 border-white/20'
                      : 'bg-white/5 border-white/10 hover:bg-white/8'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-white/40">{run.id}</span>
                    <RunStatusBadge status={run.status} />
                  </div>
                  <p className="text-xs text-white/50">{formatTime(run.started_at)}</p>
                  <div className="flex gap-3 mt-2 text-xs text-white/40">
                    <span>🆕 {run.new_count}</span>
                    <span>☁️ {run.uploaded_count}</span>
                    <span>📧 {run.emailed_count}</span>
                  </div>
                  {run.error && (
                    <p className="text-xs text-red-300 mt-1 truncate">{run.error}</p>
                  )}
                </button>
              ))}
            </div>

            {/* Stage timeline */}
            <div>
              {selectedRun ? (
                <div className="bg-white/5 rounded-2xl border border-white/10 p-4">
                  <h3 className="text-sm font-semibold text-white mb-3">
                    Timeline — {selectedRun.id}
                  </h3>
                  <div className="space-y-2">
                    {data?.latestRunEvents.map((event, i) => (
                      <StagePill key={i} event={event} />
                    ))}
                    {data?.latestRunEvents.length === 0 && (
                      <p className="text-xs text-white/30 text-center py-4">Không có stage event</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white/5 rounded-2xl border border-white/10 p-4 flex items-center justify-center h-32">
                  <p className="text-white/30 text-sm">Chọn một run để xem timeline</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'docs' && (
          <div className="bg-white/5 rounded-2xl border border-white/10 p-4">
            <p className="text-center text-white/30 text-sm py-8">
              Danh sách văn bản sẽ hiển thị ở đây sau lần sync đầu tiên
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-white/20">
          VPĐT Forwarder · Vercel Hobby · GitHub · Chi phí: $0/tháng
        </div>
      </div>
    </div>
  );
}
