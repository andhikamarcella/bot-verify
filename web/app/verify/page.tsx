"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

interface VerifyResponse {
  ok?: boolean;
  badgeEmoji?: string;
  mobileDeepLink?: string;
}

interface GuildInfoResponse {
  guildName?: string;
}

export default function VerifyPage(): JSX.Element {
  const [token, setToken] = useState<string | null>(null);
  const [guildName, setGuildName] = useState<string>("Server");
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    setToken(t || null);
    setLoading(false);

    if (process.env.NEXT_PUBLIC_API_BASE_URL) {
      fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/guild-info`)
        .then((r) => r.json())
        .then((data: GuildInfoResponse) => {
          if (data && data.guildName) {
            setGuildName(data.guildName);
          }
        })
        .catch(() => {
          /* noop */
        });
    }
  }, []);

  async function handleVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;

    setStatusMsg("Memverifikasi...");

    const body = {
      token,
      captchaResult: { type: "fallbackEmoji", value: "ok" },
      ip: "0.0.0.0",
    };

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL ?? ""}/api/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      const data: VerifyResponse = await res.json();

      if (data.ok) {
        setStatusMsg(`✅ Verifikasi berhasil! Kamu sekarang Verified di ${guildName}.`);
      } else {
        setStatusMsg("❌ Verifikasi gagal (token invalid / kadaluarsa).");
      }
    } catch (err) {
      console.error(err);
      setStatusMsg("❌ Gagal menghubungi server verifikasi.");
    }
  }

  const outerStyle: CSSProperties = {
    minHeight: "100vh",
    backgroundColor: "#0a0a0a",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Inter", "Roboto", "Segoe UI", sans-serif',
  };

  const cardStyle: CSSProperties = {
    width: "100%",
    maxWidth: "380px",
    backgroundColor: "rgba(38,38,38,0.7)",
    borderRadius: "12px",
    border: "1px solid #3f3f3f",
    boxShadow: "0 30px 60px rgba(0,0,0,0.8)",
    padding: "20px",
  };

  const tokenBoxStyle: CSSProperties = {
    backgroundColor: "rgba(10,10,10,0.6)",
    borderRadius: "8px",
    padding: "12px",
    fontSize: "10px",
    color: "#aaa",
    wordBreak: "break-all",
    marginTop: "8px",
    marginBottom: "12px",
  };

  const btnStyle: CSSProperties = {
    width: "100%",
    borderRadius: "8px",
    backgroundColor: "#10b981",
    color: "#000",
    fontWeight: 600,
    fontSize: "0.8rem",
    padding: "10px 0",
    cursor: "pointer",
    border: "none",
    marginBottom: "8px",
  };

  const footerStyle: CSSProperties = {
    fontSize: "10px",
    color: "#666",
    textAlign: "center",
    marginTop: "12px",
  };

  return (
    <main style={outerStyle}>
      <div style={cardStyle}>
        <div style={{ marginBottom: "12px" }}>
          <div
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span role="img" aria-label="shield">
              🛡️
            </span>
            <span>{guildName} Verification</span>
          </div>

          <div
            style={{
              fontSize: "11px",
              color: "#999",
              lineHeight: "16px",
            }}
          >
            Klik tombol di bawah untuk menyelesaikan verifikasi akun Discord kamu.
          </div>
        </div>

        {loading ? (
          <div style={{ fontSize: "12px", color: "#bbb" }}>Loading...</div>
        ) : !token ? (
          <div style={{ fontSize: "12px", color: "#f87171" }}>
            Token tidak ditemukan atau sudah kadaluarsa.
          </div>
        ) : (
          <>
            <div style={{ fontSize: "11px", color: "#bbb" }}>
              Token verifikasi kamu:
            </div>
            <div style={tokenBoxStyle}>{token}</div>

            <form onSubmit={handleVerify}>
              <button type="submit" style={btnStyle}>
                Lanjutkan Verifikasi
              </button>
            </form>
          </>
        )}

        {statusMsg ? (
          <div
            style={{
              textAlign: "center",
              fontSize: "12px",
              color: "#ddd",
              marginTop: "8px",
              whiteSpace: "pre-line",
            }}
          >
            {statusMsg}
          </div>
        ) : null}

        <div style={footerStyle}>
          Jika tombol tidak bekerja, hubungi admin server.
        </div>
      </div>
    </main>
  );
}
