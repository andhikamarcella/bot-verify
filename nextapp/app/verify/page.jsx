'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ReCAPTCHA from 'react-google-recaptcha';
import Layout from '../../components/Layout';
import Card from '../../components/Card';
import Button from '../../components/Button';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

export default function VerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get('token'), [searchParams]);
  const apiBase = API_BASE;
  const siteKey = SITE_KEY;

  const [status, setStatus] = useState('loading');
  const [userInfo, setUserInfo] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [captchaValue, setCaptchaValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const recaptchaRef = useRef(null);

  useEffect(() => {
    if (!apiBase) {
      setStatus('misconfigured');
      return;
    }

    if (!token) {
      setStatus('missing');
      return;
    }

    async function fetchInfo() {
      setStatus('loading');
      try {
        const response = await fetch(
          `${apiBase}/api/verify/info?token=${encodeURIComponent(token)}`,
          {
            cache: 'no-store',
          },
        );
        const data = await response.json();
        if (!data.ok) {
          setStatus(data.reason || 'invalid');
          return;
        }

        setUserInfo(data.data);
        setStatus('ready');
      } catch (error) {
        console.error('Gagal mengambil info token:', error);
        setStatus('error');
      }
    }

    fetchInfo();
  }, [token, apiBase]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');

    if (!apiBase) {
      setErrorMessage('API backend belum dikonfigurasi.');
      return;
    }

    if (!captchaValue) {
      setErrorMessage('Tolong selesaikan reCAPTCHA terlebih dahulu.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`${apiBase}/api/verify/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, captcha: captchaValue }),
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        router.push('/verify/success');
        return;
      }

      const error = data.error || 'unknown';
      switch (error) {
        case 'captcha_failed':
          setErrorMessage('Verifikasi captcha gagal. Coba lagi ya.');
          break;
        case 'captcha_required':
          setErrorMessage('Captcha wajib diisi sebelum submit.');
          break;
        case 'invalid_token':
          setErrorMessage('Token verifikasi tidak ditemukan atau sudah kedaluwarsa.');
          break;
        case 'already_verified':
          setErrorMessage('Token ini sudah dipakai sebelumnya.');
          break;
        case 'member_not_found':
          setErrorMessage('Kami tidak menemukan akun kamu di server. Pastikan kamu masih menjadi member.');
          break;
        case 'role_not_found':
          setErrorMessage('Role Member tidak ditemukan. Admin server perlu mengecek konfigurasi.');
          break;
        case 'verification_state_error':
          setErrorMessage('Status verifikasi tidak valid. Coba minta tautan baru dari bot.');
          break;
        default:
          setErrorMessage('Terjadi kesalahan. Coba beberapa saat lagi.');
      }
    } catch (error) {
      console.error('Gagal submit verifikasi:', error);
      setErrorMessage('Tidak bisa terhubung ke server. Periksa koneksi internetmu.');
    } finally {
      if (recaptchaRef.current) {
        recaptchaRef.current.reset();
      }
      setCaptchaValue('');
      setSubmitting(false);
    }
  };

  let title = 'Verifikasi Member';
  let subtitle = 'Selesaikan langkah singkat ini supaya role Member bisa diberikan otomatis.';

  if (status === 'missing') {
    title = 'Token tidak ditemukan';
    subtitle = 'Gunakan tautan resmi dari DM bot untuk memulai verifikasi.';
  } else if (status === 'invalid') {
    title = 'Token tidak valid';
    subtitle = 'Token ini tidak dikenal atau mungkin sudah kedaluwarsa.';
  } else if (status === 'used') {
    title = 'Token sudah digunakan';
    subtitle = 'Minta DM baru dari bot untuk memulai proses ulang.';
  } else if (status === 'misconfigured') {
    title = 'Konfigurasi belum lengkap';
    subtitle = 'API_BASE_URL belum diatur di frontend.';
  } else if (status === 'error') {
    title = 'Terjadi Kesalahan';
    subtitle = 'Kami tidak bisa mengambil data token. Silakan coba lagi.';
  }

  return (
    <Layout title={title} subtitle={subtitle}>
      <Card>
        {status === 'loading' ? (
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/10 border-t-discord-purple" />
            <p className="text-slate-300">Menyiapkan halaman verifikasi untukmu...</p>
          </div>
        ) : null}

        {status === 'ready' && userInfo ? (
          <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
            <div className="space-y-2 text-left">
              <p className="text-lg font-semibold text-white">
                Hai {userInfo.username} 👋
              </p>
              <p className="text-sm text-slate-300">
                Cukup centang captcha di bawah ini lalu tekan tombol verifikasi untuk
                mendapatkan badge Member 💫
              </p>
            </div>

            {siteKey ? (
              <div className="flex justify-center">
                {/* RECAPTCHA_SITE_KEY boleh diekspos ke client, RECAPTCHA_SECRET_KEY hanya untuk server. */}
                <ReCAPTCHA
                  ref={recaptchaRef}
                  sitekey={siteKey}
                  onChange={setCaptchaValue}
                  theme="dark"
                />
              </div>
            ) : (
              <p className="text-sm text-red-400">
                RECAPTCHA_SITE_KEY belum diatur. Hubungi admin server.
              </p>
            )}

            {errorMessage ? (
              <p className="rounded-xl bg-red-500/20 px-4 py-2 text-sm text-red-200">
                {errorMessage}
              </p>
            ) : null}

            <Button type="submit" disabled={submitting || !siteKey} className={submitting ? 'opacity-70 cursor-not-allowed' : ''}>
              {submitting ? 'Memproses...' : 'Verify Me'}
            </Button>
          </form>
        ) : null}

        {['missing', 'invalid', 'used', 'misconfigured', 'error'].includes(status) ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              Jika kamu merasa ini sebuah kesalahan, jalankan kembali perintah <span className="font-semibold text-white">/verify</span>
              di Discord untuk mendapatkan tautan terbaru.
            </p>
          </div>
        ) : null}
      </Card>
    </Layout>
  );
}
