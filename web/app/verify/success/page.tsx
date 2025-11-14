"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";
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

  const outerStyle: CSSProperties = useMemo(
    () => ({
      minHeight: "100vh",
      background:
        "radial-gradient(circle at top, rgba(34,197,94,0.22), rgba(2,6,23,0.96) 58%), #020617",
      color: "#ffffff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
      textAlign: "center",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Inter", "Roboto", "Segoe UI", sans-serif',
    }),
    []
  );

  const highlightColor = "#38bdf8";

  const cardStyle: CSSProperties = {
    width: "100%",
    maxWidth: "460px",
    background: "linear-gradient(160deg, rgba(30,64,175,0.9), rgba(15,23,42,0.92))",
    borderRadius: "22px",
    border: "1px solid rgba(148,163,184,0.3)",
    boxShadow: "0 50px 90px rgba(15,23,42,0.65)",
    padding: "32px 26px",
    display: "flex",
    flexDirection: "column",
    gap: "20px",
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

  const baseButton: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    borderRadius: "12px",
    padding: "12px 0",
    fontWeight: 600,
    fontSize: "0.9rem",
    textDecoration: "none",
    color: "#050505",
    transition: "transform 0.18s ease, box-shadow 0.18s ease",
  };

  const buttonPrimary: CSSProperties = {
    ...baseButton,
    background: "linear-gradient(135deg, #38bdf8, #22d3ee)",
    boxShadow: "0 14px 32px rgba(34,211,238,0.35)",
  };

  const buttonBrowser: CSSProperties = {
    ...baseButton,
    background: "linear-gradient(135deg, #4ade80, #22c55e)",
    color: "#052e16",
    boxShadow: "0 14px 32px rgba(34,197,94,0.3)",
  };

  const buttonDesktop: CSSProperties = {
    ...baseButton,
    background: "linear-gradient(135deg, #a855f7, #7c3aed)",
    color: "#f8fafc",
    boxShadow: "0 14px 32px rgba(168,85,247,0.3)",
  };

  const buttonAndroid: CSSProperties = {
    ...baseButton,
    background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
    color: "#2d1601",
    boxShadow: "0 14px 32px rgba(251,191,36,0.35)",
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
          Selamat! Kamu sudah diverifikasi di {guildName}. Role Member akan muncul dalam beberapa detik. Pilih cara membuka Discord di bawah ini.
        </p>

        <div style={{ display: "grid", gap: "12px" }}>
          <a href="discord://" style={buttonPrimary}>
            Buka Discord (Mobile / Desktop App)
          </a>

          {browserUrl ? (
            <a href={browserUrl} style={buttonBrowser} target="_blank" rel="noopener noreferrer">
              Buka Server di Browser
            </a>
          ) : null}

          <a href="https://discord.com/app" style={buttonDesktop} target="_blank" rel="noopener noreferrer">
            Buka Discord Desktop
          </a>

          <a
            href="intent://discord#Intent;package=com.discord;scheme=discord;end"
            style={buttonAndroid}
          >
            Buka Discord Android
          </a>
        </div>

        <QrCodeBlock value={browserUrl ?? "https://discord.com/app"} />

        <div style={{ ...infoStyle, color: highlightColor }}>
          Gunakan QR code untuk membuka server di perangkat lain. Scan dari kamera HP untuk akses cepat.
        </div>

        <div style={infoStyle}>
          Jika role belum terlihat, coba tutup dan buka kembali Discord atau refresh aplikasimu.
        </div>
      </div>
    </main>
  );
}
