'use client';
// @ts-nocheck
import dynamic from 'next/dynamic';

const QRCode = dynamic(() => import('qrcode.react'), { ssr: false });

export function VerificationQr({ value }) {
  if (!value) return null;
  return (
    <div className="flex flex-col items-center gap-3">
      <QRCode value={value} size={160} bgColor="transparent" fgColor="#ffffff" includeMargin />
      <span className="text-sm text-white/60">Scan untuk membuka Discord</span>
    </div>
  );
}
