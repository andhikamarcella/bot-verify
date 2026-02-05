import './globals.css';
import Script from 'next/script';

export const metadata = {
  title: 'Discord Verification Portal',
  description: 'Secure your membership with captcha and trust checks.',
};

export default function RootLayout({ children }) {
  const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  const recaptchaEnterpriseSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;
  return (
    <html lang="en">
      <head>
        {recaptchaSiteKey ? (
          <Script src="https://www.google.com/recaptcha/api.js?render=explicit" strategy="beforeInteractive" />
        ) : recaptchaEnterpriseSiteKey ? (
          <Script
            src={`https://www.google.com/recaptcha/enterprise.js?render=${recaptchaEnterpriseSiteKey}`}
            strategy="beforeInteractive"
          />
        ) : null}
      </head>
      <body className="min-h-screen bg-gradient-to-br from-midnight via-gray-900 to-black text-white">
        {children}
      </body>
    </html>
  );
}
