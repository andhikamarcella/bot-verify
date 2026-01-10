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
  captchaFallback: string;
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
  docs: string;
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
  
  accessDenied: string;
  verified: string;
  openDiscord: string;
  back: string;
  
  faq: {
    title: string;
    q1: string;
    a1: string;
  };
  
  termsContent: Array<{ title: string; text: string }>;
  privacyContent: Array<{ title: string; text: string }>;
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
    captchaFallback: 'Click the emoji {emoji} to continue.',
    footer: 'Need help? Use /help in the server.',
    
    step0: 'Agreement',
    step1: 'Security Check',
    step2: 'Confirm',
    step3: 'Done',
    
    termsTitle: 'Terms of Service',
    privacyTitle: 'Privacy Policy',
    termsCheckbox: 'I have read and agree to the Terms of Service',
    privacyCheckbox: 'I agree to the Privacy Policy',
    docs: 'Docs',
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
    
    accessDenied: 'Access Denied',
    verified: 'Verified!',
    openDiscord: 'Open Discord',
    back: 'Back',
    
    faq: {
      title: 'Common Issues',
      q1: 'Why do I need to verify?',
      a1: 'To prevent spam and bots in our community.',
    },
    
    termsContent: [
      { title: '1. Introduction', text: 'Welcome to {guildName}. By verifying, you agree to these terms.' },
      { title: '2. User Conduct', text: 'You agree not to spam, raid, or harass other members. Multiple accounts are strictly prohibited.' },
      { title: '3. Bot Usage', text: 'Our verification bot collects your Discord ID and IP address (hashed) for security purposes.' },
      { title: '4. Termination', text: 'Admins reserve the right to revoke your verified status at any time.' },
      { title: '5. Liability', text: 'We are not responsible for any issues arising from Discord API downtimes.' },
      { title: '6. Updates', text: 'These terms may change at any time.' },
      { title: '7. Final Agreement', text: 'By clicking "I Understand", you confirm you are human and eligible to join.' },
    ],
    
    privacyContent: [
      { title: '1. Data Collection', text: 'We collect your Discord User ID, Username, and IP Address.' },
      { title: '2. Purpose', text: 'This data is used solely for verification and anti-abuse measures.' },
      { title: '3. Data Retention', text: 'Verification logs are stored for 30 days and then anonymized.' },
      { title: '4. Third Parties', text: 'We use Cloudflare Turnstile for CAPTCHA, which may collect device info.' },
      { title: '5. Your Rights', text: 'You can request data deletion by contacting the server owner.' },
      { title: '6. Cookies', text: 'We use local storage to save your language preference.' },
      { title: '7. Contact', text: 'For privacy concerns, reach out to staff.' },
    ],
  },
  id: {
    titleSuffix: 'Verifikasi',
    subtitle: 'Selesaikan langkah ini untuk akses penuh.',
    button: 'Mulai Verifikasi',
    tokenMissing: 'Token tidak valid atau sudah kadaluarsa.',
    verifying: 'Memproses verifikasi...',
    successMessage: '✅ Verifikasi berhasil! Kamu sudah menjadi Member.',
    verifyFailed: 'Verifikasi gagal. Silakan coba lagi.',
    captchaMissing: 'Silakan selesaikan pemeriksaan keamanan.',
    captchaFallback: 'Klik emoji {emoji} untuk lanjut.',
    footer: 'Butuh bantuan? Gunakan /help di server.',
    
    step0: 'Persetujuan',
    step1: 'Cek Keamanan',
    step2: 'Konfirmasi',
    step3: 'Selesai',
    
    termsTitle: 'Syarat & Ketentuan',
    privacyTitle: 'Kebijakan Privasi',
    termsCheckbox: 'Saya telah membaca dan menyetujui Syarat & Ketentuan',
    privacyCheckbox: 'Saya setuju dengan Kebijakan Privasi',
    docs: 'Dokumen',
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
    
    accessDenied: 'Akses Ditolak',
    verified: 'Terverifikasi!',
    openDiscord: 'Buka Discord',
    back: 'Kembali',
    
    faq: {
      title: 'Masalah Umum',
      q1: 'Kenapa harus verifikasi?',
      a1: 'Untuk mencegah spam dan bot di komunitas kami.',
    },
    
    termsContent: [
      { title: '1. Pengenalan', text: 'Selamat datang di {guildName}. Dengan memverifikasi, Anda menyetujui ketentuan ini.' },
      { title: '2. Perilaku Pengguna', text: 'Anda setuju untuk tidak melakukan spam, raid, atau melecehkan anggota lain. Akun ganda sangat dilarang.' },
      { title: '3. Penggunaan Bot', text: 'Bot verifikasi kami mengumpulkan ID Discord dan alamat IP Anda (dihash) untuk keamanan.' },
      { title: '4. Pengakhiran', text: 'Admin berhak mencabut status terverifikasi Anda kapan saja.' },
      { title: '5. Tanggung Jawab', text: 'Kami tidak bertanggung jawab atas masalah yang timbul dari downtime API Discord.' },
      { title: '6. Pembaruan', text: 'Ketentuan ini dapat berubah sewaktu-waktu.' },
      { title: '7. Persetujuan Akhir', text: 'Dengan mengklik "Saya Mengerti", Anda mengonfirmasi bahwa Anda adalah manusia dan memenuhi syarat untuk bergabung.' },
    ],
    
    privacyContent: [
      { title: '1. Pengumpulan Data', text: 'Kami mengumpulkan ID Pengguna Discord, Nama Pengguna, dan Alamat IP Anda.' },
      { title: '2. Tujuan', text: 'Data ini digunakan semata-mata untuk verifikasi dan tindakan anti-penyalahgunaan.' },
      { title: '3. Retensi Data', text: 'Log verifikasi disimpan selama 30 hari kemudian dianonimkan.' },
      { title: '4. Pihak Ketiga', text: 'Kami menggunakan Cloudflare Turnstile untuk CAPTCHA, yang dapat mengumpulkan informasi perangkat.' },
      { title: '5. Hak Anda', text: 'Anda dapat meminta penghapusan data dengan menghubungi pemilik server.' },
      { title: '6. Cookies', text: 'Kami menggunakan penyimpanan lokal untuk menyimpan preferensi bahasa Anda.' },
      { title: '7. Kontak', text: 'Untuk masalah privasi, hubungi staf.' },
    ],
  },
};

export function useLocaleCopy() {
  const [locale, setLocale] = useState<LocaleKey>('id');

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
