/**
 * Cara menjalankan aplikasi secara lokal:
 * 1. salin .env.example menjadi .env dan isi seluruh variabel.
 * 2. npm install
 * 3. cd web && npm install
 * 4. kembali ke root, jalankan `node registerCommands.js` sekali untuk mendaftarkan slash command.
 * 5. jalankan backend (bot + API) dengan `node index.js`.
 * 6. jalankan frontend Next.js di terminal terpisah: `cd web && npm run dev`.
 * Pastikan MongoDB berjalan secara lokal atau atur MONGODB_URI di environment.
 */
require('dotenv').config();
const { startBot } = require('./bot/bot');
const { startApiServer } = require('./api');

async function bootstrap() {
  try {
    await startBot();
    await startApiServer();
    console.log('🚀 Bot dan API sudah berjalan.');
  } catch (error) {
    console.error('Gagal memulai sistem', error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled:', reason);
});

bootstrap();
