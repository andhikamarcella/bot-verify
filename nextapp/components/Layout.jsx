'use client';

export default function Layout({ title, subtitle, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl flex flex-col items-center gap-6 text-center">
        {title ? (
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white drop-shadow">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-slate-300 text-base sm:text-lg">{subtitle}</p>
            ) : null}
          </div>
        ) : null}
        {children}
        <p className="text-xs text-slate-500">
          Powered by your friendly Discord guardian bot.
        </p>
      </div>
    </div>
  );
}
