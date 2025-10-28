require('dotenv').config();

const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const { DISCORD_TOKEN, DISCORD_CLIENT_ID } = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('DISCORD_TOKEN dan DISCORD_CLIENT_ID harus diset di file .env');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Mulai proses verifikasi member.'),
].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log('Mendaftarkan slash command /verify...');
    await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body: commands });
    console.log('Slash command berhasil didaftarkan.');
  } catch (error) {
    console.error('Gagal mendaftarkan slash command:', error);
    process.exit(1);
  }
})();
