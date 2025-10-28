'use client';

import { useEffect, useState } from 'react';
import { getApiBaseUrl } from '../../lib/api';
import { StatsCards } from '../../components/StatsCards';
import { LineChartDaily } from '../../components/LineChartDaily';

interface MetricsResponse {
  ok: boolean;
  totalVerified: number;
  totalFailed: number;
  totalBanned: number;
  graphData: Array<{ _id: string; verifiedCount: number; failedCount: number; bannedCount: number }>;
  ipHashLogs: Array<{ ipHash: string; userIds: string[]; count: number; lastAt: string }>;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState<string>('');
  const apiBase = getApiBaseUrl();
  const adminKey = process.env.NEXT_PUBLIC_ADMIN_KEY || '';

  useEffect(() => {
    fetch(`${apiBase}/api/dashboard/metrics`, {
      headers: {
        Authorization: `Bearer ${adminKey}`,
      },
    })
      .then((res) => res.json())
      .then((data: MetricsResponse) => {
        if (!data.ok) {
          setError('Unauthorized');
          return;
        }
        setMetrics(data);
      })
      .catch(() => setError('Failed to load metrics.'));
  }, [adminKey, apiBase]);

  if (error) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
        <div className="rounded-3xl bg-neutral-900/60 border border-white/10 p-6 text-center max-w-md">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      </main>
    );
  }

  if (!metrics) {
    return (
      <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
        <p className="text-sm text-white/60">Loading metrics…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Verification Dashboard</h1>
          <p className="text-sm text-white/60">
            Lihat performa harian verifikasi, statistik role, dan log IP yang mencurigakan.
          </p>
        </header>

        <StatsCards
          stats={[
            { label: 'Total Verified', value: metrics.totalVerified, tone: 'emerald' },
            { label: 'Total Failed', value: metrics.totalFailed, tone: 'amber' },
            { label: 'Total Banned', value: metrics.totalBanned, tone: 'rose' },
          ]}
        />

        <section className="rounded-3xl border border-white/10 bg-neutral-900/40 p-6 shadow-xl">
          <h2 className="text-lg font-semibold mb-4">Aktivitas Harian</h2>
          <LineChartDaily data={metrics.graphData} />
        </section>

        <section className="rounded-3xl border border-white/10 bg-neutral-900/40 p-6 shadow-xl">
          <h2 className="text-lg font-semibold mb-4">IP Hash Logs</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-white/60">
                <tr>
                  <th className="pb-3">IP Hash</th>
                  <th className="pb-3">Unique Users</th>
                  <th className="pb-3">Attempts</th>
                  <th className="pb-3">Last Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {metrics.ipHashLogs.map((log) => (
                  <tr key={log.ipHash} className="text-white/80">
                    <td className="py-3 font-mono text-xs">{log.ipHash}</td>
                    <td className="py-3">{log.userIds.length}</td>
                    <td className="py-3">{log.count}</td>
                    <td className="py-3 text-white/60">{new Date(log.lastAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
