const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType,
  REST,
  Routes,
} = require('discord.js');
const client = require('./discordClient');
const { analyzeFirstMessageBehavior } = require('./utils/behaviorCheck');
const { fetchConfig } = require('./utils/guildConfig');
const { sendVerificationLog } = require('./utils/logging');
const {
  markUserSuspicious,
  getUserProfile,
} = require('../api/models/Users');
const { insertLog } = require('../api/models/VerificationLog');
const {
  upsertVerificationProfile,
  appendSuspectReason,
  getVerificationProfile,
  setRiskScore,
} = require('../api/models/VerificationProfiles');
const { insertHistoryEntry } = require('../api/models/VerificationHistory');
const { getBlacklistEntry } = require('../api/models/BlacklistedUsers');
const {
  createTokenDocument,
  findLatestByUser,
} = require('../api/models/Tokens');
const { getExtraRolesForUser } = require('../api/lib/roleSync');
const { computeRiskScore } = require('../api/lib/riskScore');

const GUILD_ID = process.env.GUILD_ID;
const FRONTEND_URL = (process.env.PUBLIC_FRONTEND_URL || '').replace(/\/$/, '');
const SUPPORT_INVITE_URL = 'https://discord.gg/w3ENr2uEeH';

const COMMANDS_DIR = path.join(__dirname, 'commands');

const recentlyVerified = new Map();
const reminderTimers = new Map();
const verifiedCache = new Map();
const mediaWarningCooldown = new Map();

const presenceMessages = [
  'Verifying members | /verify',
  'Protecting servers | /verify',
  'Need help? Try /help',
  'Join support: discord.gg/w3ENr2uEeH',
];

function reminderKey(guildId, userId) {
  return `${guildId || GUILD_ID}:${userId}`;
}

function pruneMap(map, ttl) {
  const now = Date.now();
  for (const [key, expires] of map.entries()) {
    if (expires <= now) {
      map.delete(key);
    }
  }
}

function cancelReminder(userId, guildId = GUILD_ID) {
  const key = reminderKey(guildId, userId);
  const timer = reminderTimers.get(key);
  if (timer) {
    clearTimeout(timer);
  }
  reminderTimers.delete(key);
}

function registerRecentVerification(userId, guildId = GUILD_ID) {
  recentlyVerified.set(userId, Date.now());
  cancelReminder(userId, guildId);
  verifiedCache.set(userId, { value: true, expires: Date.now() + 10 * 60 * 1000 });
}

function pruneRecent() {
  pruneMap(recentlyVerified, 15 * 60 * 1000);
}

function walkCommands(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkCommands(fullPath);
      continue;
    }
    if (!entry.name.endsWith('.js')) {
      continue;
    }

    delete require.cache[require.resolve(fullPath)];
    const command = require(fullPath);
    if (command?.data && command?.execute) {
      if (client.commands.has(command.data.name)) {
        console.warn(`⚠️  Command ${command.data.name} sudah dimuat, melewati ${fullPath}`);
        continue;
      }
      client.commands.set(command.data.name, command);
    }
  }
}

async function loadCommands() {
  client.commands.clear();
  walkCommands(COMMANDS_DIR);
}

async function registerApplicationCommands() {
  const payload = [];
  const seenNames = new Set();
  for (const command of client.commands.values()) {
    if (!command?.data?.toJSON) continue;
    const name = command.data.name;
    if (seenNames.has(name)) {
      console.warn(`⚠️  Duplicate command name detected (${name}), menggunakan definisi pertama.`);
      continue;
    }
    seenNames.add(name);
    payload.push(command.data.toJSON());
  }

  if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
    console.warn('⚠️  Lewati registrasi command: DISCORD_TOKEN atau DISCORD_CLIENT_ID tidak tersedia.');
    return;
  }

  if (!process.env.GUILD_ID) {
    console.warn('⚠️  Lewati registrasi command: GUILD_ID tidak tersedia.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    const globalRoute = Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);
    const guildRoute = Routes.applicationGuildCommands(
      process.env.DISCORD_CLIENT_ID,
      process.env.GUILD_ID
    );
    console.log('🧹 Membersihkan command global sebelumnya...');
    await rest.put(globalRoute, { body: [] });
    console.log(`🧹 Membersihkan command guild sebelumnya untuk ${process.env.GUILD_ID}...`);
    await rest.put(guildRoute, { body: [] });

    console.log(`🔁 Mendaftarkan ${payload.length} slash command ke guild ${process.env.GUILD_ID}...`);
    await rest.put(guildRoute, { body: payload });

    const names = Array.from(seenNames).join(', ');
    console.log(`✅ Command terpasang: ${names}`);
  } catch (error) {
    console.error('❌ Gagal mendaftarkan command aplikasi', error);
  }
}

async function isUserVerified(guildId, userId) {
  const cached = verifiedCache.get(userId);
  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }
  const profile = await getUserProfile(userId, guildId);
  const verified = Boolean(profile?.verifiedAt);
  verifiedCache.set(userId, { value: verified, expires: Date.now() + 60 * 1000 });
  return verified;
}

