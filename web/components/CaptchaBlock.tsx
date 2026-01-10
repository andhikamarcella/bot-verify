'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

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
  const hasCalledCallback = useRef<boolean>(false);
  const isRendering = useRef<boolean>(false);

  useEffect(() => {
    setTargetEmoji(FALLBACK_EMOJIS[Math.floor(Math.random() * FALLBACK_EMOJIS.length)]);
  }, []);

  // Memoize callback untuk mencegah re-render
  const handleSolved = useCallback((result: { type: 'turnstile' | 'fallbackEmoji'; value: string }) => {
    if (hasCalledCallback.current) {
      return; // Prevent multiple calls
    }
    if (result.value) {
      hasCalledCallback.current = true;
      onSolved(result);
    }
  }, [onSolved]);

  useEffect(() => {
    if (!siteKey || siteKey.trim() === '') {
      console.warn('[Turnstile] Site key is missing, using fallback');
      setUseFallback(true);
      return;
    }

    // Reset flag when component mounts
    hasCalledCallback.current = false;
    isRendering.current = false;

    // Check if script is already present
    let script = document.querySelector('script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]') as HTMLScriptElement;
    
    const renderTurnstile = () => {
        if (isRendering.current || widgetId.current) {
            // Already rendering or rendered
            return;
        }

        if (!containerRef.current) {
            console.warn('[Turnstile] Container not ready');
            return;
        }
        
        if (!window.turnstile) {
            console.warn('[Turnstile] Turnstile API not available');
            return;
        }
        
        isRendering.current = true;
        
        try {
            widgetId.current = window.turnstile.render(containerRef.current, {
                sitekey: siteKey,
                callback: (token: string) => {
                    if (token && !hasCalledCallback.current) {
                        console.log('[Turnstile] Token received');
                        handleSolved({ type: 'turnstile', value: token });
                    }
                },
                'error-callback': (error: any) => {
                    console.warn('[Turnstile] Error callback:', error);
                    if (widgetId.current && window.turnstile) {
                        try {
                            window.turnstile.remove(widgetId.current);
                        } catch (e) {
                            console.error('[Turnstile] Error removing on error:', e);
                        }
                        widgetId.current = null;
                    }
                    isRendering.current = false;
                    setUseFallback(true);
                },
                'expired-callback': () => {
                    console.warn('[Turnstile] Token expired');
                    hasCalledCallback.current = false;
                    if (widgetId.current && window.turnstile) {
                        try {
                            window.turnstile.reset(widgetId.current);
                        } catch (e) {
                            console.error('[Turnstile] Error resetting:', e);
                        }
                    }
                },
            });
            console.log('[Turnstile] Widget rendered successfully');
            isRendering.current = false;
        } catch (error) {
            console.error('[Turnstile] Render error:', error);
            isRendering.current = false;
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
                renderTurnstile();
            };
            script.onerror = () => {
                console.error('[Turnstile] Failed to load script');
                setUseFallback(true);
            };
            document.body.appendChild(script);
        } else {
            // Script exists, check if it's already loaded or wait for it
            if (window.turnstile) {
                // Already loaded
                renderTurnstile();
            } else {
                // Wait for script to load
                const existingOnLoad = script.onload;
                script.onload = () => {
                    if (existingOnLoad) existingOnLoad.call(script);
                    renderTurnstile();
                };
                script.onerror = () => {
                    console.error('[Turnstile] Failed to load existing script');
                    setUseFallback(true);
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
            isRendering.current = false;
            hasCalledCallback.current = false;
        }
    };
  }, [siteKey, handleSolved]);

  useEffect(() => {
    if (useFallback && !hasCalledCallback.current) {
      handleSolved({ type: 'fallbackEmoji', value: '' });
    }
  }, [useFallback, handleSolved]);

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
