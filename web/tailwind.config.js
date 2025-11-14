/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        midnight: '#0f172a',
        indigoPulse: '#6366f1',
        cyberPink: '#ec4899',
      },
    },
  },
  plugins: [],
};
