'use client';

import Link from 'next/link';

const baseClass =
  'inline-flex items-center justify-center rounded-2xl px-5 py-3 font-semibold shadow-lg shadow-indigo-900/40 transition-transform duration-200 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-discord-green focus-visible:ring-offset-2 focus-visible:ring-offset-night-sky';

const variants = {
  primary: 'bg-discord-purple text-white',
  success: 'bg-discord-green text-night-sky',
  outline: 'bg-transparent border border-white/20 text-white hover:bg-white/10',
};

export default function Button({ children, href, className = '', variant = 'primary', ...props }) {
  const variantClass = variants[variant] || variants.primary;
  const classes = `${baseClass} ${variantClass} ${className}`.trim();

  if (href) {
    if (href.startsWith('http') || href.startsWith('discord://')) {
      return (
        <a href={href} className={classes} {...props}>
          {children}
        </a>
      );
    }

    return (
      <Link href={href} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
