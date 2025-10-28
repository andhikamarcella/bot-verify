import './globals.css';

export const metadata = {
  title: 'Discord Member Verification',
  description: 'Modern verification flow with reCAPTCHA for Discord servers.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
