import './globals.css';

export const metadata = {
  title: 'Discord Verification Portal',
  description: 'Secure your membership with captcha and trust checks.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-br from-midnight via-gray-900 to-black text-white">
        {children}
      </body>
    </html>
  );
}
