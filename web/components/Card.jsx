'use client';

export default function Card({ children, className = '' }) {
  return (
    <div
      className={`rounded-3xl bg-gradient-to-br from-white/10 via-white/5 to-white/10 p-8 shadow-2xl backdrop-blur-md border border-white/10 ${className}`}
    >
      {children}
    </div>
  );
}