async function scheduleReminder(member) {
  const config = await fetchConfig(member.guild.id);
  const reminderEnabled =
    typeof config.dmReminderEnabled === 'boolean' ? config.dmReminderEnabled : config.reminderEnabled;
  if (!reminderEnabled) {
    return;
  }
  const rawDelay = config.dmReminderDelayMinutes ?? config.reminderDelayMinutes ?? 5;
  const delayMinutes = Math.max(rawDelay || 5, 1);
  const delayMs = delayMinutes * 60 * 1000;
  cancelReminder(member.id, member.guild.id);
  const key = reminderKey(member.guild.id, member.id);
  const timer = setTimeout(async () => {
    reminderTimers.delete(key);
    try {
      const verified = await isUserVerified(member.guild.id, member.id);
      if (verified) {
        return;
      }
      if (!FRONTEND_URL) {
        await member.send('Hai! Jalankan perintah /verify start di server untuk mendapatkan tautan verifikasi.');
        return;
      }
      const latestToken = await findLatestByUser(member.id, member.guild.id);
      let tokenDoc = latestToken;
      const now = Date.now();
      if (!tokenDoc || tokenDoc.status !== 'PENDING' || now - new Date(tokenDoc.createdAt).getTime() > 15 * 60 * 1000) {
        const extraRoles = await getExtraRolesForUser(client, member.id);
        const token = crypto.randomUUID();
        tokenDoc = await createTokenDocument({
          token,
          userId: member.id,
          guildId: member.guild.id,
          roleId: process.env.MEMBER_ROLE_ID,
          status: 'PENDING',
          extraRolesEligible: extraRoles,
          createdAt: new Date(),
        });
        await upsertVerificationProfile({
          userId: member.id,
          guildId: member.guild.id,
          incrementAttempts: true,
        });
      }
      const verificationUrl = `${FRONTEND_URL}/verify?token=${tokenDoc.token}`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Verify Me').setStyle(ButtonStyle.Link).setURL(verificationUrl)
      );
      await member.send({
        content: [
          `Hai ${member.user.username}!`,
          'Kami belum mendeteksi bahwa kamu sudah diverifikasi.',
          'Klik tombol di bawah untuk menyelesaikan verifikasi dan mendapatkan akses penuh.',
          '',
          `Kalau tombol tidak muncul, salin tautan ini: ${verificationUrl}`,
        ].join('\n'),
        components: [row],
      });
    } catch (error) {
      console.warn('Gagal mengirim pengingat verifikasi:', error?.message);
    }
  }, delayMs);
  reminderTimers.set(key, timer);
}

async function handleMemberJoin(member) {
  if (member.guild.id !== GUILD_ID) return;
  const config = await fetchConfig(member.guild.id);
  const accountAgeMs = Date.now() - member.user.createdTimestamp;
  const accountAgeDays = Math.max(accountAgeMs / (1000 * 60 * 60 * 24), 0);
  const suspectReasons = [];

  if (accountAgeDays < (config.minAccountAgeDays || 7)) {
    suspectReasons.push('account-too-new');
    await appendSuspectReason(member.id, member.guild.id, 'account-too-new');
  }

  const patterns = config.forbiddenNamePatterns || [];
  const nameTargets = [member.user.username, member.user.globalName || ''];
  for (const pattern of patterns) {
    try {
      const regex = new RegExp(pattern, 'i');
      if (nameTargets.some((value) => value && regex.test(value))) {
        suspectReasons.push(`name-pattern:${pattern}`);
        await appendSuspectReason(member.id, member.guild.id, `name-pattern:${pattern}`);
        break;
      }
    } catch (err) {
      console.warn('Invalid forbidden name pattern', pattern, err?.message);
    }
  }

  const blacklistEntry = await getBlacklistEntry(member.id, member.guild.id);
  if (blacklistEntry) {
    suspectReasons.push(`blacklisted:${blacklistEntry.reason}`);
    await appendSuspectReason(member.id, member.guild.id, `blacklisted:${blacklistEntry.reason}`);
  }

  await upsertVerificationProfile({
    userId: member.id,
    guildId: member.guild.id,
    accountCreatedAt: member.user.createdAt,
    isSuspect: suspectReasons.length > 0,
    suspectReasons,
  });

  const riskScore = computeRiskScore({
    accountAgeDays,
    blacklisted: Boolean(blacklistEntry),
    suspectReasons,
  });
  await setRiskScore(member.id, member.guild.id, riskScore);

  await sendVerificationLog({
    client,
    guildId: member.guild.id,
    config,
    user: member.user,
    member,
    type: 'info',
    status: 'JOINED',
    riskScore,
    suspectReasons,
    reason: `Account age ≈ ${accountAgeDays.toFixed(1)} hari`,
  });

  if (blacklistEntry || suspectReasons.length > 0) {
    await sendVerificationLog({
      client,
      guildId: member.guild.id,
      config,
      user: member.user,
      member,
      type: 'failure',
      status: blacklistEntry ? 'BLACKLISTED' : 'FLAGGED',
      riskScore,
      suspectReasons,
      reason: blacklistEntry ? `Blacklisted: ${blacklistEntry.reason}` : 'Initial join flagged',
    });
  }

  await scheduleReminder(member);
}

