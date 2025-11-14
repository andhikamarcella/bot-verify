'use client';

export default function Button({ children, className = '', as: Component = 'button', ...props }) {
  return (
    <Component
      className={`inline-flex items-center justify-center rounded-2xl bg-indigoPulse px-6 py-3 font-semibold text-white shadow-lg transition duration-150 hover:scale-[1.03] hover:bg-cyberPink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyberPink disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
}
