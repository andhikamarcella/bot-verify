'use client';

import { useEffect, useState } from 'react';

interface CaptchaBlockProps {
  onSolved: (result: { type: 'recaptcha' | 'fallbackEmoji'; value: string }) => void;
  siteKey?: string;
}

const FALLBACK_EMOJIS = ['🍉', '🍓', '🍍', '🍇', '🥝'];

export function CaptchaBlock({ onSolved, siteKey }: CaptchaBlockProps) {
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const [targetEmoji, setTargetEmoji] = useState<string>('🍉');

  useEffect(() => {
    setTargetEmoji(FALLBACK_EMOJIS[Math.floor(Math.random() * FALLBACK_EMOJIS.length)]);
  }, []);

  useEffect(() => {
    if (!siteKey) {
      setUseFallback(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => setRecaptchaReady(true);
    script.onerror = () => setUseFallback(true);
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [siteKey]);

  useEffect(() => {
    if (useFallback) {
      onSolved({ type: 'fallbackEmoji', value: '' });
    }
  }, [useFallback, onSolved]);

  useEffect(() => {
    if (!recaptchaReady || !siteKey || useFallback) return;
    if (typeof window === 'undefined' || !(window as any).grecaptcha) return;
    const widget = (window as any).grecaptcha.render('recaptcha-widget', {
      sitekey: siteKey,
      callback: (token: string) => onSolved({ type: 'recaptcha', value: token }),
      'expired-callback': () => onSolved({ type: 'recaptcha', value: '' }),
    });
    return () => {
      if ((window as any).grecaptcha?.reset) {
        (window as any).grecaptcha.reset(widget);
      }
    };
  }, [onSolved, recaptchaReady, siteKey, useFallback]);

  if (useFallback) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-white/70">Klik emoji {targetEmoji} untuk lanjut.</p>
        <div className="flex flex-wrap gap-3">
          {FALLBACK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="h-14 w-14 rounded-2xl border border-white/10 text-2xl hover:scale-105 transition"
              onClick={() =>
                onSolved({
                  type: 'fallbackEmoji',
                  value: emoji === targetEmoji ? 'ok' : 'fail',
                })
              }
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return <div id="recaptcha-widget" className="min-h-[78px]" />;
}
