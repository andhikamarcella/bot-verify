'use client';

import dynamic from 'next/dynamic';

const QRCode = dynamic(() => import('qrcode.react'), { ssr: false });

interface QrCodeBlockProps {
  value: string;
}

export function QrCodeBlock({ value }: QrCodeBlockProps) {
  if (!value) {
    return null;
  }
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-neutral-900/50 p-4 border border-white/10">
      <QRCode value={value} size={156} bgColor="#0f172a" fgColor="#f8fafc" level="M" />
      <p className="text-xs text-white/60 text-center">
        Scan dengan kamera HP untuk membuka Discord di browser atau aplikasi.
      </p>
    </div>
  );
}
