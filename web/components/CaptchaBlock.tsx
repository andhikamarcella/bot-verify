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
    // Allow callback untuk expired token (empty value) untuk reset
    if (result.type === 'turnstile' && !result.value) {
      // Token expired, reset flag untuk allow retry
      hasCalledCallback.current = false;
      return;
    }
    
    if (hasCalledCallback.current && result.value) {
      console.log('[Turnstile] Callback already called, ignoring');
      return; // Prevent multiple calls
    }
    
    if (result.value) {
      console.log('[Turnstile] Calling onSolved with token');
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
                    console.log('[Turnstile] Callback triggered with token:', token ? 'present' : 'missing');
                    if (token) {
                        if (!hasCalledCallback.current) {
                            console.log('[Turnstile] Token received, calling handleSolved');
                            handleSolved({ type: 'turnstile', value: token });
                        } else {
                            console.log('[Turnstile] Token received but callback already called');
                        }
                    } else {
                        console.warn('[Turnstile] Callback triggered but token is empty');
                    }
                },
                'error-callback': (error: any) => {
                    console.error('[Turnstile] Error callback:', error);
                    hasCalledCallback.current = false;
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
                    console.warn('[Turnstile] Token expired, resetting');
                    hasCalledCallback.current = false;
                    if (widgetId.current && window.turnstile) {
                        try {
                            window.turnstile.reset(widgetId.current);
                        } catch (e) {
                            console.error('[Turnstile] Error resetting:', e);
                        }
                    }
                    // Call with empty value to notify parent
                    handleSolved({ type: 'turnstile', value: '' });
                },
                'timeout-callback': () => {
                    console.warn('[Turnstile] Timeout callback');
                    hasCalledCallback.current = false;
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
