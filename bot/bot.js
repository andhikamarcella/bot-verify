// Discord bot bootstrapper: loads commands, listens for interactions, and
// exposes helpers for the API to flag recently verified users.
const path = require('path');
const fs = require('fs');
const client = require('./discordClient');
const { analyzeMessage } = require('./utils/behaviorCheck');
const { upsertUserProfile } = require('../api/models/UserProfile');
const { findLatestByUser, updateToken } = require('../api/models/Token');

const GUILD_ID = process.env.GUILD_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;

const recentlyVerified = new Map();

function registerRecentVerification(userId) {
  recentlyVerified.set(userId, Date.now());
}

function pruneRecent() {
  const now = Date.now();
  for (const [userId, timestamp] of recentlyVerified.entries()) {
    if (now - timestamp > 1000 * 60 * 30) {
      recentlyVerified.delete(userId);
    }
  }
}

async function loadCommands() {
  const commandsDir = path.join(__dirname, 'commands');
  const files = fs.readdirSync(commandsDir).filter((file) => file.endsWith('.js'));
  for (const file of files) {
    const command = require(path.join(commandsDir, file));
    if (command?.data && command?.execute) {
      client.commands.set(command.data.name, command);
    }
  }
}

client.once('ready', () => {
  console.log(`🤖 Bot logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error('Command execution failed', error);
    if (!interaction.replied) {
      await interaction.reply({
        content: 'Terjadi kesalahan saat menjalankan perintah.',
        flags: 64,
      });
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.guildId !== GUILD_ID) return;
  pruneRecent();
  if (!recentlyVerified.has(message.author.id)) return;

  const analysis = analyzeMessage(message.content);
  if (!analysis.suspicious) {
    recentlyVerified.delete(message.author.id);
    return;
  }

  recentlyVerified.delete(message.author.id);
  console.warn('Suspicious message detected from', message.author.id, analysis.reasons);

  await upsertUserProfile({
    userId: message.author.id,
    suspicious: true,
    suspiciousReasons: analysis.reasons,
  });

  const tokenDoc = await findLatestByUser(message.author.id);
  if (tokenDoc) {
    await updateToken(tokenDoc.token, { status: 'banned', failureReason: analysis.reasons.join(',') });
  }

  if (WELCOME_CHANNEL_ID) {
    try {
      const channel = await client.channels.fetch(WELCOME_CHANNEL_ID);
      await channel.send({
        content: `⚠️ **Alert**: Pesan pertama <@${message.author.id}> terdeteksi mencurigakan (${analysis.reasons.join(', ')}).`,
      });
    } catch (error) {
      console.error('Failed to send suspicious alert', error);
    }
  }
});

async function startBot() {
  await loadCommands();
  await client.login(process.env.DISCORD_TOKEN);
  return client;
}

module.exports = {
  startBot,
  client,
  registerRecentVerification,
};
