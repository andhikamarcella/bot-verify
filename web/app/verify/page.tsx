"use client";

import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import { useLocaleCopy } from "../../lib/useLocale";
import { CaptchaBlock } from "../../components/CaptchaBlock";
import { PolicyModal } from "../../components/PolicyModal";
import { CheckCircleIcon, ExclamationTriangleIcon, ClockIcon, ShieldCheckIcon } from '@heroicons/react/24/solid';

interface VerifyResponse {
  ok?: boolean;
  badgeEmoji?: string;
  mobileDeepLink?: string;
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
  
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  // Initial Load & Pre-check
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tParam = params.get("token");
    setToken(tParam || null);
    
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

  async function handleVerify() {
    if (!token || !captchaToken) return;
    
    setStep(2); // Processing
    setStatusMsg(t.verifying);

    const body = {
      token,
      captchaResult: { type: "turnstile", value: captchaToken },
      ip: "0.0.0.0", // Server will detect actual IP
    };

    try {
      const res = await fetch((process.env.NEXT_PUBLIC_API_BASE_URL || "") + "/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: VerifyResponse = await res.json();

      if (data.ok) {
        setStep(3); // Done
        setStatusMsg(t.successMessage);
        // Confetti effect can be triggered here if we had the lib
      } else {
        setStep(1); // Back to captcha
        if (data.error === 'maintenance-mode') {
             setStatusMsg(`${t.envCheck.maintenance}: ${data.reason}`);
        } else {
             setStatusMsg(t.verifyFailed + (data.error ? ` (${data.error})` : ''));
        }
      }
    } catch (error) {
      console.error(error);
      setStep(1);
      setStatusMsg(t.errors.apiTimeout);
    }
  }

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
                  <p className="text-slate-400 mb-6">{envStatus.maintenanceReason || 'Maintenance in progress'}</p>
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
                 <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
                 <p className="text-slate-400 mb-6">{statusMsg || t.tokenMissing}</p>
                 {timeLeft === 0 && <div className="text-red-400 font-mono text-xl">{t.tokenExpired}</div>}
             </div>
        </div>
      );
  }

  return (
    <main className="min-h-screen bg-[#050505] text-slate-200 font-sans flex items-center justify-center p-4 relative overflow-hidden">
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

                    <div className="space-y-3">
                        <label className="flex items-start gap-3 cursor-pointer group">
                            <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition ${agreedTerms ? 'bg-cyan-500 border-cyan-500' : 'border-slate-600 group-hover:border-slate-500'}`}>
                                {agreedTerms && <CheckCircleIcon className="w-4 h-4 text-slate-900" />}
                            </div>
                            <div className="text-sm text-slate-300 select-none" onClick={() => !agreedTerms && setTermsOpen(true)}>
                                {t.termsCheckbox} <span className="text-cyan-400 underline" onClick={(e) => { e.stopPropagation(); setTermsOpen(true); }}>Docs</span>
                            </div>
                        </label>

                        <label className="flex items-start gap-3 cursor-pointer group">
                            <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition ${agreedPrivacy ? 'bg-cyan-500 border-cyan-500' : 'border-slate-600 group-hover:border-slate-500'}`}>
                                {agreedPrivacy && <CheckCircleIcon className="w-4 h-4 text-slate-900" />}
                            </div>
                            <div className="text-sm text-slate-300 select-none" onClick={() => !agreedPrivacy && setPrivacyOpen(true)}>
                                {t.privacyCheckbox} <span className="text-cyan-400 underline" onClick={(e) => { e.stopPropagation(); setPrivacyOpen(true); }}>Docs</span>
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

                    <div className="flex justify-center p-4 bg-slate-800/30 rounded-2xl border border-slate-700/50">
                        <CaptchaBlock onSolved={(res) => {
                            if (res.value) {
                                setCaptchaToken(res.value);
                                handleVerify(); // Auto submit? No, wait, user might want to click. But user asked for auto retry/smooth UX. Let's auto trigger handleVerify after state update.
                                // Actually handleVerify needs to be called.
                                // React state update is async, so better to call a function that calls verify with the token.
                            }
                        }} />
                    </div>

                    {captchaToken && (
                         <button 
                            onClick={handleVerify}
                            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 font-bold shadow-lg shadow-cyan-500/20 hover:scale-[1.02] active:scale-95 transition-all"
                        >
                            {t.button}
                        </button>
                    )}
                    
                    <button onClick={() => setStep(0)} className="w-full text-xs text-slate-500 hover:text-slate-300 transition">
                        Back
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
                     <h2 className="text-2xl font-bold text-white mb-2">Verified!</h2>
                     <p className="text-slate-300 mb-8">{t.successMessage}</p>
                     
                     <a href="discord://" className="inline-block w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition border border-slate-700">
                         Open Discord
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
                <p><strong>1. Introduction</strong><br/>Welcome to {guildName}. By verifying, you agree to these terms.</p>
                <p><strong>2. User Conduct</strong><br/>You agree not to spam, raid, or harass other members. Multiple accounts are strictly prohibited.</p>
                <p><strong>3. Bot Usage</strong><br/>Our verification bot collects your Discord ID and IP address (hashed) for security purposes.</p>
                <p><strong>4. Termination</strong><br/>Admins reserve the right to revoke your verified status at any time.</p>
                <p><strong>5. Liability</strong><br/>We are not responsible for any issues arising from Discord API downtimes.</p>
                <div className="h-32 bg-slate-800/50 rounded-lg flex items-center justify-center text-slate-600 text-xs">
                    (Scroll down to read more...)
                </div>
                <p><strong>6. Updates</strong><br/>These terms may change at any time.</p>
                <p><strong>7. Final Agreement</strong><br/>By clicking "I Understand", you confirm you are human and eligible to join.</p>
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
                <p><strong>1. Data Collection</strong><br/>We collect your Discord User ID, Username, and IP Address.</p>
                <p><strong>2. Purpose</strong><br/>This data is used solely for verification and anti-abuse measures.</p>
                <p><strong>3. Data Retention</strong><br/>Verification logs are stored for 30 days and then anonymized.</p>
                <p><strong>4. Third Parties</strong><br/>We use Cloudflare Turnstile for CAPTCHA, which may collect device info.</p>
                <p><strong>5. Your Rights</strong><br/>You can request data deletion by contacting the server owner.</p>
                <div className="h-32 bg-slate-800/50 rounded-lg flex items-center justify-center text-slate-600 text-xs">
                    (Scroll down to read more...)
                </div>
                <p><strong>6. Cookies</strong><br/>We use local storage to save your language preference.</p>
                <p><strong>7. Contact</strong><br/>For privacy concerns, reach out to staff.</p>
            </div>
        } 
      />

    </main>
  );
}
