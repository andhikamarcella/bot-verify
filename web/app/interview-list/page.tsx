"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Simple XOR encryption for client-side
const XOR_KEY = "vfy2024secure";

const encrypt = (text: string): string => {
  return btoa(text.split('').map(char => 
    String.fromCharCode(char.charCodeAt(0) ^ XOR_KEY.charCodeAt(0))
  ).join(''));
};

const decrypt = (encryptedText: string): string => {
  try {
    return atob(encryptedText).split('').map(char => 
      String.fromCharCode(char.charCodeAt(0) ^ XOR_KEY.charCodeAt(0))
    ).join('');
  } catch {
    return '';
  }
};

interface InterviewData {
  token: string;
  userId: string;
  guildName: string;
  guildIcon?: string;
  status: string;
  answers: {
    name?: string;
    age?: string;
    reason?: string;
    experience?: string;
    availability?: string;
    expectations?: string;
  };
  interviewSubmittedAt?: string;
  reviewedAt?: string;
}

export default function InterviewDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Check if already authenticated
  useEffect(() => {
    const auth = localStorage.getItem('interview_auth');
    if (auth) {
      const decrypted = decrypt(auth);
      if (decrypted === 'dikalfe0032:true') {
        setIsAuthenticated(true);
      } else {
        localStorage.removeItem('interview_auth');
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Simple validation with encrypted credentials
    const validUsername = "dikalfe0032";
    const validPassword = "and30000";

    if (username === validUsername && password === validPassword) {
      // Store encrypted auth
      const encryptedAuth = encrypt(`${username}:true`);
      localStorage.setItem('interview_auth', encryptedAuth);
      setIsAuthenticated(true);
    } else {
      setError("Username atau password salah!");
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('interview_auth');
    setIsAuthenticated(false);
    setUsername("");
    setPassword("");
  };

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-[#050505] text-slate-200 font-sans flex items-center justify-center p-4">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-[-10%] right-[20%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 w-full max-w-md">
          <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#5865F2] to-[#4752C4] flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Admin Login</h1>
              <p className="text-slate-400 text-sm">Interview Dashboard</p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-transparent transition-all duration-200"
                  placeholder="Masukkan username"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-transparent transition-all duration-200"
                  placeholder="Masukkan password"
                  required
                />
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-600 text-slate-950 font-medium py-3 px-4 rounded-xl text-center transition-all duration-200 shadow-[0_0_15px_rgba(34,211,238,0.3)] disabled:shadow-none"
              >
                {loading ? '⏳ Login...' : '🔐 Login'}
              </button>
            </form>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-slate-700/50 text-center">
              <p className="text-xs text-slate-500">
                Halaman ini dilindungi. Akses tidak sah akan dicatat.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // Dashboard content
  return <InterviewDashboardContent onLogout={handleLogout} />;
}

function InterviewDashboardContent({ onLogout }: { onLogout: () => void }) {
  const [interviews, setInterviews] = useState<InterviewData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedInterview, setSelectedInterview] = useState<InterviewData | null>(null);

  useEffect(() => {
    fetchAllInterviews();
  }, []);

  const fetchAllInterviews = async () => {
    try {
      const getApiBaseUrl = () => {
        if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
          return 'https://vfy.up.railway.app';
        }
        return (typeof window !== 'undefined' && (window as any).process?.env?.NEXT_PUBLIC_API_BASE) || 'http://localhost:3001';
      };

      const response = await fetch(`${getApiBaseUrl()}/api/interviews-all`);
      if (response.ok) {
        const data = await response.json();
        setInterviews(data);
      }
    } catch (error) {
      console.error('[Dashboard] Error fetching interviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInterviewAction = async (token: string, action: 'approve' | 'reject' | 'hold') => {
    setActionLoading(`${token}-${action}`);
    
    try {
      const getApiBaseUrl = () => {
        if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
          return 'https://vfy.up.railway.app';
        }
        return (typeof window !== 'undefined' && (window as any).process?.env?.NEXT_PUBLIC_API_BASE) || 'http://localhost:3001';
      };
      
      const response = await fetch(`${getApiBaseUrl()}/api/interview-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action }),
      });
      
      if (response.ok) {
        fetchAllInterviews();
        setSelectedInterview(null);
      }
    } catch (error) {
      console.error('[Dashboard] Action error:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'INTERVIEW_REQUIRED': return 'text-yellow-400';
      case 'INTERVIEW_ANSWERED': return 'text-blue-400';
      case 'PENDING_REVIEW': return 'text-orange-400';
      case 'VERIFIED': return 'text-green-400';
      case 'REJECTED': return 'text-red-400';
      case 'HOLD': return 'text-yellow-400';
      default: return 'text-slate-400';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'INTERVIEW_REQUIRED': return 'bg-yellow-500/10 border-yellow-500/20';
      case 'INTERVIEW_ANSWERED': return 'bg-blue-500/10 border-blue-500/20';
      case 'PENDING_REVIEW': return 'bg-orange-500/10 border-orange-500/20';
      case 'VERIFIED': return 'bg-green-500/10 border-green-500/20';
      case 'REJECTED': return 'bg-red-500/10 border-red-500/20';
      case 'HOLD': return 'bg-yellow-500/10 border-yellow-500/20';
      default: return 'bg-slate-500/10 border-slate-500/20';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 bg-slate-800 rounded-full"></div>
          <div className="h-4 w-32 bg-slate-800 rounded"></div>
          <div className="text-slate-400 text-sm">Memuat data interview...</div>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#050505] text-slate-200 font-sans p-4">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[20%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">📋 Interview Dashboard</h1>
          <p className="text-slate-400">Review dan manage semua aplikasi interview</p>
        </div>

        <div className="grid gap-4">
          {interviews.length === 0 ? (
            <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 text-center">
              <div className="text-slate-400 text-lg">Belum ada aplikasi interview</div>
            </div>
          ) : (
            interviews.map((interview) => (
              <div
                key={interview.token}
                className={`bg-slate-900/80 backdrop-blur-xl border rounded-2xl p-6 cursor-pointer transition-all duration-200 hover:border-cyan-500/50 ${getStatusBg(interview.status)}`}
                onClick={() => setSelectedInterview(interview)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    {interview.guildIcon ? (
                      <img src={interview.guildIcon} alt="Guild" className="w-12 h-12 rounded-xl border border-slate-600" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#5865F2] to-[#4752C4] flex items-center justify-center">
                        <span className="text-white font-bold">{interview.guildName?.charAt(0) || 'D'}</span>
                      </div>
                    )}
                    <div>
                      <h3 className="text-lg font-semibold text-white">{interview.answers.name || 'Unknown'}</h3>
                      <p className="text-sm text-slate-400">{interview.guildName}</p>
                      <p className="text-xs text-slate-500 mt-1">Token: {interview.token}</p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <span className={`text-sm font-medium ${getStatusColor(interview.status)}`}>
                      {interview.status.replace('_', ' ')}
                    </span>
                    {interview.interviewSubmittedAt && (
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(interview.interviewSubmittedAt).toLocaleDateString('id-ID')}
                      </p>
                    )}
                  </div>
                </div>

                {interview.answers && (
                  <div className="mt-4 pt-4 border-t border-slate-700/50">
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInterviewAction(interview.token, 'approve');
                        }}
                        disabled={actionLoading === `${interview.token}-approve`}
                        className="bg-green-500 hover:bg-green-600 disabled:bg-slate-600 text-white font-medium py-2 px-3 rounded-lg text-center transition-all duration-200 text-sm"
                      >
                        {actionLoading === `${interview.token}-approve` ? '⏳' : '✅ Approve'}
                      </button>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInterviewAction(interview.token, 'reject');
                        }}
                        disabled={actionLoading === `${interview.token}-reject`}
                        className="bg-red-500 hover:bg-red-600 disabled:bg-slate-600 text-white font-medium py-2 px-3 rounded-lg text-center transition-all duration-200 text-sm"
                      >
                        {actionLoading === `${interview.token}-reject` ? '⏳' : '❌ Reject'}
                      </button>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInterviewAction(interview.token, 'hold');
                        }}
                        disabled={actionLoading === `${interview.token}-hold`}
                        className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-slate-600 text-white font-medium py-2 px-3 rounded-lg text-center transition-all duration-200 text-sm"
                      >
                        {actionLoading === `${interview.token}-hold` ? '⏳' : '⏸️ Hold'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {selectedInterview && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-white">Detail Interview</h2>
              <button
                onClick={() => setSelectedInterview(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-cyan-400 mb-2">👤 Informasi User</h3>
                <div className="bg-slate-800/50 rounded-lg p-3 space-y-2 text-sm">
                  <p><span className="text-slate-400">Nama:</span> {selectedInterview.answers.name || '-'}</p>
                  <p><span className="text-slate-400">Umur:</span> {selectedInterview.answers.age || '-'}</p>
                  <p><span className="text-slate-400">Server:</span> {selectedInterview.guildName}</p>
                  <p><span className="text-slate-400">Status:</span> <span className={getStatusColor(selectedInterview.status)}>{selectedInterview.status}</span></p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-cyan-400 mb-2">📝 Jawaban Interview</h3>
                <div className="bg-slate-800/50 rounded-lg p-3 space-y-3 text-sm">
                  <div>
                    <span className="text-slate-400">Alasan bergabung:</span>
                    <p className="text-slate-300 mt-1">{selectedInterview.answers.reason || '-'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Pengalaman Discord:</span>
                    <p className="text-slate-300 mt-1">{selectedInterview.answers.experience || '-'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Ketersediaan:</span>
                    <p className="text-slate-300 mt-1">{selectedInterview.answers.availability || '-'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Harapan:</span>
                    <p className="text-slate-300 mt-1">{selectedInterview.answers.expectations || '-'}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-4">
                <button
                  onClick={() => handleInterviewAction(selectedInterview.token, 'approve')}
                  disabled={actionLoading === `${selectedInterview.token}-approve`}
                  className="bg-green-500 hover:bg-green-600 disabled:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg text-center transition-all duration-200"
                >
                  {actionLoading === `${selectedInterview.token}-approve` ? '⏳ Processing...' : '✅ Approve'}
                </button>
                
                <button
                  onClick={() => handleInterviewAction(selectedInterview.token, 'reject')}
                  disabled={actionLoading === `${selectedInterview.token}-reject`}
                  className="bg-red-500 hover:bg-red-600 disabled:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg text-center transition-all duration-200"
                >
                  {actionLoading === `${selectedInterview.token}-reject` ? '⏳ Processing...' : '❌ Reject'}
                </button>
                
                <button
                  onClick={() => handleInterviewAction(selectedInterview.token, 'hold')}
                  disabled={actionLoading === `${selectedInterview.token}-hold`}
                  className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-slate-600 text-white font-medium py-3 px-4 rounded-lg text-center transition-all duration-200"
                >
                  {actionLoading === `${selectedInterview.token}-hold` ? '⏳ Processing...' : '⏸️ Hold'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
