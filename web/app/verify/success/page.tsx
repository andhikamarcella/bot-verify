'use client';
// @ts-nocheck
import { useEffect, useState } from 'react';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import Layout from '../../../components/Layout';
import { VerificationQr } from '../../../lib/QrCode';
import { apiFetch } from '../../../lib/api';

export default function SuccessPage() {
  const [browserUrl, setBrowserUrl] = useState('');

  useEffect(() => {
    apiFetch('/api/guild-info')
      .then((res) => {
        if (res?.browserUrl) {
          setBrowserUrl(res.browserUrl);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <Layout headline="Verifikasi Berhasil ✅" description="Role Member akan segera muncul di profil kamu.">
      <Card className="flex flex-col items-center gap-6 text-center">
        <p className="text-lg text-white/70">Welcome ✨ Kamu resmi jadi bagian komunitas.</p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Button as="a" href="discord://" className="w-full sm:w-auto">
            Open in Discord App
          </Button>
          {browserUrl && (
            <Button as="a" href={browserUrl} target="_blank" rel="noreferrer" className="w-full sm:w-auto">
              Open Discord in Browser
            </Button>
          )}
        </div>
        <VerificationQr value={browserUrl} />
        <p className="text-sm text-white/50">
          Kalau role belum muncul, tunggu beberapa detik lalu buka ulang Discord.
        </p>
      </Card>
    </Layout>
  );
}
