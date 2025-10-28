"use client";

import { CSSProperties, useEffect, useState } from "react";
import { QrCodeBlock } from "../../../components/QrCodeBlock";

interface GuildInfoResponse {
  guildName?: string;
  browserUrl?: string;
}

export default function VerifySuccessPage() {
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [guildName, setGuildName] = useState<string>("Server");

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || "";
    const endpoint = base ? `${base}/api/guild-info` : "/api/guild-info";

    fetch(endpoint)
      .then((response) => response.json() as Promise<GuildInfoResponse>)
      .then((data) => {
        if (data.guildName) {
          setGuildName(data.guildName);
        }
        if (data.browserUrl) {
          setBrowserUrl(data.browserUrl);
        }
      })
      .catch(() => {
        // ignore network errors for the success screen
      });
  }, []);

  const outerStyle: CSSProperties = {
    minHeight: "100vh",
    backgroundColor: "#0a0a0a",
    color: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    textAlign: "center",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Inter", "Roboto", "Segoe UI", sans-serif',
  };

  const cardStyle: CSSProperties = {
    width: "100%",
    maxWidth: "420px",
    backgroundColor: "rgba(38,38,38,0.7)",
    borderRadius: "16px",
    border: "1px solid #3f3f46",
    boxShadow: "0 30px 60px rgba(0,0,0,0.75)",
    padding: "28px 24px",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  };

  const titleStyle: CSSProperties = {
    fontSize: "1.5rem",
    fontWeight: 700,
  };

  const subtitleStyle: CSSProperties = {
    fontSize: "0.9rem",
    color: "#cbd5f5",
    lineHeight: 1.6,
  };

  const buttonStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    borderRadius: "10px",
    padding: "12px 0",
    fontWeight: 600,
    fontSize: "0.9rem",
    textDecoration: "none",
    color: "#050505",
    background: "linear-gradient(135deg, #38bdf8, #22d3ee)",
    boxShadow: "0 12px 30px rgba(34,211,238,0.35)",
  };

  const secondaryButtonStyle: CSSProperties = {
    ...buttonStyle,
    background: "linear-gradient(135deg, #34d399, #10b981)",
    color: "#0a0a0a",
  };

  const infoStyle: CSSProperties = {
    fontSize: "0.8rem",
    color: "#a1a1aa",
  };

  return (
    <main style={outerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>✅ Verifikasi Berhasil</h1>
        <p style={subtitleStyle}>
          Selamat! Kamu sudah diverifikasi di {guildName}. Role Member akan muncul dalam beberapa detik.
        </p>

        <a href="discord://" style={buttonStyle}>
          Buka Discord App
        </a>

        {browserUrl ? (
          <a
            href={browserUrl}
            style={secondaryButtonStyle}
            target="_blank"
            rel="noopener noreferrer"
          >
            Buka Server di Browser
          </a>
        ) : (
          <div style={infoStyle}>
            Kamu bisa kembali ke Discord sekarang. Jika link browser tidak muncul, hubungi admin server.
          </div>
        )}

        <QrCodeBlock value={browserUrl ?? ""} />

        <div style={infoStyle}>
          Jika role belum terlihat, coba tutup dan buka kembali Discord atau refresh aplikasimu.
        </div>
      </div>
    </main>
  );
}
