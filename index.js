/**
 * Cara menjalankan aplikasi secara lokal:
 * 1. salin .env.example menjadi .env dan isi seluruh variabel.
 * 2. npm install
 * 3. cd web && npm install
 * 4. kembali ke root, jalankan `node registerCommands.js` sekali untuk mendaftarkan slash command.
 * 5. jalankan backend (bot + API) dengan `node index.js`.
 * 6. jalankan frontend Next.js di terminal terpisah: `cd web && npm run dev`.
 * Pastikan MongoDB Atlas URI sudah diisi pada MONGO_URI atau gunakan cluster lokal sendiri.
 */
require('dotenv').config();

try {
  const ffmpegPath = require('ffmpeg-static');
  if (ffmpegPath && !process.env.FFMPEG_PATH) {
    process.env.FFMPEG_PATH = ffmpegPath;
  }
} catch (_) {
  // ignore
}

const { startBot } = require('./bot/bot');
const { startApiServer } = require('./api');
const { connectMongo } = require('./api/lib/db');

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

async function bootstrap() {
  try {
    console.log('DEBUG using MONGO_URI?', !!process.env.MONGO_URI);
    await connectMongo();
    await startBot();
    await startApiServer();
    console.log('🚀 Bot dan API sudah berjalan.');
  } catch (error) {
    console.error('Gagal memulai sistem', error);
    process.exit(1);
  }
}

bootstrap();
