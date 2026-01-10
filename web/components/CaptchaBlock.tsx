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
    if (!siteKey || siteKey.trim() === '') {
      console.warn('[Turnstile] Site key is missing, using fallback');
      setUseFallback(true);
      return;
    }

    // Check if script is already present
    let script = document.querySelector('script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]') as HTMLScriptElement;
    let scriptLoaded = false;
    
    const renderTurnstile = () => {
        if (!containerRef.current) {
            console.warn('[Turnstile] Container not ready');
            return;
        }
        
        if (!window.turnstile) {
            console.warn('[Turnstile] Turnstile API not available');
            if (scriptLoaded) {
                setUseFallback(true);
            }
            return;
        }
        
        if (widgetId.current) {
            // Already rendered
            return;
        }
        
        try {
            widgetId.current = window.turnstile.render(containerRef.current, {
                sitekey: siteKey,
                callback: (token: string) => {
                    if (token) {
                        onSolved({ type: 'turnstile', value: token });
                    }
                },
                'error-callback': (error: any) => {
                    console.warn('[Turnstile] Error callback:', error);
                    setUseFallback(true);
                    if (widgetId.current && window.turnstile) {
                        window.turnstile.remove(widgetId.current);
                        widgetId.current = null;
                    }
                },
                'expired-callback': () => {
                    console.warn('[Turnstile] Token expired');
                    onSolved({ type: 'turnstile', value: '' });
                },
            });
            console.log('[Turnstile] Widget rendered successfully');
        } catch (error) {
            console.error('[Turnstile] Render error:', error);
            setUseFallback(true);
        }
    };

    if (window.turnstile) {
        // API already loaded
        renderTurnstile();
    } else {
        // Need to load script
        if (!script) {
            script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.async = true;
            script.defer = true;
            script.onload = () => {
                scriptLoaded = true;
                renderTurnstile();
            };
            script.onerror = () => {
                console.error('[Turnstile] Failed to load script');
                setUseFallback(true);
            };
            document.body.appendChild(script);
        } else {
            // Script exists, wait for it to load
            if (script.readyState === 'complete' || script.readyState === 'loaded') {
                scriptLoaded = true;
                renderTurnstile();
            } else {
                script.onload = () => {
                    scriptLoaded = true;
                    renderTurnstile();
                };
            }
        }
    }

    return () => {
        if (widgetId.current && window.turnstile) {
            try {
                window.turnstile.remove(widgetId.current);
            } catch (error) {
                console.error('[Turnstile] Error removing widget:', error);
            }
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
