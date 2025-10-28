/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.API_BASE_URL,
    NEXT_PUBLIC_RECAPTCHA_SITE_KEY: process.env.RECAPTCHA_SITE_KEY,
    NEXT_PUBLIC_DISCORD_BROWSER_URL:
      process.env.DISCORD_BROWSER_URL || 'https://discord.com/channels/@me',
  },
};

module.exports = nextConfig;
