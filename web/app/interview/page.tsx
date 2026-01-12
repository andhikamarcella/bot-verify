"use client";

import { useEffect, useState } from "react";

// Add React import for types
import React from "react";

interface InterviewStatusResponse {
  ok?: boolean;
  status?: 'INTERVIEW_REQUIRED' | 'INTERVIEW_ANSWERED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED' | 'HOLD';
  interviewLink?: string;
  interviewSubmittedAt?: string;
  reviewStatus?: string;
  reason?: string;
  error?: string;
  answers?: {
    name?: string;
    age?: string;
    reason?: string;
    experience?: string;
    availability?: string;
    expectations?: string;
  };
  userId?: string;
  guildId?: string;
  guildName?: string;
  guildIcon?: string;
  isStaff?: boolean;
}

export default function InterviewPage() {
  const [token, setToken] = useState<string | null>(null);
  const [guildName, setGuildName] = useState<string>("");
  const [guildIcon, setGuildIcon] = useState<string | null>(null);
  const [interviewData, setInterviewData] = useState<InterviewStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("Memuat status interview...");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    reason: '',
    experience: '',
    availability: '',
    expectations: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [showCopyNotification, setShowCopyNotification] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenValue = urlParams.get('token');
    const guildValue = urlParams.get('guild');

    if (tokenValue) {
      setToken(tokenValue);
    } else {
      setStatus('Token tidak ditemukan di URL');
      setLoading(false);
    }

    if (guildValue) {
      setGuildName(decodeURIComponent(guildValue));
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchInterviewStatus(token);
    }
  }, [token]);

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
      case 'HOLD':
        return 'Ditahan';
      default:
        return 'Status Tidak Diketahui';
    }
  };

  const fetchInterviewStatus = async (tokenValue: string) => {
    try {
      console.log('[Interview] Fetching status for token:', tokenValue);
      
      // Production API URL for Vercel deployment
      const getApiBaseUrl = () => {
        // Check if we're in production (Vercel)
        if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
          return 'https://vfy.up.railway.app'; // Railway API server
        }
        // Fallback to environment variable or localhost
        return (typeof window !== 'undefined' && (window as any).process?.env?.NEXT_PUBLIC_API_BASE) || 'http://localhost:3001';
      };
      
      const apiUrl = `${getApiBaseUrl()}/api/interview-status?token=${encodeURIComponent(tokenValue)}`;
      
      console.log('[Interview] API URL:', apiUrl);
      console.log('[Interview] Environment:', (typeof window !== 'undefined' && (window as any).process?.env?.NODE_ENV) || 'unknown');
      console.log('[Interview] Hostname:', typeof window !== 'undefined' ? window.location.hostname : 'server');
      
      // Simple fetch without health check for debugging
      console.log('[Interview] Direct API call...');
      
      // Add timeout to prevent infinite loading
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const res = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      console.log('[Interview] Response status:', res.status);
      console.log('[Interview] Response headers:', res.headers);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[Interview] API Error Response:', errorText);
        
        try {
          const errorData = JSON.parse(errorText);
          setStatus(errorData.error || 'Gagal mengambil status interview');
        } catch (jsonErr) {
          setStatus(`API Error (${res.status}): ${errorText}`);
        }
        setLoading(false);
        return;
      }
      
      const data: InterviewStatusResponse = await res.json();
      console.log('[Interview] Response data:', data);
      
      setInterviewData(data);
      
      // Set guild info if available
      if (data.guildIcon) {
        setGuildIcon(data.guildIcon);
      }
      if (data.guildName) {
        setGuildName(data.guildName);
      }
      
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
        case 'HOLD':
          setStatus('Aplikasi kamu ditahan. Silakan isi ulang form interview.');
          break;
        default:
          setStatus('Status tidak diketahui.');
      }
      
      setLoading(false);
    } catch (error) {
      console.error('[Interview] Fetch error:', error);
      if (error.name === 'AbortError') {
        setStatus('Timeout setelah 5 detik. API server mungkin tidak merespons. Coba refresh halaman.');
      } else {
        setStatus(`Terjadi kesalahan: ${error.message}. Token: ${tokenValue}`);
      }
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setShowCopyNotification(true);
    setTimeout(() => setShowCopyNotification(false), 2000);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleInterviewAction = async (action: 'approve' | 'reject' | 'hold') => {
    if (!token) return;
    
    setActionLoading(action);
    
    try {
      const getApiBaseUrl = () => {
        if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
          return 'https://vfy.up.railway.app';
        }
        return (typeof window !== 'undefined' && (window as any).process?.env?.NEXT_PUBLIC_API_BASE) || 'http://localhost:3001';
      };
      
      const response = await fetch(`${getApiBaseUrl()}/api/interview-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          action
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        
        if (action === 'approve') {
          setStatus('✅ Aplikasi disetujui! User mendapatkan role dan dapat join Discord.');
          // Open Discord invite link
          window.open('https://discord.gg/gECYdzVz2j', '_blank');
        } else if (action === 'reject') {
          setStatus('❌ Aplikasi ditolak. User akan dikeluarkan dari server.');
        } else if (action === 'hold') {
          setStatus('⏸️ Aplikasi ditahan. User diminta mengisi ulang form.');
          // Reset form untuk user
          setShowForm(true);
          setFormData({
            name: '',
            age: '',
            reason: '',
            experience: '',
            availability: '',
            expectations: ''
          });
        }
        
        // Refresh status
        fetchInterviewStatus(token);
      } else {
        setStatus(`Gagal melakukan ${action}. Silakan coba lagi.`);
      }
    } catch (error) {
      console.error('[Interview] Action error:', error);
      setStatus(`Terjadi kesalahan saat melakukan ${action}.`);
    } finally {
      setActionLoading(null);
    }
  };

  const submitInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const getApiBaseUrl = () => {
        if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
          return 'https://vfy.up.railway.app';
        }
        return (typeof window !== 'undefined' && (window as any).process?.env?.NEXT_PUBLIC_API_BASE) || 'http://localhost:3001';
      };
      
      const response = await fetch(`${getApiBaseUrl()}/api/interview-submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          answers: formData
        }),
      });
      
      if (response.ok) {
        setStatus('Jawaban interview berhasil dikirim! Menunggu review dari staff.');
        setShowForm(false);
        // Refresh status
        fetchInterviewStatus(token!);
      } else {
        setStatus('Gagal mengirim jawaban. Silakan coba lagi.');
      }
    } catch (error) {
      console.error('[Interview] Submit error:', error);
      setStatus('Terjadi kesalahan saat mengirim jawaban.');
    } finally {
      setSubmitting(false);
    }
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
          <div className="h-16 w-16 text-red-500 mx-auto mb-4">⚠️</div>
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
        
        {/* Header with Guild Branding */}
        <div className="p-6 border-b border-slate-700/50 bg-slate-900/50">
          <div className="flex items-center gap-3 mb-4">
            {/* Guild Icon */}
            {guildIcon ? (
              <img src={guildIcon} alt="Guild Icon" className="w-12 h-12 rounded-xl border border-slate-600 shadow-lg" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#5865F2] to-[#4752C4] flex items-center justify-center shadow-lg">
                <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold text-white leading-tight">{guildName || 'Discord Server'}</h1>
              <p className="text-xs text-cyan-400 font-medium">Interview Verification</p>
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
                  <div className="h-6 w-6 rounded-full bg-cyan-500 flex items-center justify-center">
                    {interviewData.status === 'VERIFIED' ? '✓' : interviewData.status === 'REJECTED' ? '✗' : '⏰'}
                  </div>
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

              {/* Interview Answers Display */}
              {interviewData.answers && (interviewData.status === 'INTERVIEW_ANSWERED' || interviewData.status === 'PENDING_REVIEW') && (
                <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
                  <h3 className="text-sm font-semibold text-white mb-4">📝 Jawaban Interview</h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-cyan-400 font-medium">Nama:</span>
                      <p className="text-slate-300 mt-1">{interviewData.answers.name || '-'}</p>
                    </div>
                    <div>
                      <span className="text-cyan-400 font-medium">Umur:</span>
                      <p className="text-slate-300 mt-1">{interviewData.answers.age || '-'}</p>
                    </div>
                    <div>
                      <span className="text-cyan-400 font-medium">Alasan ingin bergabung:</span>
                      <p className="text-slate-300 mt-1">{interviewData.answers.reason || '-'}</p>
                    </div>
                    <div>
                      <span className="text-cyan-400 font-medium">Pengalaman Discord:</span>
                      <p className="text-slate-300 mt-1">{interviewData.answers.experience || '-'}</p>
                    </div>
                    <div>
                      <span className="text-cyan-400 font-medium">Ketersediaan:</span>
                      <p className="text-slate-300 mt-1">{interviewData.answers.availability || '-'}</p>
                    </div>
                    <div>
                      <span className="text-cyan-400 font-medium">Harapan:</span>
                      <p className="text-slate-300 mt-1">{interviewData.answers.expectations || '-'}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Staff Action Buttons */}
              {interviewData.isStaff && (interviewData.status === 'INTERVIEW_ANSWERED' || interviewData.status === 'PENDING_REVIEW') && (
                <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
                  <h3 className="text-sm font-semibold text-white mb-4">⚡ Tindakan Staff</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleInterviewAction('approve')}
                      disabled={actionLoading === 'approve'}
                      className="bg-green-500 hover:bg-green-600 disabled:bg-slate-600 text-white font-medium py-2 px-3 rounded-lg text-center transition-all duration-200 text-sm"
                    >
                      {actionLoading === 'approve' ? '⏳' : '✅ Approve'}
                    </button>
                    
                    <button
                      onClick={() => handleInterviewAction('reject')}
                      disabled={actionLoading === 'reject'}
                      className="bg-red-500 hover:bg-red-600 disabled:bg-slate-600 text-white font-medium py-2 px-3 rounded-lg text-center transition-all duration-200 text-sm"
                    >
                      {actionLoading === 'reject' ? '⏳' : '❌ Reject'}
                    </button>
                    
                    <button
                      onClick={() => handleInterviewAction('hold')}
                      disabled={actionLoading === 'hold'}
                      className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-slate-600 text-white font-medium py-2 px-3 rounded-lg text-center transition-all duration-200 text-sm"
                    >
                      {actionLoading === 'hold' ? '⏳' : '⏸️ Hold'}
                    </button>
                  </div>
                  
                  <div className="mt-3 text-xs text-slate-400">
                    <p>• <strong>Approve:</strong> Kasih role & buka Discord invite</p>
                    <p>• <strong>Reject:</strong> Kick dari server</p>
                    <p>• <strong>Hold:</strong> Suruh isi ulang form</p>
                  </div>
                </div>
              )}

              {/* Interview Form or Actions */}
              {interviewData.status === 'INTERVIEW_REQUIRED' && !showForm && (
                <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
                  <h3 className="text-sm font-semibold text-white mb-3">Form Interview</h3>
                  <div className="space-y-3">
                    <button
                      onClick={() => setShowForm(true)}
                      className="block w-full bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-medium py-3 px-4 rounded-xl text-center transition-all duration-200 shadow-[0_0_15px_rgba(34,211,238,0.3)]"
                    >
                      Buka Form Interview
                    </button>
                    
                    <button
                      onClick={() => copyToClipboard(window.location.href)}
                      className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-xl text-center transition-all duration-200 flex items-center justify-center gap-2"
                    >
                      📋 Salin Link Interview
                    </button>
                  </div>
                </div>
              )}

              {/* Interview Form */}
              {showForm && (
                <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/50">
                  <h3 className="text-sm font-semibold text-white mb-4">Form Interview</h3>
                  <form onSubmit={submitInterview} className="space-y-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Nama Lengkap</label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        required
                        className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                        placeholder="Masukkan nama lengkap"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Umur</label>
                      <input
                        type="number"
                        name="age"
                        value={formData.age}
                        onChange={handleInputChange}
                        required
                        min="13"
                        max="100"
                        className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                        placeholder="Masukkan umur"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Alasan ingin bergabung</label>
                      <textarea
                        name="reason"
                        value={formData.reason}
                        onChange={handleInputChange}
                        required
                        rows={3}
                        className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 resize-none"
                        placeholder="Jelaskan mengapa kamu ingin bergabung dengan server ini"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Pengalaman dengan Discord</label>
                      <textarea
                        name="experience"
                        value={formData.experience}
                        onChange={handleInputChange}
                        required
                        rows={2}
                        className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 resize-none"
                        placeholder="Ceritakan pengalaman kamu dengan Discord"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Ketersediaan online</label>
                      <input
                        type="text"
                        name="availability"
                        value={formData.availability}
                        onChange={handleInputChange}
                        required
                        className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                        placeholder="Contoh: Setiap hari jam 19:00 - 22:00"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Harapan setelah bergabung</label>
                      <textarea
                        name="expectations"
                        value={formData.expectations}
                        onChange={handleInputChange}
                        required
                        rows={2}
                        className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 resize-none"
                        placeholder="Apa yang kamu harapkan dari server ini"
                      />
                    </div>
                    
                    <div className="flex gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="flex-1 bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-600 text-slate-950 font-medium py-3 px-4 rounded-xl text-center transition-all duration-200 shadow-[0_0_15px_rgba(34,211,238,0.3)]"
                      >
                        {submitting ? 'Mengirim...' : 'Kirim Jawaban'}
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => setShowForm(false)}
                        className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-4 rounded-xl text-center transition-all duration-200"
                      >
                        Batal
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Discord Invite for Approved Users */}
              {interviewData.status === 'VERIFIED' && (
                <div className="bg-green-500/10 p-4 rounded-xl border border-green-500/20">
                  <h3 className="text-sm font-semibold text-white mb-3">🎉 Selamat! Kamu Terverifikasi</h3>
                  <p className="text-xs text-green-300 mb-4">
                    Kamu telah disetujui dan mendapatkan role. Join Discord server sekarang!
                  </p>
                  <a
                    href="https://discord.gg/gECYdzVz2j"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full bg-green-500 hover:bg-green-600 text-white font-medium py-3 px-4 rounded-xl text-center transition-all duration-200 shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                  >
                    🎮 Join Discord Server
                  </a>
                </div>
              )}

              {/* Hold Status - Re-fill Form */}
              {interviewData.status === 'HOLD' && (
                <div className="bg-yellow-500/10 p-4 rounded-xl border border-yellow-500/20">
                  <h3 className="text-sm font-semibold text-white mb-3">⏸️ Aplikasi Ditahan</h3>
                  <p className="text-xs text-yellow-300 mb-4">
                    Staff meminta kamu untuk mengisi ulang form interview. Silakan perbarui jawaban kamu.
                  </p>
                  <button
                    onClick={() => setShowForm(true)}
                    className="block w-full bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-medium py-3 px-4 rounded-xl text-center transition-all duration-200 shadow-[0_0_15px_rgba(234,179,8,0.3)]"
                  >
                    📝 Isi Ulang Form
                  </button>
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
