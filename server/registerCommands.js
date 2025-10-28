/**
 * Skrip utilitas untuk mendaftarkan slash command /verify ke Discord API.
 * Jalankan sekali setelah Anda mengisi .env: `node server/registerCommands.js`
 */
require('dotenv').config();

const { REST, Routes, SlashCommandBuilder } = require('discord.js');

async function registerCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!token || !clientId) {
    throw new Error('DISCORD_TOKEN dan DISCORD_CLIENT_ID wajib diisi sebelum registrasi perintah.');
  }

  const rest = new REST({ version: '10' }).setToken(token);

  const commands = [
    new SlashCommandBuilder()
      .setName('verify')
      .setDescription('Mulai proses verifikasi member untuk server ini.')
      .toJSON(),
  ];

  try {
    console.log('Mengirim definisi slash command...');
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('Berhasil mendaftarkan /verify ✅');
  } catch (error) {
    console.error('Gagal mendaftarkan perintah:', error);
    process.exitCode = 1;
  }
}

registerCommands();
