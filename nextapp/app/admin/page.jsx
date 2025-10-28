import Layout from '../../components/Layout';
import Card from '../../components/Card';

const apiBase = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL;

async function fetchVerified(key) {
  if (!key || !apiBase) {
    return { status: key ? 'misconfigured' : 'missing-key', entries: [] };
  }

  try {
    const response = await fetch(`${apiBase}/api/admin/list?key=${encodeURIComponent(key)}`, {
      cache: 'no-store',
    });

    if (response.status === 403) {
      return { status: 'unauthorized', entries: [] };
    }

    if (!response.ok) {
      return { status: 'error', entries: [] };
    }

    const data = await response.json();
    return { status: 'ok', entries: data.data || [] };
  } catch (error) {
    console.error('Gagal mengambil data admin:', error);
    return { status: 'error', entries: [] };
  }
}

export default async function AdminPage({ searchParams }) {
  const key = searchParams?.key || '';
  const { status, entries } = await fetchVerified(key);

  let title = 'Dashboard Admin';
  let subtitle = 'Lihat siapa saja yang sudah menyelesaikan verifikasi.';

  if (!key) {
    title = 'Admin Key Diperlukan';
    subtitle = 'Tambahkan ?key=ADMIN_KEY pada URL untuk mengakses halaman ini.';
  } else if (status === 'unauthorized') {
    title = 'Tidak Diizinkan';
    subtitle = 'Kunci admin yang diberikan tidak valid.';
  } else if (status === 'misconfigured') {
    title = 'Konfigurasi Backend Belum Lengkap';
    subtitle = 'Pastikan API_BASE_URL tersedia di environment Next.js.';
  } else if (status === 'error') {
    title = 'Gagal Memuat Data';
    subtitle = 'Terjadi kesalahan saat menghubungi API backend.';
  }

  return (
    <Layout title={title} subtitle={subtitle}>
      <Card className="space-y-6 text-left">
        {status === 'ok' ? (
          entries.length > 0 ? (
            <div className="space-y-3">
              <div className="table-header">Terverifikasi</div>
              <div className="flex flex-col gap-3">
                {entries.map((entry) => (
                  <div key={`${entry.discordUserId}-${entry.verifiedAt}`} className="table-row">
                    <div className="font-semibold text-white">{entry.username || entry.discordUserId}</div>
                    <div className="text-xs text-slate-400">{entry.discordUserId}</div>
                    <div className="text-sm text-slate-300">
                      {new Date(entry.verifiedAt).toLocaleString('id-ID', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-300">
              Belum ada member yang diverifikasi. Proses pertama akan muncul di sini secara otomatis.
            </p>
          )
        ) : null}

        {status !== 'ok' ? (
          <p className="text-sm text-red-300">
            {status === 'missing-key'
              ? 'Tambahkan ?key=ADMIN_KEY pada URL (contoh: /admin?key=super-secret).'
              : status === 'unauthorized'
              ? 'Kunci admin salah. Pastikan sama dengan ADMIN_KEY di backend.'
              : status === 'misconfigured'
              ? 'ENV API_BASE_URL tidak ditemukan. Periksa konfigurasi Next.js.'
              : 'Tidak dapat mengambil data admin saat ini.'}
          </p>
        ) : null}
      </Card>
    </Layout>
  );
}
