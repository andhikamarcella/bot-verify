/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        'night-sky': '#0f172a',
        'night-sky-light': '#1e293b',
        'discord-purple': '#5865F2',
        'discord-green': '#57F287',
      },
      boxShadow: {
        glow: '0 20px 60px -15px rgba(88, 101, 242, 0.45)',
      },
    },
  },
  plugins: [],
};
