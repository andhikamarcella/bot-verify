'use client';
// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Layout from '../../components/Layout';
import { useLocaleCopy } from '../../lib/useLocale';
import { apiFetch } from '../../lib/api';

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || process.env.RECAPTCHA_SITE_KEY;
function useGuildInfo() {
  const [guild, setGuild] = useState(null);
  useEffect(() => {
    apiFetch('/api/guild-info')
      .then((res) => setGuild(res))
      .catch(() => setGuild(null));
  }, []);
  return guild;
}

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const copy = useLocaleCopy();
  const guildInfo = useGuildInfo();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);
  const [captchaToken, setCaptchaToken] = useState('');
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  const [recaptchaFailed, setRecaptchaFailed] = useState(false);
  const [fallbackChoice, setFallbackChoice] = useState('');
  const widgetIdRef = useRef(null);

  useEffect(() => {
    if (!token) {
      setError('Token tidak ditemukan di tautan.');
      return;
    }
    apiFetch(`/api/verify/info?token=${token}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.error || 'invalid-token');
        setInfo(res);
        if (res.status === 'verified' || res.status === 'trusted') {
          router.push('/verify/success');
        }
        if (res.status === 'banned') {
          setError('Akun ini sedang diperiksa oleh tim keamanan.');
        }
      })
      .catch(() => {
        setError('Token tidak valid atau sudah kedaluwarsa.');
      });
  }, [token, router]);

  useEffect(() => {
    if (!SITE_KEY) {
      setRecaptchaFailed(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => setRecaptchaReady(true);
    script.onerror = () => setRecaptchaFailed(true);
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  useEffect(() => {
    if (!recaptchaReady || recaptchaFailed || !SITE_KEY) return;
    if (typeof window === 'undefined') return;
    if (!window.grecaptcha) return;
    if (widgetIdRef.current !== null) return;
    widgetIdRef.current = window.grecaptcha.render('recaptcha-widget', {
      sitekey: SITE_KEY,
      callback: (tokenValue) => setCaptchaToken(tokenValue),
      'expired-callback': () => setCaptchaToken(''),
    });
  }, [recaptchaReady, recaptchaFailed]);

  const fallbackEmojis = useMemo(() => ['🍉', '🍇', '🍓', '🍊', '🥝'], []);
  const targetEmoji = useMemo(() => fallbackEmojis[Math.floor(Math.random() * fallbackEmojis.length)], [fallbackEmojis]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!token) {
      setError('Token hilang.');
      return;
    }
    if (!recaptchaFailed && !captchaToken) {
      setError('Selesaikan captcha terlebih dahulu.');
      return;
    }
    if (recaptchaFailed && fallbackChoice !== 'passed') {
      setError('Selesaikan captcha emoji.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        token,
        captchaResult: !recaptchaFailed ? captchaToken : undefined,
        fallbackSolution: recaptchaFailed ? fallbackChoice : undefined,
      };
      const res = await apiFetch('/api/verify', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.push('/verify/success');
      } else {
        setError(res.error || 'Verifikasi gagal.');
      }
    } catch (err) {
      setError('Terjadi kesalahan saat memproses verifikasi.');
    } finally {
      setLoading(false);
      if (typeof window !== 'undefined' && window.grecaptcha && widgetIdRef.current !== null) {
        window.grecaptcha.reset(widgetIdRef.current);
      }
    }
  };

  const handleFallback = (emoji) => {
    if (emoji === targetEmoji) {
      setFallbackChoice('passed');
    } else {
      setFallbackChoice('failed');
    }
  };

  return (
    <Layout
      headline={copy.title}
      description={guildInfo?.ok ? `${guildInfo.name} • ${copy.subtitle}` : copy.subtitle}
    >
      <Card className="space-y-6">
        <div className="flex items-center gap-4">
          {guildInfo?.icon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={guildInfo.icon} alt="Guild logo" className="h-16 w-16 rounded-2xl border border-white/10" />
          )}
          <div>
            <p className="text-xl font-semibold">
              {info?.username ? `Hai ${info.username} 👋` : 'Memuat informasi token...'}
            </p>
            <p className="text-sm text-white/60">
              Selesaikan langkah kecil ini biar kamu dapet badge Member 💫
            </p>
          </div>
        </div>

        {error && <p className="rounded-xl bg-red-500/20 p-3 text-sm text-red-200">{error}</p>}

        {info && ['pending', 'failed'].includes(info.status) && (
          <form onSubmit={onSubmit} className="space-y-6">
            {info.status === 'failed' && (
              <p className="rounded-xl bg-yellow-500/20 p-3 text-sm text-yellow-200">
                Percobaan sebelumnya gagal ({info.failureReason || 'unknown'}). Coba lagi ya!
              </p>
            )}
            {!recaptchaFailed ? (
              <div>
                <p className="mb-3 text-sm text-white/70">{copy.captchaLabel}</p>
                <div id="recaptcha-widget" className="g-recaptcha" data-sitekey={SITE_KEY}></div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-white/70">{copy.fallbackPrompt}</p>
                <div className="flex flex-wrap gap-3">
                  {fallbackEmojis.map((emoji) => (
                    <button
                      type="button"
                      key={emoji}
                      onClick={() => handleFallback(emoji)}
                      className={`h-16 w-16 rounded-2xl border border-white/10 text-3xl transition hover:scale-105 ${
                        fallbackChoice === 'passed' && emoji === targetEmoji ? 'ring-2 ring-cyberPink' : ''
                      }`}
                    >
                      {emoji === targetEmoji ? <span className="animate-pulse">{emoji}</span> : emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Processing...' : copy.button}
            </Button>
          </form>
        )}

        {info && info.status === 'verified' && (
          <div className="space-y-4">
            <p className="text-lg font-semibold">Akun ini sudah diverifikasi sebelumnya.</p>
            <Button type="button" className="w-full" onClick={() => router.push('/verify/success')}>
              Buka Halaman Sukses
            </Button>
          </div>
        )}

        {!info && !error && <p className="text-white/60">Mengambil data verifikasi...</p>}
      </Card>
    </Layout>
  );
}
