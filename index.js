/**
 * Cara menjalankan aplikasi:
 * 1. npm install discord.js express dotenv node-fetch body-parser
 * 2. Buat file .env berdasarkan .env.example dan isi dengan konfigurasi Anda.
 * 3. Jalankan `node registerCommands.js` sekali untuk mendaftarkan slash command.
 * 4. Jalankan bot dan web server dengan `node index.js`.
 * 5. Pastikan bot telah diundang ke server dengan scope `bot` dan `applications.commands`,
 *    serta memiliki izin Manage Roles dan peran bot berada di atas peran Member.
 */
require('dotenv').config();

const { startBot } = require('./bot');
const { startWebServer } = require('./web');

async function main() {
  try {
    await startBot();
    await startWebServer();
  } catch (error) {
    console.error('Gagal memulai aplikasi:', error);
    process.exit(1);
  }
}

main();
