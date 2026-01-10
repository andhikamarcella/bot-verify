'use client';

import { useEffect, useRef, useState } from 'react';

interface CaptchaBlockProps {
  onSolved: (result: { type: 'turnstile' | 'fallbackEmoji'; value: string }) => void;
  siteKey: string;
  fallbackText?: string;
}

const FALLBACK_EMOJIS = ['🍉', '🍓', '🍍', '🍇', '🥝'];

export function CaptchaBlock({ onSolved, siteKey, fallbackText = 'Klik emoji {emoji} untuk lanjut.' }: CaptchaBlockProps) {
  const [useFallback, setUseFallback] = useState(false);
  const [targetEmoji, setTargetEmoji] = useState<string>('🍉');
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    setTargetEmoji(FALLBACK_EMOJIS[Math.floor(Math.random() * FALLBACK_EMOJIS.length)]);
  }, []);

  useEffect(() => {
    if (!siteKey) {
      setUseFallback(true);
      return;
    }

    // Check if script is already present
    let script = document.querySelector('script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]') as HTMLScriptElement;
    
    if (!script) {
        script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        document.body.appendChild(script);
    }

    const renderTurnstile = () => {
        if (window.turnstile && containerRef.current && !widgetId.current) {
             widgetId.current = window.turnstile.render(containerRef.current, {
                sitekey: siteKey,
                callback: (token: string) => onSolved({ type: 'turnstile', value: token }),
                'error-callback': () => {
                    console.warn('Turnstile error, switching to fallback');
                    setUseFallback(true);
                },
                'expired-callback': () => onSolved({ type: 'turnstile', value: '' }),
             });
        }
    };

    if (window.turnstile) {
        renderTurnstile();
    } else {
        script.onload = renderTurnstile;
    }

    return () => {
        if (widgetId.current && window.turnstile) {
            window.turnstile.remove(widgetId.current);
            widgetId.current = null;
        }
    };
  }, [siteKey, onSolved]);

  useEffect(() => {
    if (useFallback) {
      onSolved({ type: 'fallbackEmoji', value: '' });
    }
  }, [useFallback, onSolved]);

  if (useFallback) {
    const fallbackMessage = fallbackText.includes('{emoji}')
      ? fallbackText.replace('{emoji}', targetEmoji)
      : `${fallbackText} ${targetEmoji}`;
    return (
      <div className="space-y-2">
        <p className="text-sm text-white/70">{fallbackMessage}</p>
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

  return <div ref={containerRef} className="min-h-[65px]" />;
}

declare global {
    interface Window {
        turnstile?: {
            render: (container: HTMLElement, options: any) => string;
            remove: (widgetId: string) => void;
            reset: (widgetId: string) => void;
        }
    }
}
