'use client';

export default function Card({ children, className = '' }) {
  return (
    <div
      className={`w-full rounded-3xl bg-gradient-to-br from-night-sky-light/80 via-night-sky/80 to-night-sky-light/40 p-6 sm:p-8 shadow-glow border border-white/5 backdrop-blur ${className}`.trim()}
    >
      {children}
    </div>
  );
}
