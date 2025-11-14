interface StatCard {
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'rose';
}

const toneClasses: Record<StatCard['tone'], string> = {
  emerald: 'from-emerald-500/20 to-emerald-500/5 text-emerald-200 border-emerald-500/30',
  amber: 'from-amber-500/20 to-amber-500/5 text-amber-200 border-amber-500/30',
  rose: 'from-rose-500/20 to-rose-500/5 text-rose-200 border-rose-500/30',
};

export function StatsCards({ stats }: { stats: StatCard[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`rounded-2xl border bg-gradient-to-br p-5 shadow-lg ${toneClasses[stat.tone]}`}
        >
          <p className="text-xs uppercase tracking-wide text-white/60">{stat.label}</p>
          <p className="mt-2 text-2xl font-semibold">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}
