'use client';

export default function Layout({ children, headline, description }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="max-w-2xl text-center">
        {headline && <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{headline}</h1>}
        {description && <p className="mt-4 text-lg text-white/70">{description}</p>}
      </div>
      <div className="mt-10 w-full max-w-3xl">{children}</div>
    </div>
  );
}
