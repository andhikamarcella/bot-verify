'use client';

import { useEffect, useState } from 'react';

export type LocaleKey = 'en' | 'id';

export type CopyShape = {
  titleSuffix: string;
  subtitle: string;
  button: string;
  tokenMissing: string;
  verifying: string;
  successMessage: string;
  verifyFailed: string;
  captchaMissing: string;
  footer: string;
  
  // New Additions
  step0: string;
  step1: string;
  step2: string;
  step3: string;
  
  termsTitle: string;
  privacyTitle: string;
  termsCheckbox: string;
  privacyCheckbox: string;
  readToEnd: string;
  agreeBtn: string;
  
  tokenExpiresIn: string;
  tokenExpired: string;
  
  envCheck: {
    botOffline: string;
    maintenance: string;
    maintenanceReason: string;
    checking: string;
    ok: string;
  };
  
  errors: {
    linkUsed: string;
    generic: string;
    apiTimeout: string;
  };
  
  welcome: string;
  rolePreview: string;
  estimatedTime: string;
  antiScam: string;
  
  faq: {
    title: string;
    q1: string;
    a1: string;
  };
};

const COPY: Record<LocaleKey, CopyShape> = {
  en: {
    titleSuffix: 'Verification',
    subtitle: 'Complete these steps to unlock full access.',
    button: 'Start Verification',
    tokenMissing: 'Invalid or expired token. Please request a new one.',
    verifying: 'Verifying your account...',
    successMessage: '✅ Verification successful! You are now a Member.',
    verifyFailed: 'Verification failed. Please try again.',
    captchaMissing: 'Please complete the security check.',
    footer: 'Need help? Use /help in the server.',
    
    step0: 'Agreement',
    step1: 'Security Check',
    step2: 'Confirm',
    step3: 'Done',
    
    termsTitle: 'Terms of Service',
    privacyTitle: 'Privacy Policy',
    termsCheckbox: 'I have read and agree to the Terms of Service',
    privacyCheckbox: 'I agree to the Privacy Policy',
    readToEnd: 'Please scroll to the end to agree',
    agreeBtn: 'I Understand',
    
    tokenExpiresIn: 'Token expires in',
    tokenExpired: 'Token Expired',
    
    envCheck: {
      botOffline: 'Bot is currently offline',
      maintenance: 'System is under maintenance',
      maintenanceReason: 'Reason:',
      checking: 'Checking system status...',
      ok: 'System Operational',
    },
    
    errors: {
      linkUsed: 'This link has already been used on another device.',
      generic: 'An unexpected error occurred.',
      apiTimeout: 'Discord API is busy, retrying...',
    },
    
    welcome: 'Welcome to',
    rolePreview: 'You will receive the Member role',
    estimatedTime: '⏱️ Takes about 10-20 seconds',
    antiScam: '⚠️ Admins will never ask for your password or token.',
    
    faq: {
      title: 'Common Issues',
      q1: 'Why do I need to verify?',
      a1: 'To prevent spam and bots in our community.',
    },
  },
  id: {
    titleSuffix: 'Verifikasi',
    subtitle: 'Selesaikan langkah ini untuk akses penuh.',
    button: 'Mulai Verifikasi',
    tokenMissing: 'Token tidak valid atau sudah kadaluarsa.',
    verifying: 'Memproses verifikasi...',
    successMessage: '✅ Verifikasi berhasil! Kamu sudah menjadi Member.',
    verifyFailed: 'Verifikasi gagal. Silakan coba lagi.',
    captchaMissing: 'Mohon selesaikan pemeriksaan keamanan.',
    footer: 'Butuh bantuan? Gunakan /help di server.',
    
    step0: 'Persetujuan',
    step1: 'Cek Keamanan',
    step2: 'Konfirmasi',
    step3: 'Selesai',
    
    termsTitle: 'Syarat & Ketentuan',
    privacyTitle: 'Kebijakan Privasi',
    termsCheckbox: 'Saya telah membaca dan menyetujui Syarat & Ketentuan',
    privacyCheckbox: 'Saya setuju dengan Kebijakan Privasi',
    readToEnd: 'Scroll sampai bawah untuk menyetujui',
    agreeBtn: 'Saya Mengerti',
    
    tokenExpiresIn: 'Token berakhir dalam',
    tokenExpired: 'Token Kadaluarsa',
    
    envCheck: {
      botOffline: 'Bot sedang offline',
      maintenance: 'Sistem sedang maintenance',
      maintenanceReason: 'Alasan:',
      checking: 'Mengecek status sistem...',
      ok: 'Sistem Normal',
    },
    
    errors: {
      linkUsed: 'Link ini sudah dibuka di perangkat lain.',
      generic: 'Terjadi kesalahan tidak terduga.',
      apiTimeout: 'Discord API sedang sibuk, mencoba ulang...',
    },
    
    welcome: 'Selamat datang di',
    rolePreview: 'Kamu akan mendapatkan role Member',
    estimatedTime: '⏱️ Proses ±10-20 detik',
    antiScam: '⚠️ Admin tidak pernah meminta password/token kamu.',
    
    faq: {
      title: 'Masalah Umum',
      q1: 'Kenapa harus verifikasi?',
      a1: 'Untuk mencegah spam dan bot di komunitas kami.',
    },
  },
};

export function useLocaleCopy() {
  const [locale, setLocale] = useState<LocaleKey>('id'); // Default ID as requested by user context implies ID first

  useEffect(() => {
    // Persist language preference
    const saved = localStorage.getItem('verify_lang') as LocaleKey;
    if (saved && (saved === 'en' || saved === 'id')) {
      setLocale(saved);
    } else if (typeof navigator !== 'undefined') {
      // Default to ID if starts with id, else EN
      setLocale(navigator.language.startsWith('id') ? 'id' : 'en');
    }
  }, []);

  const changeLocale = (l: LocaleKey) => {
    setLocale(l);
    localStorage.setItem('verify_lang', l);
  };

  return { t: COPY[locale], locale, setLocale: changeLocale };
}
