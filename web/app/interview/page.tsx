"use client";

import { useEffect, useState } from "react";
import { useLocaleCopy } from "../../lib/useLocale";
import { CheckCircleIcon, ExclamationTriangleIcon, ClockIcon, ClipboardDocumentIcon } from '@heroicons/react/24/solid';

declare const process: {
  env: Record<string, string | undefined>;
};

interface InterviewStatusResponse {
  ok?: boolean;
  status?: 'INTERVIEW_REQUIRED' | 'INTERVIEW_ANSWERED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';
  interviewLink?: string;
  interviewSubmittedAt?: string;
  reviewStatus?: string;
  reason?: string;
  error?: string;
}

export default function InterviewPage() {
  const { t, locale, setLocale } = useLocaleCopy();
  
  const [token, setToken] = useState<string | null>(null);
  const [guildName, setGuildName] = useState<string>("Server");
  const [guildIcon, setGuildIcon] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [interviewData, setInterviewData] = useState<InterviewStatusResponse | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    const guildParam = urlParams.get('guild') || urlParams.get('guildId');
    
    if (!tokenParam) {
      setStatus('Token tidak ditemukan. Pastikan link interview lengkap.');
      setLoading(false);
      return;
    }
    
    setToken(tokenParam);
    if (guildParam) {
      setGuildName(guildParam);
    }

    // Fetch interview status
    fetchInterviewStatus(tokenParam);
  }, []);

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'INTERVIEW_REQUIRED':
        return 'Interview Diperlukan';
      case 'INTERVIEW_ANSWERED':
        return 'Jawaban Terkirim';
      case 'PENDING_REVIEW':
        return 'Menunggu Review';
      case 'VERIFIED':
        return 'Terverifikasi';
      case 'REJECTED':
        return 'Ditolak';
      default:
        return 'Status Tidak Diketahui';
    }
  };

  const fetchInterviewStatus = async (tokenValue: string) => {
    try {
      console.log('[Interview] Fetching status for token:', tokenValue);
      const apiUrl = `${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001'}/api/interview-status?token=${encodeURIComponent(tokenValue)}`;
      console.log('[Interview] API URL:', apiUrl);
      
      const res = await fetch(apiUrl);
      console.log('[Interview] Response status:', res.status);
      
      const data: InterviewStatusResponse = await res.json();
      console.log('[Interview] Response data:', data);
      
      if (!res.ok) {
        console.error('[Interview] API Error:', data.error);
        setStatus(data.error || 'Gagal mengambil status interview');
        setLoading(false);
        return;
      }

      setInterviewData(data);
      
      // Set status message based on interview status
      switch (data.status) {
        case 'INTERVIEW_REQUIRED':
          setStatus('Kamu diminta untuk mengisi form interview. Klik tombol di bawah untuk mulai.');
          break;
        case 'INTERVIEW_ANSWERED':
          setStatus('Jawaban interview telah diterima. Menunggu review dari staff.');
          break;
        case 'PENDING_REVIEW':
          setStatus('Aplikasi kamu sedang dalam proses review oleh staff.');
          break;
        case 'VERIFIED':
          setStatus('Selamat! Kamu telah diverifikasi dan mendapatkan role.');
          break;
        case 'REJECTED':
          setStatus('Maaf, aplikasi kamu ditolak. ' + (data.reason || ''));
          break;
        default:
          setStatus('Status tidak diketahui.');
      }
    } catch (error) {
      console.error('[Interview] Fetch error:', error);
      setStatus('Terjadi kesalahan saat mengambil status interview. Token: ' + tokenValue);
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setStatus('Link disalin ke clipboard!');
    setTimeout(() => {
      // Restore original status after 2 seconds
      if (interviewData) {
        switch (interviewData.status) {
          case 'INTERVIEW_REQUIRED':
            setStatus('Kamu diminta untuk mengisi form interview. Klik tombol di bawah untuk mulai.');
            break;
          case 'INTERVIEW_ANSWERED':
            setStatus('Jawaban interview telah diterima. Menunggu review dari staff.');
            break;
          case 'PENDING_REVIEW':
            setStatus('Aplikasi kamu sedang dalam proses review oleh staff.');
            break;
          case 'VERIFIED':
            setStatus('Selamat! Kamu telah diverifikasi dan mendapatkan role.');
            break;
          case 'REJECTED':
            setStatus('Maaf, aplikasi kamu ditolak. ' + (interviewData.reason || ''));
            break;
          default:
            setStatus('Status tidak diketahui.');
        }
      }
    }, 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 bg-slate-800 rounded-full"></div>
          <div className="h-4 w-32 bg-slate-800 rounded"></div>
          <div className="text-slate-400 text-sm">Memuat status interview...</div>
        </div>
      </div>
    );
  }

  if (!token || status.includes('Token tidak ditemukan') || status.includes('Token tidak valid')) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/30 p-8 rounded-2xl text-center shadow-2xl">
          <ExclamationTriangleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Akses Ditolak</h1>
          <p className="text-slate-400 mb-6">{status || 'Token tidak ditemukan'}</p>
        </div>
      </div>
    );
  }

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
              {guildIcon ? (
                <img src={guildIcon} alt="Icon" className="w-12 h-12 rounded-xl border border-slate-600 shadow-lg" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-slate-800" />
              )}
              <div>
                <h1 className="text-lg font-bold text-white leading-tight">{guildName}</h1>
                <p className="text-xs text-cyan-400 font-medium">Interview Status</p>
              </div>
            </div>
            {/* Language Switcher */}
            <div className="flex bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setLocale('id')}
                className={`px-2 py-1 text-xs rounded-md transition ${
                  locale === 'id' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                ID
              </button>
              <button
                onClick={() => setLocale('en')}
                className={`px-2 py-1 text-xs rounded-md transition ${
                  locale === 'en' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                EN
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {!interviewData ? (
            <div className="text-center py-8">
              <div className="animate-spin h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-slate-400">Memuat status interview...</p>
            </div>
          ) : (
            <>
              {/* Status Card */}
              <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
                <div className="flex items-center gap-3 mb-3">
                  {interviewData.status === 'VERIFIED' ? (
                    <CheckCircleIcon className="h-6 w-6 text-green-500" />
                  ) : interviewData.status === 'REJECTED' ? (
                    <ExclamationTriangleIcon className="h-6 w-6 text-red-500" />
                  ) : (
                    <ClockIcon className="h-6 w-6 text-cyan-500" />
                  )}
                  <div>
                    <h3 className="text-sm font-semibold text-white">Status Interview</h3>
                    <p className="text-xs text-slate-400">{getStatusText(interviewData.status)}</p>
                  </div>
                </div>
                
                {interviewData.interviewSubmittedAt && (
                  <div className="text-xs text-slate-500 mt-2">
                    <span>Dikirim: {new Date(interviewData.interviewSubmittedAt).toLocaleString('id-ID')}</span>
                  </div>
                )}
                
                {interviewData.reviewStatus && (
                  <div className="mt-3 p-3 bg-slate-900/50 rounded-lg border border-slate-600/50">
                    <p className="text-xs text-cyan-400 font-medium mb-1">Review Status:</p>
                    <p className="text-xs text-slate-300">{interviewData.reviewStatus}</p>
                    {interviewData.reason && (
                      <p className="text-xs text-slate-400 mt-1">{interviewData.reason}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Interview Link */}
              {interviewData.interviewLink && (
                <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
                  <h3 className="text-sm font-semibold text-white mb-3">Form Interview</h3>
                  <div className="space-y-3">
                    <a
                      href={interviewData.interviewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-medium py-3 px-4 rounded-xl text-center transition-all duration-200 shadow-[0_0_15px_rgba(34,211,238,0.3)]"
                    >
                      Buka Form Interview
                    </a>
                    
                    <button
                      onClick={() => copyToClipboard(interviewData.interviewLink!)}
                      className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-xl text-center transition-all duration-200 flex items-center justify-center gap-2"
                    >
                      <ClipboardDocumentIcon className="w-4 h-4" />
                      Salin Link Interview
                    </button>
                  </div>
                </div>
              )}

              {/* Additional Info */}
              {interviewData.status === 'INTERVIEW_REQUIRED' && (
                <div className="bg-cyan-500/5 p-4 rounded-xl border border-cyan-500/10">
                  <p className="text-xs text-cyan-300">
                    <strong>Penting:</strong> Silakan isi form interview secepatnya untuk melanjutkan proses verifikasi.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
