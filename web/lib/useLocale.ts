'use client';
// @ts-nocheck
import { useEffect, useState } from 'react';

const defaultCopy = {
  en: {
    title: 'Secure Verification',
    subtitle: 'Complete a quick challenge to unlock the Member role.',
    captchaLabel: 'Complete captcha',
    button: 'Verify me',
    successHeadline: 'Verification successful',
    successBody: 'Member role granted. Welcome aboard!',
    fallbackPrompt: 'Click the highlighted emoji to prove you are human',
  },
  id: {
    title: 'Verifikasi Aman',
    subtitle: 'Selesaikan tantangan singkat untuk mendapatkan role Member.',
    captchaLabel: 'Selesaikan captcha',
    button: 'Verifikasi Sekarang',
    successHeadline: 'Verifikasi berhasil',
    successBody: 'Role Member sudah diberikan. Selamat datang!',
    fallbackPrompt: 'Klik emoji yang menyala untuk bukti kamu manusia',
  },
};

export function useLocaleCopy() {
  const [locale, setLocale] = useState('en');

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const language = navigator.language.startsWith('id') ? 'id' : 'en';
      setLocale(language);
    }
  }, []);

  return defaultCopy[locale] || defaultCopy.en;
}
