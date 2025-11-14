const path = require('path');
const fs = require('fs');
const client = require('./discordClient');
const { analyzeFirstMessageBehavior } = require('./utils/behaviorCheck');
const { markUserSuspicious } = require('../api/models/Users');
const { insertLog } = require('../api/models/VerificationLog');

const GUILD_ID = process.env.GUILD_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;

const recentlyVerified = new Map();

function registerRecentVerification(userId) {
  recentlyVerified.set(userId, Date.now());
}

function pruneRecent() {
  const now = Date.now();
  for (const [userId, ts] of recentlyVerified.entries()) {
    if (now - ts > 15 * 60 * 1000) {
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

client.once('clientReady', () => {
  console.log(`Bot masuk sebagai ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error('Command execution failed', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Terjadi kesalahan.', flags: 64 });
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.guildId !== GUILD_ID) return;
  pruneRecent();
  if (!recentlyVerified.has(message.author.id)) return;

  const analysis = analyzeFirstMessageBehavior(message.content);
  if (!analysis.suspicious) {
    recentlyVerified.delete(message.author.id);
    return;
  }

  recentlyVerified.delete(message.author.id);
  await markUserSuspicious(message.author.id, GUILD_ID, analysis.reason);
  await insertLog({
    userId: message.author.id,
    guildId: GUILD_ID,
    result: 'BANNED',
    reason: analysis.reason,
  });

  if (WELCOME_CHANNEL_ID) {
    try {
      const channel = await client.channels.fetch(WELCOME_CHANNEL_ID);
      await channel.send({
        content: `⚠️ Pesan pertama <@${message.author.id}> terdeteksi mencurigakan (${analysis.reason}).`,
      });
    } catch (err) {
      console.error('Failed to send suspicious alert', err);
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
