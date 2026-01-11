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

  const fetchInterviewStatus = async (tokenValue: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001'}/api/interview-status?token=${encodeURIComponent(tokenValue)}`);
      const data: InterviewStatusResponse = await res.json();
      
      if (!res.ok) {
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
    } catch (err) {
      console.error('Failed to fetch interview status:', err);
      setStatus('Terjadi kesalahan saat mengambil status interview.');
    } finally {
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
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-4">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Memuat status interview...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="max-w-md w-full">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-8 border border-white/20">
          {/* Header */}
          <div className="text-center mb-8">
            {guildIcon ? (
              <img src={guildIcon} alt={guildName} className="w-16 h-16 rounded-full mx-auto mb-4 border-2 border-white/30" />
            ) : (
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full mx-auto mb-4 flex items-center justify-center">
                <span className="text-white text-2xl font-bold">{guildName.charAt(0)}</span>
              </div>
            )}
            <h1 className="text-3xl font-bold text-white mb-2">Interview Verification</h1>
            <p className="text-white/80">{guildName}</p>
          </div>

          {/* Status Message */}
          <div className={`mb-6 p-4 rounded-lg flex items-center space-x-3 ${
            interviewData?.status === 'VERIFIED' ? 'bg-green-500/20 text-green-100' :
            interviewData?.status === 'REJECTED' ? 'bg-red-500/20 text-red-100' :
            'bg-blue-500/20 text-blue-100'
          }`}>
            {interviewData?.status === 'VERIFIED' && <CheckCircleIcon className="w-6 h-6" />}
            {interviewData?.status === 'REJECTED' && <ExclamationTriangleIcon className="w-6 h-6" />}
            {interviewData?.status !== 'VERIFIED' && interviewData?.status !== 'REJECTED' && <ClockIcon className="w-6 h-6" />}
            <span className="text-sm">{status}</span>
          </div>

          {/* Interview Link Button */}
          {interviewData?.status === 'INTERVIEW_REQUIRED' && interviewData.interviewLink && (
            <div className="space-y-4">
              <a
                href={interviewData.interviewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 px-6 rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 transition-all duration-200 text-center block"
              >
                Buka Form Interview
              </a>
              
              <button
                onClick={() => copyToClipboard(interviewData.interviewLink!)}
                className="w-full bg-white/10 text-white py-3 px-6 rounded-lg font-semibold hover:bg-white/20 transition-all duration-200 flex items-center justify-center space-x-2"
              >
                <ClipboardDocumentIcon className="w-5 h-5" />
                <span>Salin Link Interview</span>
              </button>
            </div>
          )}

          {/* Interview Submitted Info */}
          {interviewData?.status === 'INTERVIEW_ANSWERED' && interviewData.interviewSubmittedAt && (
            <div className="bg-white/5 rounded-lg p-4">
              <p className="text-white/80 text-sm mb-2">Interview dikirim pada:</p>
              <p className="text-white font-medium">
                {new Date(interviewData.interviewSubmittedAt).toLocaleString('id-ID', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          )}

          {/* Review Status */}
          {interviewData?.reviewStatus && (
            <div className="bg-white/5 rounded-lg p-4">
              <p className="text-white/80 text-sm mb-2">Status Review:</p>
              <p className="text-white font-medium">{interviewData.reviewStatus}</p>
            </div>
          )}

          {/* Token Info */}
          {token && (
            <div className="mt-6 pt-6 border-t border-white/10">
              <p className="text-white/60 text-xs text-center">
                Token: {token.slice(0, 8)}...{token.slice(-4)}
              </p>
            </div>
          )}

          {/* Help Text */}
          <div className="mt-6 text-center">
            <p className="text-white/60 text-sm">
              Butuh bantuan? Hubungi staff server.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
