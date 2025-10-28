'use client';

import Layout from '../../../components/Layout';
import Card from '../../../components/Card';
import Button from '../../../components/Button';

const browserLink = process.env.NEXT_PUBLIC_DISCORD_BROWSER_URL || 'https://discord.com/channels/@me';

export default function VerifySuccessPage() {
  return (
    <Layout title="Verifikasi Berhasil ✅" subtitle="Role Member sudah diberikan. Welcome ✨">
      <Card className="space-y-6">
        <div className="space-y-3 text-left">
          <p className="text-lg font-semibold text-white">Selamat datang di komunitas! 🎉</p>
          <p className="text-sm text-slate-300">
            Kamu sekarang resmi menjadi bagian dari server. Kalau role belum muncul, tunggu beberapa detik lalu buka lagi Discord.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Button href="discord://" variant="primary">
            Open in Discord App
          </Button>
          <Button href={browserLink} variant="success" target="_blank" rel="noreferrer">
            Open Discord in Browser
          </Button>
        </div>

        <div className="flex flex-col items-center gap-2 text-sm text-slate-400">
          <p>Butuh undangan lagi? Klik tombol di bawah ini.</p>
          <Button
            href={browserLink}
            variant="outline"
            className="w-full sm:w-auto"
            target="_blank"
            rel="noreferrer"
          >
            Join Server
          </Button>
        </div>

        <p className="text-xs text-slate-500 text-center">
          Tips: Kalau role belum juga muncul, coba restart aplikasi Discord atau re-login.
        </p>
      </Card>
    </Layout>
  );
}
