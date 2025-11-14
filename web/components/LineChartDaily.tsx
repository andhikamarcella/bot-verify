'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

interface DailyPoint {
  _id: string;
  verifiedCount: number;
  failedCount: number;
  bannedCount: number;
}

export function LineChartDaily({ data }: { data: DailyPoint[] }) {
  if (!data.length) {
    return <p className="text-sm text-white/50">Belum ada data harian.</p>;
  }

  const chartData = {
    labels: data.map((item) => item._id),
    datasets: [
      {
        label: 'Verified',
        data: data.map((item) => item.verifiedCount),
        borderColor: '#34d399',
        backgroundColor: '#34d39933',
      },
      {
        label: 'Failed',
        data: data.map((item) => item.failedCount),
        borderColor: '#fbbf24',
        backgroundColor: '#fbbf2433',
      },
      {
        label: 'Banned',
        data: data.map((item) => item.bannedCount),
        borderColor: '#f87171',
        backgroundColor: '#f8717133',
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        labels: {
          color: '#e2e8f0',
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#94a3b8' },
        grid: { color: '#1e293b' },
      },
      y: {
        ticks: { color: '#94a3b8' },
        grid: { color: '#1e293b' },
      },
    },
  } as const;

  return <Line data={chartData} options={options} />;
}
