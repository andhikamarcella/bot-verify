'use client';

import { useEffect, useState } from 'react';

type LocaleKey = 'en' | 'id';

type CopyShape = {
  titleSuffix: string;
  subtitle: string;
  button: string;
  tokenMissing: string;
  verifying: string;
  successMessage: string;
  verifyFailed: string;
  captchaMissing: string;
  footer: string;
};

const COPY: Record<LocaleKey, CopyShape> = {
  en: {
    titleSuffix: 'Verification',
    subtitle: 'Complete this quick step to unlock the Member role.',
    button: 'Continue Verification',
    tokenMissing: 'Verification token is missing or expired.',
    verifying: 'Verifying your membership…',
    successMessage: '✅ Verification successful! Welcome to the guild.',
    verifyFailed: 'Verification failed. Please try again or contact staff.',
    captchaMissing: 'Please solve the captcha before continuing.',
    footer: 'Need help? Contact a moderator for manual assistance.',
  },
  id: {
    titleSuffix: 'Verification',
    subtitle: 'Selesaikan langkah singkat ini untuk mendapatkan role Member.',
    button: 'Lanjutkan Verifikasi',
    tokenMissing: 'Token verifikasi tidak ditemukan atau sudah kadaluarsa.',
    verifying: 'Sedang memverifikasi akun kamu…',
    successMessage: '✅ Verifikasi berhasil! Selamat datang di server.',
    verifyFailed: 'Verifikasi gagal. Coba lagi atau hubungi admin.',
    captchaMissing: 'Selesaikan captcha terlebih dahulu sebelum lanjut.',
    footer: 'Butuh bantuan? Hubungi moderator untuk verifikasi manual.',
  },
};

export function useLocaleCopy(): CopyShape {
  const [locale, setLocale] = useState<LocaleKey>('en');

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setLocale(navigator.language.startsWith('id') ? 'id' : 'en');
    }
  }, []);

  return COPY[locale];
}
