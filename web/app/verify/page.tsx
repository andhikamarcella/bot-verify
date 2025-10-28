'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useLocaleCopy } from '../../lib/useLocale';
import { getApiBaseUrl } from '../../lib/api';
import { CaptchaBlock } from '../../components/CaptchaBlock';
import { QrCodeBlock } from '../../components/QrCodeBlock';

interface GuildInfoResponse {
  ok: boolean;
  guildName: string;
  guildIconUrl?: string;
}

interface VerifyResponse {
  ok: boolean;
  badgeEmoji?: string;
  mobileDeepLink?: string | null;
}

type CaptchaPayload = { type: 'recaptcha' | 'fallbackEmoji'; value: string } | null;

export default function VerifyPage() {
  const [token, setToken] = useState<string | null>(null);
  const [guild, setGuild] = useState<GuildInfoResponse | null>(null);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [qrValue, setQrValue] = useState<string>('');
  const [captchaResult, setCaptchaResult] = useState<CaptchaPayload>(null);
  const copy = useLocaleCopy();
  const apiBase = getApiBaseUrl();
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromQuery = params.get('token');
    setToken(tokenFromQuery);
    fetch(`${apiBase}/api/guild-info`)
      .then((res) => res.json())
      .then((data: GuildInfoResponse) => setGuild(data))
      .catch(() => setGuild(null));
  }, [apiBase]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      setError(copy.tokenMissing);
      return;
    }
    if (!captchaResult || (captchaResult.type === 'recaptcha' && !captchaResult.value)) {
      setError(copy.captchaMissing);
      return;
    }
    if (captchaResult.type === 'fallbackEmoji' && captchaResult.value !== 'ok') {
      setError(copy.captchaMissing);
      return;
    }

    setError('');
    setStatus(copy.verifying);

    try {
      const res = await fetch(`${apiBase}/api/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          captchaResult,
          ip: '0.0.0.0',
        }),
      });
      const data: VerifyResponse = await res.json();
      if (data.ok) {
        setStatus(copy.successMessage);
        if (data.mobileDeepLink) {
          setQrValue(data.mobileDeepLink);
        }
      } else {
        setError(copy.verifyFailed);
        setStatus('');
      }
    } catch (err) {
      setError(copy.verifyFailed);
      setStatus('');
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-3xl bg-neutral-900/60 border border-white/10 shadow-xl p-6 space-y-6">
        <div className="space-y-2 text-center">
          {guild?.guildIconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={guild.guildIconUrl}
              alt="Guild icon"
              className="mx-auto h-16 w-16 rounded-2xl border border-white/20"
            />
          ) : null}
          <h1 className="text-2xl font-semibold">
            {guild?.guildName || 'Server'} {copy.titleSuffix}
          </h1>
          <p className="text-sm text-white/60">{copy.subtitle}</p>
        </div>

        {token ? (
          <div className="rounded-xl bg-black/40 p-4 text-[11px] text-white/60 break-all">
            <p className="font-semibold text-white/70">Token</p>
            <p>{token}</p>
          </div>
        ) : (
          <div className="rounded-xl bg-red-500/20 p-3 text-sm text-red-200">
            {copy.tokenMissing}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <CaptchaBlock onSolved={setCaptchaResult} siteKey={siteKey} />
          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-500 py-3 text-black font-semibold hover:bg-emerald-400 transition"
            disabled={!token}
          >
            {copy.button}
          </button>
        </form>

        {status && <p className="text-xs text-center text-emerald-300">{status}</p>}
        {error && <p className="text-xs text-center text-red-300">{error}</p>}

        <QrCodeBlock value={qrValue} />

        <p className="text-[11px] text-center text-white/40">{copy.footer}</p>
      </div>
    </main>
  );
}
