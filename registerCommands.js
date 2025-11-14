// Utility script for registering slash commands globally.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const commands = [];

function loadCommandFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      loadCommandFiles(fullPath);
      continue;
    }
    if (!entry.name.endsWith('.js')) {
      continue;
    }

    // Delete from require cache to ensure fresh metadata when rerunning the script.
    delete require.cache[require.resolve(fullPath)];
    const command = require(fullPath);
    if (command?.data) {
      commands.push(command.data.toJSON());
    }
  }
}

const commandsPath = path.join(__dirname, 'bot', 'commands');
loadCommandFiles(commandsPath);

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function register() {
  try {
    console.log(`🔧 Refreshing ${commands.length} application commands...`);
    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
      body: commands,
    });
    console.log('✅ Global commands registered.');

    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log(`✅ Guild commands registered for ${process.env.GUILD_ID}.`);
    } else {
      console.warn('⚠️  GUILD_ID not provided; skipping guild-scoped registration.');
    }
  } catch (error) {
    console.error('Failed to register commands', error);
  }
}

register();
