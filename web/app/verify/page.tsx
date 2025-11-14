"use client";

import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";

interface VerifyResponse {
  ok?: boolean;
  badgeEmoji?: string;
  mobileDeepLink?: string;
}

interface GuildInfoResponse {
  guildName?: string;
  guildIconUrl?: string;
}

const gradientBackground =
  "radial-gradient(circle at top, rgba(34,211,238,0.35), rgba(10,10,10,0.92) 55%), #050505";

export default function VerifyPage() {
  const [token, setToken] = useState<string | null>(null);
  const [guildName, setGuildName] = useState<string>("Server");
  const [guildIcon, setGuildIcon] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    setToken(t || null);
    setLoading(false);

    const base = process.env.NEXT_PUBLIC_API_BASE_URL || "";
    const endpoint = base ? `${base}/api/guild-info` : "/api/guild-info";

    fetch(endpoint)
      .then((r) => r.json() as Promise<GuildInfoResponse>)
      .then((data) => {
        if (data.guildName) {
          setGuildName(data.guildName);
        }
        if (data.guildIconUrl) {
          setGuildIcon(data.guildIconUrl);
        }
      })
      .catch(() => {
        // ignore fetch errors, fallback copy still works
      });
  }, []);

  async function handleVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) {
      return;
    }

    setStatusMsg("🔄 Memverifikasi token kamu...");

    const body = {
      token,
      captchaResult: { type: "fallbackEmoji", value: "ok" },
      ip: "0.0.0.0",
    };

    try {
      const res = await fetch((process.env.NEXT_PUBLIC_API_BASE_URL || "") + "/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: VerifyResponse = await res.json();

      if (data.ok) {
        setStatusMsg(`✅ Verifikasi berhasil! Kamu sekarang Verified di ${guildName}.`);
      } else {
        setStatusMsg("❌ Verifikasi gagal (token invalid / kadaluarsa).");
      }
    } catch (error) {
      console.error(error);
      setStatusMsg("❌ Gagal menghubungi server verifikasi. Coba lagi beberapa saat.");
    }
  }

  const outerStyle = useMemo<CSSProperties>(() => ({
    minHeight: "100vh",
    background: gradientBackground,
    color: "#f8fafc",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px 20px",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Roboto", "Segoe UI", sans-serif',
  }), []);

  const cardStyle: CSSProperties = {
    width: "100%",
    maxWidth: "480px",
    background: "linear-gradient(160deg, rgba(30,41,59,0.95), rgba(15,23,42,0.9))",
    borderRadius: "20px",
    border: "1px solid rgba(148,163,184,0.25)",
    boxShadow: "0 40px 80px rgba(15,23,42,0.55)",
    padding: "30px",
    backdropFilter: "blur(12px)",
    display: "flex",
    flexDirection: "column",
    gap: "22px",
  };

  const headerStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "14px",
  };

  const iconStyle: CSSProperties = {
    width: "58px",
    height: "58px",
    borderRadius: "16px",
    border: "1px solid rgba(148,163,184,0.35)",
    objectFit: "cover",
    backgroundColor: "rgba(15,23,42,0.6)",
  };

  const titleStyle: CSSProperties = {
    fontSize: "1.45rem",
    fontWeight: 700,
    letterSpacing: "0.01em",
  };

  const subtitleStyle: CSSProperties = {
    fontSize: "0.9rem",
    color: "#cbd5f5",
    lineHeight: 1.6,
  };

  const tokenBoxStyle: CSSProperties = {
    background: "rgba(15,23,42,0.85)",
    borderRadius: "14px",
    padding: "14px",
    fontSize: "0.75rem",
    color: "#e2e8f0",
    border: "1px solid rgba(94,234,212,0.2)",
    wordBreak: "break-all",
  };

  const buttonStyle: CSSProperties = {
    width: "100%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "12px",
    padding: "12px 0",
    border: "none",
    background: "linear-gradient(135deg, #22d3ee, #38bdf8)",
    color: "#020617",
    fontWeight: 700,
    fontSize: "0.95rem",
    cursor: "pointer",
    transition: "transform 0.18s ease, box-shadow 0.18s ease",
    boxShadow: "0 18px 35px rgba(34,211,238,0.35)",
  };

  const secondarySectionStyle: CSSProperties = {
    display: "grid",
    gap: "10px",
    fontSize: "0.85rem",
    color: "#94a3b8",
  };

  const statusStyle: CSSProperties = {
    textAlign: "center",
    fontSize: "0.85rem",
    color: "#e2e8f0",
    whiteSpace: "pre-line",
  };

  const stepListStyle: CSSProperties = {
    display: "grid",
    gap: "12px",
  };

  const stepItemStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    background: "rgba(148,163,184,0.08)",
    borderRadius: "12px",
    padding: "10px 12px",
    color: "#cbd5f5",
    fontSize: "0.8rem",
  };

  return (
    <main style={outerStyle}>
      <div style={cardStyle}>
        <header style={headerStyle}>
          {guildIcon ? <img src={guildIcon} alt="Guild icon" style={iconStyle} /> : null}
          <div>
            <h1 style={titleStyle}>🛡️ {guildName} Verification</h1>
            <p style={subtitleStyle}>Selesaikan langkah singkat ini untuk mendapatkan akses Member.</p>
          </div>
        </header>

        {loading ? (
          <div style={{ color: "#cbd5f5", fontSize: "0.85rem" }}>Memuat data token...</div>
        ) : !token ? (
          <div style={{ color: "#f87171", fontSize: "0.9rem" }}>
            Token tidak ditemukan atau sudah kadaluarsa. Silakan minta token baru melalui bot Discord.
          </div>
        ) : (
          <>
            <section style={stepListStyle}>
              <div style={stepItemStyle}>
                <span>1️⃣</span>
                <span>Masuk ke DM kamu dan klik tombol link verifikasi.</span>
              </div>
              <div style={stepItemStyle}>
                <span>2️⃣</span>
                <span>Selesaikan captcha dan konfirmasi akun Discord kamu.</span>
              </div>
              <div style={stepItemStyle}>
                <span>3️⃣</span>
                <span>Refresh Discord — role Member akan otomatis diberikan.</span>
              </div>
            </section>

            <section style={secondarySectionStyle}>
              <div style={{ fontSize: "0.8rem" }}>Token verifikasi aktif:</div>
              <div style={tokenBoxStyle}>{token}</div>
            </section>

            <form onSubmit={handleVerify}>
              <button type="submit" style={buttonStyle}>
                Mulai Verifikasi Sekarang
              </button>
            </form>
          </>
        )}

        {statusMsg ? <div style={statusStyle}>{statusMsg}</div> : null}

        <div style={secondarySectionStyle}>
          <span>
            Butuh bantuan? Gunakan perintah <code style={{ background: "rgba(15,23,42,0.6)", padding: "2px 6px", borderRadius: "6px" }}>/help</code> di server atau hubungi staff.
          </span>
          <span>Pastikan DM dari bot tidak diblokir supaya link bisa diterima.</span>
        </div>
      </div>
    </main>
  );
}
