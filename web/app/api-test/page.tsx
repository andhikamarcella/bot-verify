"use client";

import { useEffect, useState } from "react";

export default function ApiTestPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const testApi = async () => {
    setLoading(true);
    setLogs([]);
    
    const getApiBaseUrl = () => {
      // Check if we're in production (Vercel)
      if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
        return 'https://vfy.up.railway.app'; // Railway API server
      }
      // Fallback to environment variable or localhost
      return (process.env?.NEXT_PUBLIC_API_BASE) || 'http://localhost:3001';
    };
    
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

        <div className="mt-4 text-sm text-slate-400">
          <p>API Base URL: {(() => {
            if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
              return 'https://vfy.up.railway.app (Production)';
            }
            return (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_BASE) || 'http://localhost:3001 (Development)';
          })()}</p>
          <p>This page helps debug API connection issues.</p>
        </div>
      </div>
    </div>
  );
}
