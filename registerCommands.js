// Utility script for registering slash commands globally.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const commandsPath = path.join(__dirname, 'bot', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
const commands = [];

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command?.data) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function register() {
  try {
    console.log(`🔧 Refreshing ${commands.length} application commands...`);
    await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
      body: commands,
    });
    console.log('✅ Commands registered.');
  } catch (error) {
    console.error('Failed to register commands', error);
  }
}

register();
