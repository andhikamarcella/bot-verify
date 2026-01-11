"use client";

import { CSSProperties, FormEvent, useEffect, useMemo, useState, useCallback } from "react";
import { useLocaleCopy } from "../../lib/useLocale";
import { CaptchaBlock } from "../../components/CaptchaBlock";
import { PolicyModal } from "../../components/PolicyModal";
import { CheckCircleIcon, ExclamationTriangleIcon, ClockIcon, ShieldCheckIcon } from '@heroicons/react/24/solid';

declare const process: {
  env: Record<string, string | undefined>;
};

interface VerifyResponse {
  ok?: boolean;
  badgeEmoji?: string;
  mobileDeepLink?: string;
  reviewStatus?: string;
  userId?: string;
  error?: string;
  reason?: string;
}

interface EnvStatus {
  botOnline: boolean;
  maintenanceMode: boolean;
  maintenanceReason?: string;
  guildId?: string;
}

interface PreCheckResponse {
  ok: boolean;
  envStatus: EnvStatus;
  tokenValid?: boolean;
  expiresIn?: number;
  nicknameSuggestions?: string[];
  error?: string;
  reason?: string;
}

export default function VerifyPage() {
  const { t, locale, setLocale } = useLocaleCopy();
  
  const [token, setToken] = useState<string | null>(null);
  const [guildName, setGuildName] = useState<string>("Server");
  const [guildIcon, setGuildIcon] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [step, setStep] = useState<number>(0); // 0: Agree, 1: Captcha, 2: Processing, 3: Done
  
  const [envStatus, setEnvStatus] = useState<EnvStatus | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  
  const [termsOpen, setTermsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  
  const [captchaResult, setCaptchaResult] = useState<{ type: "turnstile" | "fallbackEmoji"; value: string } | null>(null);

  const [nickname, setNickname] = useState<string>('');
  const [nicknameSuggestions, setNicknameSuggestions] = useState<string[]>([]);
  const [applicationReason, setApplicationReason] = useState<string>('');

  const [startedVerification, setStartedVerification] = useState<boolean>(false);
  const [autoRefreshUsed, setAutoRefreshUsed] = useState<boolean>(false);
  const [regeneratingToken, setRegeneratingToken] = useState<boolean>(false);
  const [completedAt, setCompletedAt] = useState<string>('');
  const [completedUserId, setCompletedUserId] = useState<string>('');
  const [pageUrl, setPageUrl] = useState<string>('');

  // Memoize callback untuk mencegah re-render
  const handleCaptchaSolved = useCallback((res: { type: "turnstile" | "fallbackEmoji"; value: string }) => {
    console.log('[Captcha] handleCaptchaSolved called', { 
      type: res.type, 
      hasValue: !!res.value,
      valueLength: res.value?.length 
    });
    
    if (!res.value || res.value.trim() === '') {
      console.warn('[Captcha] No value in result, ignoring');
      return;
    }

    if (res.type === "fallbackEmoji" && res.value !== "ok") {
      console.warn('[Captcha] Fallback emoji failed');
      setStatusMsg(t.verifyFailed);
      return;
    }

    // For Turnstile, ensure token is valid format
    if (res.type === "turnstile") {
      if (res.value.length < 100) {
        console.error('[Captcha] Turnstile token seems too short:', res.value.length);
        setStatusMsg(t.verifyFailed + ' (Token tidak valid)');
        return;
      }
    }

    console.log('[Captcha] Setting captcha result, proceeding to verification');
    setCaptchaResult(res);
    
    // Auto-submit jika Turnstile berhasil (optional, bisa di-comment jika ingin manual)
    // if (res.type === "turnstile" && res.value) {
    //   setTimeout(() => {
    //     handleVerify();
    //   }, 500);
    // }
  }, [t.verifyFailed]);

  // Initial Load & Pre-check
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tParam = params.get("token");
    setToken(tParam || null);

    setPageUrl(window.location.href);
    
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || "";
    
    // Guild Info
    fetch(base ? `${base}/api/guild-info` : "/api/guild-info")
      .then((r) => r.json())
      .then((data) => {
        if (data.guildName) setGuildName(data.guildName);
        if (data.guildIconUrl) setGuildIcon(data.guildIconUrl);
      })
      .catch(() => {});

    // Pre-check
    const preCheckUrl = new URL(base ? `${base}/api/pre-check` : "/api/pre-check", window.location.origin);
    if (tParam) preCheckUrl.searchParams.set('token', tParam);
    
    fetch(preCheckUrl.toString())
      .then(r => r.json() as Promise<PreCheckResponse>)
      .then(data => {
        setEnvStatus(data.envStatus);
        setLoading(false);

        if (Array.isArray(data.nicknameSuggestions)) {
          setNicknameSuggestions(
            Array.from(
              new Set(
                data.nicknameSuggestions
                  .map((v) => String(v || '').trim())
                  .filter(Boolean)
                  .map((v) => v.slice(0, 32))
              )
            )
          );
        }
        
        if (data.ok && data.tokenValid && data.expiresIn) {
             setTimeLeft(data.expiresIn);
        } else if (data.error) {
            if (data.error === 'maintenance-mode') {
                setStatusMsg(`${t.envCheck.maintenance}: ${data.reason}`);
            } else if (data.error === 'token-expired') {
                setStatusMsg(t.tokenExpired);
                setTimeLeft(0);
            } else if (data.error === 'link-used-on-other-device') {
                setStatusMsg(t.errors.linkUsed);
            } else {
                setStatusMsg(t.tokenMissing);
            }
        }
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
        setStatusMsg(t.errors.generic);
      });

  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps

  const securityBlurb =
    locale === 'id'
      ? 'Kami memeriksa tautan verifikasi, status bot, dan captcha untuk melindungi server.'
      : 'We validate your verification link, bot status, and captcha to protect the server.';

  const openInBrowserLabel = locale === 'id' ? 'Buka di browser' : 'Open in browser';
  const generateNewTokenLabel = locale === 'id' ? 'Generate token baru' : 'Generate new token';
  const tokenRefreshedLabel =
    locale === 'id'
      ? 'Token diperbarui. Silakan lanjutkan verifikasi.'
      : 'Token refreshed. Please continue verification.';

  const maskUserId = (value: string) => {
    const s = String(value || '');
    if (s.length <= 8) return s;
    return `${s.slice(0, 4)}••••${s.slice(-4)}`;
  };

  const regenerateToken = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!token) return null;
      if (regeneratingToken) return null;

      const base = process.env.NEXT_PUBLIC_API_BASE_URL || "";
      setRegeneratingToken(true);
      try {
        const res = await fetch((base ? `${base}/api/regenerate-token` : '/api/regenerate-token'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!data?.ok || !data?.token) {
          if (!opts.silent) {
            setStatusMsg(t.verifyFailed + (data?.error ? ` (${data.error})` : ''));
          }
          return null;
        }

        const newToken = String(data.token);
        setToken(newToken);
        setTimeLeft(15 * 60 * 1000);
        setStatusMsg(tokenRefreshedLabel);
        setCaptchaResult(null);
        setStartedVerification(false);
        setAutoRefreshUsed(false);

        try {
          const url = new URL(window.location.href);
          url.searchParams.set('token', newToken);
          window.history.replaceState({}, '', url.toString());
          setPageUrl(url.toString());
        } catch (_) {
          // ignore
        }

        return newToken;
      } catch (_) {
        if (!opts.silent) {
          setStatusMsg(t.errors.apiTimeout);
        }
        return null;
      } finally {
        setRegeneratingToken(false);
      }
    },
    [token, regeneratingToken, t.verifyFailed, t.errors.apiTimeout, tokenRefreshedLabel]
  );

  // Timer Countdown
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const interval = setInterval(() => {
        setTimeLeft(prev => {
            if (prev === null || prev <= 1000) {
                clearInterval(interval);
                return 0;
            }
            return prev - 1000;
        });
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft]);

  const formatTime = (ms: number) => {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleVerify = useCallback(async (tokenOverride?: string) => {
  const activeToken = tokenOverride || token;
  if (!activeToken || !captchaResult) {
    console.warn('[Verify] Missing token or captchaResult', { token: !!token, captchaResult: !!captchaResult });
    return;
  }

  if (!captchaResult.value || captchaResult.value.trim() === '') {
    console.warn('[Verify] Captcha result value is empty', captchaResult);
    setStatusMsg(t.captchaMissing);
    return;
  }

  // Validate Turnstile token format
  if (captchaResult.type === 'turnstile') {
    if (captchaResult.value.length < 100) {
      console.error('[Verify] Turnstile token too short:', captchaResult.value.length);
      setStatusMsg(t.verifyFailed + ' (Token tidak valid)');
      setCaptchaResult(null);
      return;
    }
  }

  console.log('[Verify] Starting verification', { 
    token: activeToken.substring(0, 10) + '...', 
    captchaType: captchaResult.type,
    hasValue: !!captchaResult.value,
    tokenLength: captchaResult.value.length,
    timestamp: new Date().toISOString()
  });

  setStartedVerification(true);
  setStep(2);
  setStatusMsg(t.verifying);

  const reasonTrimmed = applicationReason.trim();
  if (reasonTrimmed.length < 10) {
    setStep(1);
    setStatusMsg(t.applicationReasonError);
    return;
  }

  // Get real IP address (will be handled by backend if not available)
  const body = {
    token: activeToken,
    captchaResult: {
      type: captchaResult.type,
      value: captchaResult.value.trim() // Ensure no whitespace
    },
    profile: {
      displayName: nickname.trim() ? nickname.trim().slice(0, 32) : undefined,
      applicationReason: applicationReason.trim() ? applicationReason.trim().slice(0, 500) : undefined,
    },
  };

  try {
    const res = await fetch(
      (process.env.NEXT_PUBLIC_API_BASE_URL || "") + "/api/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    const data: VerifyResponse = await res.json();

    console.log('[Verify] Response received', { 
      ok: data.ok, 
      error: data.error,
      reason: data.reason,
      status: res.status
    });

    if (data.ok) {
      setStep(3);
      setCompletedAt(new Date().toISOString());
      setCompletedUserId(data.userId ? String(data.userId) : '');
      if (data.reviewStatus === 'INTERVIEW_REQUIRED') {
        setStatusMsg(t.reviewInterviewMessage);
      } else {
        setStatusMsg(t.reviewPendingMessage);
      }
    } else {
      setStep(1);
      // Reset captcha result untuk allow retry
      setCaptchaResult(null);
      
      let errorMessage = t.verifyFailed;
      if (data.error) {
        if (data.error === "maintenance-mode") {
          errorMessage = `${t.envCheck.maintenance}: ${data.reason || ''}`;
        } else if (data.error === 'application-reason-too-short') {
          errorMessage = t.applicationReasonError;
        } else if (data.error === 'token-expired') {
          if (startedVerification && !autoRefreshUsed) {
            setAutoRefreshUsed(true);
            setStep(2);
            setStatusMsg(locale === 'id' ? 'Token kadaluarsa, memperbarui token...' : 'Token expired, refreshing token...');
            const newToken = await regenerateToken({ silent: true });
            if (newToken) {
              setStep(1);
              setStatusMsg(tokenRefreshedLabel);
            } else {
              setStep(1);
              errorMessage = t.tokenExpired;
            }
          } else {
            errorMessage = t.tokenExpired;
          }
        } else if (data.error === "captcha-invalid") {
          // Show more specific error message
          const reason = data.reason || '';
          if (reason.includes('Secret key')) {
            errorMessage = t.verifyFailed + " (Konfigurasi server error. Hubungi admin.)";
          } else if (reason.includes('Token')) {
            errorMessage = t.verifyFailed + " (Token expired. Silakan refresh halaman dan coba lagi.)";
          } else {
            errorMessage = t.verifyFailed + " (Captcha tidak valid. Silakan refresh halaman dan coba lagi.)";
          }
        } else if (data.error === "token-expired") {
          errorMessage = t.tokenExpired;
        } else if (data.error === "invalid-token") {
          errorMessage = t.tokenMissing;
        } else {
          errorMessage = t.verifyFailed + (data.error ? ` (${data.error})` : "");
        }
      }
      
      console.error('[Verify] Error details:', { error: data.error, reason: data.reason });
      setStatusMsg(errorMessage);
    }
  } catch (err) {
    console.error('[Verify] Error:', err);
    setStep(1);
    setCaptchaResult(null);
    setStatusMsg(t.errors.apiTimeout);
  }
}, [
  token,
  captchaResult,
  t.captchaMissing,
  t.verifyFailed,
  t.verifying,
  t.applicationReasonError,
  t.reviewInterviewMessage,
  t.reviewPendingMessage,
  t.errors.apiTimeout,
  t.envCheck.maintenance,
  t.tokenExpired,
  t.errors.linkUsed,
  startedVerification,
  autoRefreshUsed,
  regenerateToken,
  tokenRefreshedLabel,
  locale,
  applicationReason,
  nickname,
]);

  // --- UI Renders ---

  if (loading) {
    return (
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
             <div className="animate-pulse flex flex-col items-center gap-4">
                 <div className="h-12 w-12 bg-slate-800 rounded-full"></div>
                 <div className="h-4 w-32 bg-slate-800 rounded"></div>
                 <div className="text-slate-400 text-sm">{t.envCheck.checking}</div>
             </div>
        </div>
    );
  }
  
  // Maintenance Mode
  if (envStatus?.maintenanceMode) {
      return (
          <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
              <div className="max-w-md w-full bg-slate-900 border border-amber-500/30 p-8 rounded-2xl text-center shadow-2xl">
                  <ExclamationTriangleIcon className="h-16 w-16 text-amber-500 mx-auto mb-4" />
                  <h1 className="text-2xl font-bold mb-2">{t.envCheck.maintenance}</h1>
                  <p className="text-slate-400 mb-6">{envStatus.maintenanceReason || t.envCheck.maintenance}</p>
              </div>
          </div>
      );
  }

  // Fatal Error (No Token / Expired / Used)
  if (!token || (timeLeft !== null && timeLeft <= 0) || statusMsg === t.errors.linkUsed || statusMsg === t.tokenMissing) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
             <div className="max-w-md w-full bg-slate-900 border border-red-500/30 p-8 rounded-2xl text-center shadow-2xl">
                 <ExclamationTriangleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
                 <h1 className="text-2xl font-bold mb-2">{t.accessDenied}</h1>
                 <p className="text-slate-400 mb-6">{statusMsg || t.tokenMissing}</p>
                 {timeLeft === 0 && <div className="text-red-400 font-mono text-xl">{t.tokenExpired}</div>}
             </div>
        </div>
      );
  }

  const botOnline = Boolean(envStatus?.botOnline);
  const tokenValid = Boolean(token && timeLeft !== null && timeLeft > 0);
  const reasonOk = applicationReason.trim().length >= 10;
  const captchaOk = Boolean(captchaResult?.value);

  const checklist = [
    {
      label: locale === 'id' ? 'Bot online' : 'Bot online',
      state: botOnline ? 'done' : 'fail',
    },
    {
      label: locale === 'id' ? 'Link valid' : 'Link valid',
      state: tokenValid ? 'done' : timeLeft === 0 ? 'fail' : 'pending',
    },
    {
      label: locale === 'id' ? 'Form lengkap' : 'Form complete',
      state: reasonOk ? 'done' : 'pending',
    },
    {
      label: locale === 'id' ? 'Captcha selesai' : 'Captcha solved',
      state: captchaOk ? 'done' : 'pending',
    },
    {
      label: locale === 'id' ? 'Validasi akhir' : 'Final validation',
      state: step === 3 ? 'done' : step === 2 ? 'pending' : 'pending',
    },
  ];

  return (
    <main className="min-h-screen bg-[#050505] text-slate-200 font-sans flex items-center justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-[-10%] right-[20%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-700/50 bg-slate-900/50">
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                    {guildIcon ? <img src={guildIcon} alt="Icon" className="w-12 h-12 rounded-xl border border-slate-600 shadow-lg" /> : <div className="w-12 h-12 rounded-xl bg-slate-800" />}
                    <div>
                        <h1 className="text-lg font-bold text-white leading-tight">{guildName}</h1>
                        <p className="text-xs text-cyan-400 font-medium">{t.titleSuffix}</p>
                    </div>
                </div>
                {/* Language Switcher */}
                <div className="flex bg-slate-800 rounded-lg p-1">
                    <button onClick={() => setLocale('id')} className={`px-2 py-1 text-xs rounded-md transition ${locale === 'id' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>ID</button>
                    <button onClick={() => setLocale('en')} className={`px-2 py-1 text-xs rounded-md transition ${locale === 'en' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>EN</button>
                </div>
            </div>
            
            {/* Progress Stepper */}
            <div className="flex items-center justify-between px-2 mt-4 relative">
                 <div className="absolute left-0 top-1/2 w-full h-0.5 bg-slate-800 -z-10" />
                 {[0, 1, 2, 3].map((s) => (
                     <div key={s} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${step >= s ? 'bg-cyan-500 text-slate-950 scale-110 shadow-[0_0_15px_rgba(34,211,238,0.5)]' : 'bg-slate-800 text-slate-500'}`}>
                         {step > s ? <CheckCircleIcon className="w-5 h-5" /> : s}
                     </div>
                 ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-2 px-1">
                <span>{t.step0}</span>
                <span>{t.step1}</span>
                <span>{t.step2}</span>
                <span>{t.step3}</span>
            </div>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 flex flex-col gap-6">
            
            {/* Timer */}
            {timeLeft !== null && step < 3 && (
                <div className={`flex items-center justify-center gap-2 text-sm font-mono py-2 px-4 rounded-full w-max mx-auto border ${timeLeft < 60000 ? 'bg-red-500/10 border-red-500/30 text-red-400 animate-pulse' : 'bg-slate-800/50 border-slate-700 text-cyan-400'}`}>
                    <ClockIcon className="w-4 h-4" />
                    <span>{t.tokenExpiresIn} {formatTime(timeLeft)}</span>
                </div>
            )}

            {/* Step 0: Agreements */}
            {step === 0 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
                        <h3 className="text-sm font-semibold text-white mb-2">{t.welcome} {guildName}</h3>
                        <p className="text-xs text-slate-400 leading-relaxed">{t.subtitle}</p>
                        <div className="mt-3 flex items-center gap-2 text-xs text-cyan-300 bg-cyan-500/5 p-2 rounded-lg border border-cyan-500/10">
                            <ShieldCheckIcon className="w-4 h-4" />
                            {t.rolePreview}
                        </div>
                    </div>

                    <details className="bg-slate-800/20 p-4 rounded-xl border border-slate-700/40">
                        <summary className="cursor-pointer text-sm font-semibold text-white">{t.faq.title}</summary>
                        <div className="mt-3 text-xs text-slate-300 space-y-2">
                            <div>
                                <div className="font-semibold text-slate-200">{t.faq.q1}</div>
                                <div className="text-slate-400 leading-relaxed">{t.faq.a1}</div>
                            </div>
                        </div>
                    </details>

                    <div className="space-y-3">
                        <label className="flex items-start gap-3 cursor-pointer group">
                            <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition ${agreedTerms ? 'bg-cyan-500 border-cyan-500' : 'border-slate-600 group-hover:border-slate-500'}`}>
                                {agreedTerms && <CheckCircleIcon className="w-4 h-4 text-slate-900" />}
                            </div>
                            <div className="text-sm text-slate-300 select-none" onClick={() => !agreedTerms && setTermsOpen(true)}>
                                {t.termsCheckbox} <span className="text-cyan-400 underline" onClick={(e) => { e.stopPropagation(); setTermsOpen(true); }}>{t.docs}</span>
                            </div>
                        </label>

                        <label className="flex items-start gap-3 cursor-pointer group">
                            <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition ${agreedPrivacy ? 'bg-cyan-500 border-cyan-500' : 'border-slate-600 group-hover:border-slate-500'}`}>
                                {agreedPrivacy && <CheckCircleIcon className="w-4 h-4 text-slate-900" />}
                            </div>
                            <div className="text-sm text-slate-300 select-none" onClick={() => !agreedPrivacy && setPrivacyOpen(true)}>
                                {t.privacyCheckbox} <span className="text-cyan-400 underline" onClick={(e) => { e.stopPropagation(); setPrivacyOpen(true); }}>{t.docs}</span>
                            </div>
                        </label>
                    </div>

                    <div className="pt-2">
                        <button 
                            onClick={() => setStep(1)}
                            disabled={!agreedTerms || !agreedPrivacy}
                            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 font-bold shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-95 transition-all"
                        >
                            {t.button}
                        </button>
                        <p className="text-[10px] text-center text-slate-500 mt-3">{t.estimatedTime}</p>
                    </div>
                </div>
            )}

            {/* Step 1: Captcha */}
            {step === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
                    <div className="text-center">
                        <h2 className="text-xl font-bold text-white mb-2">{t.step1}</h2>
                        <p className="text-sm text-slate-400">{t.captchaMissing}</p>
                    </div>

                    <div className="bg-slate-800/25 p-4 rounded-xl border border-slate-700/40">
                        <div className="text-xs text-slate-300 leading-relaxed">{securityBlurb}</div>
                        <div className="mt-3 space-y-2">
                            {checklist.map((item) => {
                                const isDone = item.state === 'done';
                                const isFail = item.state === 'fail';
                                return (
                                    <div key={item.label} className="flex items-center justify-between text-[11px]">
                                        <span className="text-slate-300">{item.label}</span>
                                        <span className={isDone ? 'text-green-400' : isFail ? 'text-red-400' : 'text-slate-400'}>
                                            {isDone ? '✅' : isFail ? '❌' : '⏳'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs font-semibold text-slate-200">{t.nicknameLabel}</div>
                        <input
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value.slice(0, 32))}
                            placeholder={t.nicknamePlaceholder}
                            className="w-full rounded-xl bg-slate-800/40 border border-slate-700/50 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                        />
                        <div className="text-[11px] text-slate-400">{t.nicknameHint}</div>

                        {nicknameSuggestions.length > 0 && (
                            <div className="pt-1">
                                <div className="text-[11px] text-slate-400 mb-2">{t.nicknameSuggestions}</div>
                                <div className="flex flex-wrap gap-2">
                                    {nicknameSuggestions.map((s) => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => setNickname(s)}
                                            className="px-3 py-1.5 rounded-full bg-slate-800/60 border border-slate-700/60 text-[11px] text-slate-200 hover:bg-slate-700/60 transition"
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs font-semibold text-slate-200">{t.applicationReasonLabel}</div>
                        <textarea
                            value={applicationReason}
                            onChange={(e) => setApplicationReason(e.target.value.slice(0, 500))}
                            placeholder={t.applicationReasonPlaceholder}
                            className="w-full rounded-xl bg-slate-800/40 border border-slate-700/50 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 min-h-[96px]"
                        />
                        <div className="text-[11px] text-slate-400">{t.applicationReasonHint}</div>
                    </div>

                    <div className="flex justify-center p-4 bg-slate-800/30 rounded-2xl border border-slate-700/50">
                        <CaptchaBlock 
                            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ''}
                            fallbackText={t.captchaFallback}
                            onSolved={handleCaptchaSolved}
                        />
                    </div>

                    <div className="sticky bottom-0 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] bg-slate-900/80 backdrop-blur-xl rounded-xl">
                        {captchaResult && captchaResult.value && (
                            <button
                                onClick={() => handleVerify()}
                                disabled={!captchaResult || !captchaResult.value}
                                className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 font-bold shadow-lg shadow-cyan-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                            >
                                {t.button}
                            </button>
                        )}

                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <button
                                type="button"
                                onClick={() => regenerateToken()}
                                disabled={!token || regeneratingToken}
                                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition border border-slate-700 disabled:opacity-50"
                            >
                                {regeneratingToken ? t.verifying : generateNewTokenLabel}
                            </button>

                            <a
                                href={pageUrl || 'about:blank'}
                                target="_blank"
                                rel="noreferrer"
                                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition border border-slate-700 text-center"
                            >
                                {openInBrowserLabel}
                            </a>
                        </div>
                    </div>
                    
                    <button onClick={() => {
                        setStep(0);
                        setCaptchaResult(null); // Reset captcha when going back
                    }} className="w-full text-xs text-slate-500 hover:text-slate-300 transition">
                        {t.back}
                    </button>
                </div>
            )}

            {/* Step 2: Processing */}
            {step === 2 && (
                <div className="flex flex-col items-center justify-center py-10 animate-in fade-in zoom-in duration-500">
                    <div className="relative w-20 h-20 mb-6">
                        <div className="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-cyan-500 rounded-full border-t-transparent animate-spin"></div>
                    </div>
                    <h2 className="text-lg font-bold text-white mb-2">{t.verifying}</h2>
                    <p className="text-xs text-slate-400">{t.errors.apiTimeout}</p>
                </div>
            )}

            {/* Step 3: Success */}
            {step === 3 && (
                 <div className="text-center py-8 animate-in fade-in zoom-in duration-700">
                     <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-green-500/20">
                         <CheckCircleIcon className="w-12 h-12 text-green-500" />
                     </div>
                     <h2 className="text-2xl font-bold text-white mb-2">{t.verified}</h2>
                     <p className="text-slate-300 mb-8">{statusMsg}</p>

                     <div className="mb-6 text-left text-xs text-slate-300 bg-slate-800/30 rounded-xl border border-slate-700/50 p-4">
                        <div className="flex justify-between gap-3">
                            <div className="text-slate-400">{locale === 'id' ? 'Waktu' : 'Time'}</div>
                            <div className="font-mono text-slate-200">{completedAt ? new Date(completedAt).toLocaleString() : '—'}</div>
                        </div>
                        <div className="flex justify-between gap-3 mt-2">
                            <div className="text-slate-400">{locale === 'id' ? 'Discord ID' : 'Discord ID'}</div>
                            <div className="font-mono text-slate-200">{completedUserId ? maskUserId(completedUserId) : '—'}</div>
                        </div>
                     </div>
                     
                     <a href="discord://" className="inline-block w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition border border-slate-700">
                         {t.openDiscord}
                     </a>
                 </div>
            )}
            
            {statusMsg && step !== 2 && step !== 3 && (
                <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700 text-xs text-center text-amber-300">
                    {statusMsg}
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/30 border-t border-slate-800 text-center">
            <p className="text-[10px] text-slate-600">
                {t.antiScam}
            </p>
            <p className="text-[10px] text-slate-600 mt-1">
                {locale === 'id'
                    ? 'Kami tidak pernah meminta password Discord atau kode OTP.'
                    : 'We never ask for your Discord password or OTP code.'}
            </p>
            <p className="text-[10px] text-slate-700 mt-1">v1.4.2 &bull; {t.footer}</p>
        </div>
      </div>

      {/* Modals */}
      <PolicyModal 
        isOpen={termsOpen} 
        onClose={() => setTermsOpen(false)} 
        title={t.termsTitle} 
        agreeText={t.agreeBtn}
        readToEndText={t.readToEnd}
        onAgree={() => setAgreedTerms(true)}
        content={
            <div className="space-y-4">
                {t.termsContent.map((item, index) => (
                    <p key={index}>
                        <strong>{item.title}</strong><br/>
                        {item.text.replace('{guildName}', guildName)}
                    </p>
                ))}
            </div>
        } 
      />
      
      <PolicyModal 
        isOpen={privacyOpen} 
        onClose={() => setPrivacyOpen(false)} 
        title={t.privacyTitle} 
        agreeText={t.agreeBtn}
        readToEndText={t.readToEnd}
        onAgree={() => setAgreedPrivacy(true)}
        content={
            <div className="space-y-4">
                {t.privacyContent.map((item, index) => (
                    <p key={index}>
                        <strong>{item.title}</strong><br/>
                        {item.text}
                    </p>
                ))}
            </div>
        } 
      />

    </main>
  );
}
