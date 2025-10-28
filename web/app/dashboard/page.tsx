'use client';
// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Card from '../../components/Card';
import Layout from '../../components/Layout';
import { apiFetch } from '../../lib/api';

const Line = dynamic(() => import('react-chartjs-2').then((mod) => mod.Line), { ssr: false });

const chartJsRegister = async () => {
  const Chart = await import('chart.js');
  const { Chart: ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } = Chart;
  ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);
};

export default function DashboardPage() {
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    chartJsRegister();
  }, []);

  useEffect(() => {
    const key = params.get('key');
    if (!key) {
      setError('Admin key tidak ditemukan. Tambahkan ?key=SECRET pada URL.');
      return;
    }
    setLoading(true);
    apiFetch('/api/dashboard/metrics', {
      headers: {
        Authorization: `Bearer ${key}`,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error(res.error || 'forbidden');
        setPayload(res);
      })
      .catch(() => {
        setError('Tidak bisa mengambil data dashboard. Pastikan ADMIN_KEY benar.');
      })
      .finally(() => setLoading(false));
  }, [params]);

  const chartData = useMemo(() => {
    if (!payload?.metrics?.dailyStats) return null;
    const labels = payload.metrics.dailyStats.map((stat) => stat._id);
    return {
      labels,
      datasets: [
        {
          label: 'Verified',
          data: payload.metrics.dailyStats.map((stat) => stat.verified),
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,0.25)',
        },
        {
          label: 'Failed',
          data: payload.metrics.dailyStats.map((stat) => stat.failed),
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239,68,68,0.25)',
        },
        {
          label: 'Trusted',
          data: payload.metrics.dailyStats.map((stat) => stat.trusted),
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56,189,248,0.25)',
        },
        {
          label: 'Banned',
          data: payload.metrics.dailyStats.map((stat) => stat.banned),
          borderColor: '#f97316',
          backgroundColor: 'rgba(249,115,22,0.25)',
        },
      ],
    };
  }, [payload]);

  return (
    <Layout headline="Admin Dashboard" description="Pantau kesehatan verifikasi dan potensi ancaman.">
      <div className="space-y-6">
        {error && <Card className="border-red-400/30 bg-red-500/10 text-red-200">{error}</Card>}
        {loading && <Card>Loading metrics...</Card>}
        {payload?.metrics && (
          <Card className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-white/60">Total Verified</p>
                <p className="text-2xl font-semibold">{payload.metrics.totals?.verified || 0}</p>
              </div>
              <div>
                <p className="text-sm text-white/60">Failed Attempts</p>
                <p className="text-2xl font-semibold">{payload.metrics.totals?.failed || 0}</p>
              </div>
              <div>
                <p className="text-sm text-white/60">Trusted Auto</p>
                <p className="text-2xl font-semibold">{payload.metrics.totals?.trusted || 0}</p>
              </div>
              <div>
                <p className="text-sm text-white/60">Banned / Flagged</p>
                <p className="text-2xl font-semibold">{payload.metrics.totals?.banned || 0}</p>
              </div>
            </div>
            {chartData && (
              <div className="h-64">
                <Line data={chartData} options={{ responsive: true, maintainAspectRatio: false }} />
              </div>
            )}
          </Card>
        )}

        {payload?.ipHashes && (
          <Card>
            <h2 className="text-xl font-semibold">IP Hash Logs</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2 font-semibold">Hash</th>
                    <th className="px-3 py-2 font-semibold">Attempts</th>
                    <th className="px-3 py-2 font-semibold">Unique Users</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {payload.ipHashes.map((entry) => (
                    <tr key={entry.hash}>
                      <td className="px-3 py-2 font-mono text-xs">{entry.hash}</td>
                      <td className="px-3 py-2">{entry.attempts}</td>
                      <td className="px-3 py-2">{entry.uniqueUsers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
