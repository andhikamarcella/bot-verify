// Utility script for registering slash commands for the target guild.
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
  if (!process.env.GUILD_ID) {
    console.error('GUILD_ID is required to register guild commands.');
    return;
  }

  const route = Routes.applicationGuildCommands(
    process.env.DISCORD_CLIENT_ID,
    process.env.GUILD_ID
  );

  try {
    console.log(`🧹 Clearing existing commands for guild ${process.env.GUILD_ID}...`);
    await rest.put(route, { body: [] });

    console.log(`🔧 Registering ${commands.length} guild commands...`);
    await rest.put(route, { body: commands });

    console.log(
      `✅ Guild commands registered: ${commands.map((command) => command.name).join(', ')}`
    );
  } catch (error) {
    console.error('Failed to register commands', error);
  }
}

register();
