'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface CaptchaBlockProps {
  onSolved: (result: { type: 'turnstile' | 'recaptchaV2' | 'recaptchaEnterprise' | 'fallbackEmoji'; value: string; action?: string }) => void;
  siteKey: string;
  recaptchaV2SiteKey?: string;
  enterpriseSiteKey?: string;
  enterpriseAction?: string;
  fallbackText?: string;
}

const FALLBACK_EMOJIS = ['🍉', '🍓', '🍍', '🍇', '🥝'];

export function CaptchaBlock({
  onSolved,
  siteKey,
  recaptchaV2SiteKey,
  enterpriseSiteKey,
  enterpriseAction,
  fallbackText = 'Klik emoji {emoji} untuk lanjut.',
}: CaptchaBlockProps) {
  const [useFallback, setUseFallback] = useState(false);
  const [targetEmoji, setTargetEmoji] = useState<string>('🍉');
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  const [recaptchaError, setRecaptchaError] = useState<string>('');
  const [enterpriseReady, setEnterpriseReady] = useState(false);
  const [enterpriseBusy, setEnterpriseBusy] = useState(false);
  const [enterpriseError, setEnterpriseError] = useState<string>('');
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const recaptchaWidgetId = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const hasCalledCallback = useRef<boolean>(false);
  const isRendering = useRef<boolean>(false);

  useEffect(() => {
    setTargetEmoji(FALLBACK_EMOJIS[Math.floor(Math.random() * FALLBACK_EMOJIS.length)]);
  }, []);

  // Memoize callback untuk mencegah re-render
  const handleSolved = useCallback((result: { type: 'turnstile' | 'recaptchaV2' | 'recaptchaEnterprise' | 'fallbackEmoji'; value: string; action?: string }) => {
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

  const recaptchaV2SiteKeyProp = String(recaptchaV2SiteKey || '').trim();
  const useRecaptchaV2 = Boolean(recaptchaV2SiteKeyProp);

  const enterpriseSiteKeyProp = String(enterpriseSiteKey || '').trim();
  const enterpriseActionProp = String(enterpriseAction || '').trim() || 'LOGIN';
  const useEnterprise = Boolean(enterpriseSiteKeyProp);

  useEffect(() => {
    if (useRecaptchaV2 || useEnterprise) {
      return;
    }
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
                    console.log('[Turnstile] Callback triggered with token:', token ? `present (${token.length} chars)` : 'missing');
                    if (token && token.trim() !== '') {
                        if (!hasCalledCallback.current) {
                            console.log('[Turnstile] Token received, calling handleSolved');
                            // Call immediately to prevent expiration
                            handleSolved({ type: 'turnstile', value: token });
                        } else {
                            console.log('[Turnstile] Token received but callback already called, ignoring');
                        }
                    } else {
                        console.warn('[Turnstile] Callback triggered but token is empty or invalid');
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
    if (!useRecaptchaV2) return;

    const ensureScript = () => {
      const existing = document.querySelector('script[src^="https://www.google.com/recaptcha/api.js"]') as HTMLScriptElement | null;
      if (existing) {
        const onLoad = existing.onload;
        existing.onload = (ev) => {
          if (typeof onLoad === 'function') onLoad.call(existing, ev);
          setRecaptchaReady(Boolean(window.grecaptcha));
        };
        setRecaptchaReady(Boolean(window.grecaptcha));
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => setRecaptchaReady(Boolean(window.grecaptcha));
      script.onerror = () => {
        setRecaptchaReady(false);
        setRecaptchaError('Gagal memuat reCAPTCHA.');
        setUseFallback(true);
      };
      document.head.appendChild(script);
    };

    ensureScript();
  }, [useRecaptchaV2]);

  useEffect(() => {
    if (!useRecaptchaV2) return;
    if (!recaptchaReady || !window.grecaptcha) return;
    if (recaptchaWidgetId.current !== null) return;
    if (!recaptchaContainerRef.current) return;

    try {
      recaptchaWidgetId.current = window.grecaptcha.render(recaptchaContainerRef.current, {
        sitekey: recaptchaV2SiteKeyProp,
        callback: (token) => {
          if (token && String(token).trim() !== '') {
            handleSolved({ type: 'recaptchaV2', value: String(token) });
          }
        },
        'expired-callback': () => {
          hasCalledCallback.current = false;
        },
        'error-callback': () => {
          hasCalledCallback.current = false;
          setRecaptchaError('reCAPTCHA error. Coba refresh.');
          setUseFallback(true);
        },
      });
    } catch (_) {
      setRecaptchaError('Gagal render reCAPTCHA.');
      setUseFallback(true);
    }

    return () => {
      if (window.grecaptcha && recaptchaWidgetId.current !== null) {
        try {
          window.grecaptcha.reset(recaptchaWidgetId.current);
        } catch (_) {}
        recaptchaWidgetId.current = null;
      }
    };
  }, [useRecaptchaV2, recaptchaReady, recaptchaV2SiteKeyProp, handleSolved]);

  useEffect(() => {
    if (!useEnterprise) return;

    if (window.grecaptcha?.enterprise) {
      setEnterpriseReady(true);
      return;
    }

    const existing = document.querySelector('script[src^="https://www.google.com/recaptcha/enterprise.js"]') as HTMLScriptElement | null;
    if (existing) {
      const onLoad = existing.onload;
      existing.onload = (ev) => {
        if (typeof onLoad === 'function') onLoad.call(existing, ev);
        setEnterpriseReady(Boolean(window.grecaptcha?.enterprise));
      };
      setEnterpriseReady(Boolean(window.grecaptcha?.enterprise));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(enterpriseSiteKeyProp)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => setEnterpriseReady(Boolean(window.grecaptcha?.enterprise));
    script.onerror = () => {
      setEnterpriseReady(false);
      setEnterpriseError('Gagal memuat reCAPTCHA.');
      setUseFallback(true);
    };
    document.head.appendChild(script);
  }, [useEnterprise, enterpriseSiteKeyProp]);

  useEffect(() => {
    if (useFallback && !hasCalledCallback.current) {
      handleSolved({ type: 'fallbackEmoji', value: '' });
    }
  }, [useFallback, handleSolved]);

  if (useRecaptchaV2) {
    return (
      <div className="w-full space-y-2">
        <div ref={recaptchaContainerRef} className="min-h-[78px]" />
        {recaptchaError ? <div className="text-[11px] text-red-300">{recaptchaError}</div> : null}
      </div>
    );
  }

  const runEnterprise = async () => {
    if (enterpriseBusy) return;
    const site = enterpriseSiteKeyProp;
    if (!site) {
      setEnterpriseError('Site key tidak tersedia.');
      setUseFallback(true);
      return;
    }
    if (!window.grecaptcha?.enterprise) {
      setEnterpriseError('reCAPTCHA belum siap. Coba refresh.');
      setUseFallback(true);
      return;
    }

    setEnterpriseBusy(true);
    setEnterpriseError('');
    const action = enterpriseActionProp;
    try {
      await new Promise<void>((resolve) => window.grecaptcha!.enterprise.ready(() => resolve()));
      const token = await window.grecaptcha!.enterprise.execute(site, { action });
      if (!token || String(token).trim() === '') {
        setEnterpriseError('Token kosong.');
        setUseFallback(true);
        return;
      }
      handleSolved({ type: 'recaptchaEnterprise', value: token, action });
    } catch (e) {
      setEnterpriseError('Gagal menjalankan reCAPTCHA.');
      setUseFallback(true);
    } finally {
      setEnterpriseBusy(false);
    }
  };

  if (useEnterprise) {
    return (
      <div className="w-full space-y-2">
        <button
          type="button"
          onClick={runEnterprise}
          disabled={enterpriseBusy || !enterpriseReady}
          className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition border border-slate-700 disabled:opacity-60"
        >
          {enterpriseBusy ? 'Memverifikasi...' : enterpriseReady ? 'Saya bukan bot' : 'Memuat reCAPTCHA...'}
        </button>
        {enterpriseError ? <div className="text-[11px] text-red-300">{enterpriseError}</div> : null}
      </div>
    );
  }

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
        };
        grecaptcha?: {
          enterprise?: {
            ready: (cb: () => void) => void;
            execute: (siteKey: string, params: { action: string }) => Promise<string>;
          };
          render: (container: HTMLElement, parameters: Record<string, any>) => number;
          reset: (opt_widget_id?: number) => void;
        }
    }
}
