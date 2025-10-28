/**
 * Cara menjalankan proyek ini secara lokal:
 * 1. Jalankan `npm install` di direktori root untuk memasang dependensi bot + API.
 * 2. Masuk ke folder Next.js (`cd nextapp`) lalu jalankan `npm install` untuk dependensi frontend.
 * 3. Buat file .env berdasarkan .env.example dan isi seluruh variabel yang diperlukan.
 * 4. Daftarkan perintah slash satu kali dengan `node server/registerCommands.js`.
 * 5. Jalankan proses bot + API menggunakan `node index.js` (atau npm start).
 * 6. Jalankan frontend secara terpisah: `cd nextapp && npm run dev` untuk pengembangan.
 *    Saat deploy, bot/API dan Next.js frontend bisa ditempatkan di layanan terpisah.
 */
require('dotenv').config();

const { startBot } = require('./server/bot');
const { startApiServer } = require('./server/api');

async function bootstrap() {
  try {
    await startBot();
    await startApiServer();
  } catch (error) {
    console.error('Gagal memulai layanan utama:', error);
    process.exit(1);
  }
}

bootstrap();
