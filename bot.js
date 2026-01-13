const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const { initializeLavalink } = require('./api/music/lavalink');
const fs = require('fs');
const path = require('path');

// Bot configuration
const BOT_CONFIG = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.GUILD_ID, // Optional: for instant guild deployment
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
};

// Initialize Discord client
const client = new Client({ intents: BOT_CONFIG.intents });

// Load commands
const commands = [];
const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(__dirname, 'commands', file));
  commands.push(command.data.toJSON());
  console.log(`[Commands] Loaded command: ${command.data.name}`);
}

// Bot ready event
client.once('ready', async () => {
  console.log(`[Bot] Logged in as ${client.user.tag}!`);
  console.log(`[Bot] Ready in ${client.guilds.cache.size} guilds`);
  
  // Initialize Lavalink
  try {
    await initializeLavalink(client);
    console.log('[Bot] Lavalink initialized successfully!');
  } catch (error) {
    console.error('[Bot] Failed to initialize Lavalink:', error);
  }
  
  // Register slash commands
  try {
    console.log('[Bot] Started refreshing application (/) commands.');
    
    const rest = new REST({ version: '10' }).setToken(BOT_CONFIG.token);
    
    if (BOT_CONFIG.guildId) {
      // Register for specific guild (instant)
      await rest.put(
        Routes.applicationGuildCommands(BOT_CONFIG.clientId, BOT_CONFIG.guildId),
        { body: commands },
      );
      console.log(`[Bot] Successfully registered ${commands.length} guild commands!`);
    } else {
      // Register globally (takes up to 1 hour)
      await rest.put(
        Routes.applicationCommands(BOT_CONFIG.clientId),
        { body: commands },
      );
      console.log(`[Bot] Successfully registered ${commands.length} global commands!`);
    }
  } catch (error) {
    console.error('[Bot] Error registering commands:', error);
  }
});

// Handle slash command interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  const command = client.commands.get(interaction.commandName);
  
  if (!command) {
    console.error(`[Bot] No command matching ${interaction.commandName} was found.`);
    return;
  }
  
  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(`[Bot] Error executing ${interaction.commandName}:`, error);
    await interaction.reply({ 
      content: '❌ There was an error while executing this command!', 
      ephemeral: true 
    });
  }
});

// Voice state updates for Lavalink
client.on('raw', async (event) => {
  // Forward voice state updates to Lavalink
  if (event.t === 'VOICE_SERVER_UPDATE' || event.t === 'VOICE_STATE_UPDATE') {
    if (lavalinkNode) {
      lavalinkNode.handleVoiceUpdate(event);
    }
  }
});

// Guild member joins for verification
client.on('guildMemberAdd', async (member) => {
  // Existing verification logic here
  // This would integrate with your existing verification system
});

// Error handling
client.on('error', (error) => {
  console.error('[Bot] Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('[Bot] Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('[Bot] Uncaught exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[Bot] Received SIGINT, shutting down gracefully...');
  
  // Disconnect all voice connections
  for (const [guildId, player] of lavalinkNode?.players || []) {
    await player.disconnect();
  }
  
  // Destroy Lavalink connection
  if (lavalinkNode) {
    await lavalinkNode.disconnect();
  }
  
  // Destroy Discord client
  client.destroy();
  
  console.log('[Bot] Shutdown complete');
  process.exit(0);
});

// Store commands in client for easy access
client.commands = new Map();
for (const file of commandFiles) {
  const command = require(path.join(__dirname, 'commands', file));
  client.commands.set(command.data.name, command);
}

// Start bot
if (BOT_CONFIG.token) {
  client.login(BOT_CONFIG.token);
} else {
  console.error('[Bot] DISCORD_BOT_TOKEN environment variable is required!');
  process.exit(1);
}

module.exports = client;
