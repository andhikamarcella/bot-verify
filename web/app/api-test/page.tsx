"use client";

import { useEffect, useState } from "react";

export default function ApiTestPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [enterpriseToken, setEnterpriseToken] = useState<string>("");
  const [enterpriseBusy, setEnterpriseBusy] = useState(false);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const getApiBaseUrl = () => {
    if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
      return 'https://vfy.up.railway.app';
    }
    return (process.env?.NEXT_PUBLIC_API_BASE_URL || process.env?.NEXT_PUBLIC_API_BASE) || 'http://localhost:3001';
  };

  const testApi = async () => {
    setLoading(true);
    setLogs([]);
    
    const testUrls = [
      `${getApiBaseUrl()}/api/test`,
      `${getApiBaseUrl()}/health`,
      `${getApiBaseUrl()}/api/interview-status?token=test-token`
    ];

    for (const url of testUrls) {
      addLog(`Testing: ${url}`);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        addLog(`✅ Status: ${response.status}`);
        
        const text = await response.text();
        addLog(`Response: ${text.substring(0, 100)}...`);
        
      } catch (error: any) {
        addLog(`❌ Error: ${error.message}`);
      }
      addLog('---');
    }
    
    setLoading(false);
  };

  const ensureEnterpriseReady = async () => {
    const key = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY || '';
    if (!key) {
      addLog('❌ NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY belum diset');
      return { ok: false as const, reason: 'missing-site-key' };
    }

    const grecaptcha = (window as any).grecaptcha;
    if (!grecaptcha?.enterprise) {
      addLog('❌ reCAPTCHA enterprise belum ter-load (cek layout.jsx + env)');
      return { ok: false as const, reason: 'grecaptcha-not-ready' };
    }

    await new Promise<void>((resolve) => grecaptcha.enterprise.ready(() => resolve()));
    return { ok: true as const, siteKey: key };
  };

  const generateEnterpriseToken = async () => {
    if (enterpriseBusy) return;
    setEnterpriseBusy(true);
    try {
      const ready = await ensureEnterpriseReady();
      if (!ready.ok) return;

      const action = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_ACTION || 'LOGIN';
      addLog(`Generating enterprise token (action=${action})...`);
      const grecaptcha = (window as any).grecaptcha;
      const token = await grecaptcha.enterprise.execute(ready.siteKey, { action });
      setEnterpriseToken(token);
      addLog(`✅ Token generated (${String(token || '').length} chars)`);
    } catch (e: any) {
      addLog(`❌ Token generate error: ${e?.message || 'unknown'}`);
    } finally {
      setEnterpriseBusy(false);
    }
  };

  const assessEnterpriseToken = async () => {
    const token = String(enterpriseToken || '').trim();
    if (!token) {
      addLog('❌ Token masih kosong. Generate dulu.');
      return;
    }
    const adminKey = process.env.NEXT_PUBLIC_ADMIN_KEY || '';
    if (!adminKey) {
      addLog('❌ NEXT_PUBLIC_ADMIN_KEY belum diset (dibutuhkan untuk assess endpoint)');
      return;
    }
    const action = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_ACTION || 'LOGIN';
    try {
      addLog('Assessing token ke backend...');
      const res = await fetch(`${getApiBaseUrl()}/api/recaptcha-enterprise/assess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminKey}`,
        },
        body: JSON.stringify({ token, action }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        addLog(`❌ Assess HTTP ${res.status}: ${JSON.stringify(json)}`);
        return;
      }
      addLog(`✅ Assess ok=${json?.ok} score=${json?.score ?? 'n/a'} reason=${json?.reason ?? '-'}`);
    } catch (e: any) {
      addLog(`❌ Assess error: ${e?.message || 'unknown'}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">API Connection Test</h1>
        
        <button
          onClick={testApi}
          disabled={loading}
          className="bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-600 text-white px-4 py-2 rounded mb-4"
        >
          {loading ? 'Testing...' : 'Test API Connection'}
        </button>

        <div className="bg-slate-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
          {logs.length === 0 ? (
            <div className="text-slate-400">Click "Test API Connection" to start...</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className={log.includes('❌') ? 'text-red-400' : log.includes('✅') ? 'text-green-400' : 'text-slate-300'}>
                {log}
              </div>
            ))
          )}
        </div>

        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="text-lg font-semibold mb-2">reCAPTCHA Enterprise Test</div>
          <div className="flex flex-wrap gap-2 mb-3">
            <button
              onClick={generateEnterpriseToken}
              disabled={enterpriseBusy}
              className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-600 text-white px-4 py-2 rounded"
            >
              {enterpriseBusy ? 'Working...' : 'Generate Token'}
            </button>
            <button
              onClick={assessEnterpriseToken}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded"
            >
              Assess Token (Backend)
            </button>
          </div>
          <div className="text-xs text-slate-400 mb-2">
            Pastikan env: NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY, NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_ACTION, dan NEXT_PUBLIC_ADMIN_KEY.
          </div>
          <textarea
            value={enterpriseToken}
            onChange={(e) => setEnterpriseToken(e.target.value)}
            placeholder="Token akan muncul di sini..."
            className="w-full h-28 rounded bg-slate-950 border border-slate-800 p-3 text-xs text-slate-200"
          />
        </div>

        <div className="mt-4 text-sm text-slate-400">
          <p>API Base URL: {(() => {
            if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
              return 'https://vfy.up.railway.app (Production)';
            }
            return (
              (typeof process !== 'undefined' && (process.env?.NEXT_PUBLIC_API_BASE_URL || process.env?.NEXT_PUBLIC_API_BASE)) ||
              'http://localhost:3001 (Development)'
            );
          })()}</p>
          <p>This page helps debug API connection issues.</p>
        </div>
      </div>
    </div>
  );
}