async function handleMessageCreate(message) {
  if (!message.guild || message.guild.id !== GUILD_ID) return;
  if (message.author.bot) return;

  const config = await fetchConfig(message.guild.id);

  if (config.mediaRestrictionEnabled) {
    const allowed = (config.allowedChannels || []).map(String);
    const isAllowedChannel = allowed.includes(message.channelId);
    const hasAttachment = message.attachments.size > 0;
    const hasUrl = /(https?:\/\/|discord\.gg|discord\.com\/invite)/i.test(message.content || '');
    if (!isAllowedChannel && (hasAttachment || hasUrl)) {
      const verified = await isUserVerified(message.guild.id, message.author.id);
      if (!verified) {
        try {
          await message.delete();
        } catch (err) {
          console.warn('Tidak bisa menghapus pesan media', err?.message);
        }
        const cooldownKey = `${message.author.id}:media-warn`;
        const now = Date.now();
        const nextWarn = mediaWarningCooldown.get(cooldownKey) || 0;
        if (nextWarn <= now) {
          mediaWarningCooldown.set(cooldownKey, now + 5 * 60 * 1000);
          try {
            await message.author.send(
              'Kamu belum diverifikasi jadi kami menolak pesan dengan link/attachment. Jalankan /verify untuk mendapatkan akses penuh.'
            );
          } catch (err) {
            console.warn('Gagal mengirim peringatan DM media restriction', err?.message);
          }
        }
      }
    }
  }

  pruneRecent();
  if (!recentlyVerified.has(message.author.id)) return;

  const analysis = analyzeFirstMessageBehavior(message.content || '');
  if (!analysis.suspicious) {
    recentlyVerified.delete(message.author.id);
    return;
  }

  recentlyVerified.delete(message.author.id);
  await markUserSuspicious(message.author.id, message.guild.id, analysis.reason);
  await insertLog({
    userId: message.author.id,
    guildId: message.guild.id,
    result: 'BANNED',
    reason: analysis.reason,
  });
  await insertHistoryEntry({
    userId: message.author.id,
    guildId: message.guild.id,
    status: 'failed',
    reason: `first-message:${analysis.reason}`,
  });

  const profile = await getVerificationProfile(message.author.id, message.guild.id);
  const riskScore = profile?.riskScore ?? 60;
  await sendVerificationLog({
    client,
    guildId: message.guild.id,
    config,
    user: message.author,
    member: message.member,
    type: 'failure',
    status: 'SUSPICIOUS',
    riskScore,
    suspectReasons: [analysis.reason],
    reason: 'Pesan pertama terdeteksi mencurigakan',
  });
}

client.once(Events.ClientReady, () => {
  console.log(`Bot masuk sebagai ${client.user.tag}`);

  let presenceIndex = 0;
  const applyPresence = () => {
    const message = presenceMessages[presenceIndex % presenceMessages.length];
    const activity = {
      name: message,
      type: ActivityType.Playing,
      // Buttons require the invite URL to be registered under Activity URL Mapping in the
      // Discord Developer Portal for this application.
      buttons: ['Join Support Server'],
      metadata: { button_urls: [SUPPORT_INVITE_URL] },
      url: SUPPORT_INVITE_URL,
    };

    if (process.env.DISCORD_CLIENT_ID) {
      activity.applicationId = process.env.DISCORD_CLIENT_ID;
    }

    client.user.setPresence({
      activities: [activity],
      status: 'online',
    });
    presenceIndex = (presenceIndex + 1) % presenceMessages.length;
  };

  applyPresence();
  setInterval(applyPresence, 45 * 1000);
});

client.on(Events.GuildMemberAdd, (member) => {
  handleMemberJoin(member).catch((err) => {
    console.error('GuildMemberAdd handler error', err);
  });
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === 'verify:panel:start') {
        const verifyCommand = client.commands.get('verify');
        if (verifyCommand?.handleStart) {
          await verifyCommand.handleStart(interaction, client);
        } else {
          await interaction.reply({ content: 'Perintah tidak tersedia.', flags: 64 });
        }
      } else if (interaction.customId === 'verify:panel:help') {
        await interaction.reply({
          content: 'Butuh bantuan? Jalankan /verify start untuk menerima tautan verifikasi via DM atau hubungi staf.',
          flags: 64,
        });
      } else {
        await interaction.reply({ content: 'Tombol tidak dikenali.', flags: 64 });
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    await command.execute(interaction, client);
  } catch (error) {
    console.error('Command execution failed', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Terjadi kesalahan.', flags: 64 });
    }
  }
});

client.on(Events.MessageCreate, (message) => {
  handleMessageCreate(message).catch((err) => {
    console.error('MessageCreate handler error', err);
  });
});

async function startBot() {
  await loadCommands();
  await registerApplicationCommands();
  await client.login(process.env.DISCORD_TOKEN);
  return client;
}

module.exports = {
  startBot,
  client,
  registerRecentVerification,
  cancelReminder,
};
