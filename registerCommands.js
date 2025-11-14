// Utility script for registering slash commands for the target guild.
require('dotenv').config();
const path = require('path');
const { REST } = require('discord.js');
const {
  loadCommandManifest,
  clearGlobalCommands,
  syncGuildCommands,
} = require('./bot/utils/commandSync');

const commandsPath = path.join(__dirname, 'bot', 'commands');
const { manifest, duplicates } = loadCommandManifest(commandsPath);
if (duplicates.length) {
  for (const dup of duplicates) {
    console.warn(
      `⚠️  Command ${dup.name} duplikat, file ${dup.file} dilewati (menggunakan ${dup.original}).`
    );
  }
}

if (manifest.length === 0) {
  console.error('Tidak menemukan command untuk didaftarkan. Pastikan folder bot/commands berisi file valid.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function register() {
  if (!process.env.GUILD_ID) {
    console.error('GUILD_ID is required to register guild commands.');
    return;
  }

  try {
    console.log('🧹 Clearing existing global commands...');
    await clearGlobalCommands(rest, process.env.DISCORD_CLIENT_ID);
    console.log(`🧹 Clearing existing commands for guild ${process.env.GUILD_ID}...`);
    const names = await syncGuildCommands(
      rest,
      process.env.DISCORD_CLIENT_ID,
      process.env.GUILD_ID,
      manifest
    );

    console.log(`✅ Guild commands registered: ${names.join(', ')}`);
  } catch (error) {
    console.error('Failed to register commands', error);
  }
}

register();
