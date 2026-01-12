const path = require('path');
const crypto = require('crypto');
const {
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType,
  REST,
  PermissionFlagsBits,
} = require('discord.js');
const client = require('./discordClient');
const {
  loadCommandManifest,
  clearGlobalCommands,
  syncGuildCommands,
} = require('./utils/commandSync');
const { analyzeFirstMessageBehavior } = require('./utils/behaviorCheck');
const { fetchConfig } = require('./utils/guildConfig');
const { sendVerificationLog } = require('./utils/logging');

// Import permissions with multiple fallback attempts
let hasNonEveryoneRole, isStaffMember;
try {
  // Try multiple path approaches
  let permissions;
  try {
    permissions = require('./utils/permissions');
  } catch (e1) {
    try {
      permissions = require(path.join(__dirname, 'utils', 'permissions'));
    } catch (e2) {
      try {
        permissions = require(path.resolve(__dirname, 'utils', 'permissions'));
      } catch (e3) {
        throw new Error(`Failed to load permissions from all paths: ${e1.message}, ${e2.message}, ${e3.message}`);
      }
    }
  }
  
  hasNonEveryoneRole = permissions.hasNonEveryoneRole;
  isStaffMember = permissions.isStaffMember;
  console.log('[Bot] Permissions module loaded successfully');
} catch (error) {
  console.error('[Bot] Failed to load permissions module:', error);
  // Fallback functions
  hasNonEveryoneRole = (member) => {
    if (!member || !member.roles) return false;
    const cache = member.roles.cache;
    const guildId = member.guild?.id;
    if (!cache || !guildId) return false;
    return cache.some((role) => role?.id && role.id !== guildId);
  };
  isStaffMember = (member) => {
    if (!member || !member.permissions) return false;
    return member.permissions.has('ManageGuild') || member.permissions.has('Administrator');
  };
  console.log('[Bot] Using fallback permission functions');
}
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
  setTokenStatus,
  findLatestByUserWithStatuses,
  listDmMessagesForUser,
  clearTokenDmFields,
} = require('../api/models/Tokens');
const { getExtraRolesForUser } = require('../api/lib/roleSync');
const { computeRiskScore } = require('../api/lib/riskScore');

const GUILD_ID = process.env.GUILD_ID;
const FRONTEND_URL = (process.env.PUBLIC_FRONTEND_URL || '').replace(/\/$/, '');
const SUPPORT_INVITE_URL = 'https://discord.gg/w3ENr2uEeH';

const COMMANDS_DIR = path.join(__dirname, 'commands');
let commandManifest = [];

const recentlyVerified = new Map();
const reminderTimers = new Map();
const verifiedCache = new Map();
const mediaWarningCooldown = new Map();
const blacklistCache = new Map();
const blacklistEnforcementCooldown = new Map();

const presenceMessages = [
  'Verifying members | /verify',
  'Protecting servers | /verify',
  'Need help? Try /help',
  'Join support: discord.gg/w3ENr2uEeH',
];

const gamePresenceMessages = [
  'Elden Ring',
  'Dark Souls',
  'The Elder Scrolls',
];

const funFactMessages = [
  'Fun Fact: Hiu lebih tua dari pohon 🌊',
  'Fun Fact: Gurita punya 3 jantung 🐙',
  'Fun Fact: Madu tidak basi (bisa awet bertahun-tahun) 🍯',
  'Fun Fact: Pisang itu berry, stroberi bukan 🍌',
  'Fun Fact: Ada lebih banyak bintang di alam semesta daripada pasir di Bumi ✨',
];

const dadJokeMessages = [
  'Jokes: Kenapa komputer suka dingin? Karena banyak kipasnya.',
  'Jokes: Aku bukan pemalas, aku cuma hemat energi.',
  'Jokes: Kalau hidupmu gelap, mungkin kamu belum bayar listrik.',
  'Jokes: Kamu tau kenapa jam nggak bisa bohong? Karena dia berdetak.',
  'Jokes: Kenapa ikan nggak pernah nabrak? Karena mereka selalu lihat kiri-kanan (sirip).',
];

let presenceMode = process.env.PRESENCE_MODE || 'default';

function truncatePresence(text) {
  const raw = String(text || '');
  if (raw.length <= 128) return raw;
  return `${raw.slice(0, 125)}...`;
}

function buildCommandPresenceMessages() {
  if (!Array.isArray(commandManifest) || commandManifest.length === 0) {
    return [];
  }
  const candidates = commandManifest
    .map((entry) => entry?.name)
    .filter(Boolean)
    .filter((name) => !['admin', 'settings', 'blacklist', 'rpc'].includes(String(name)));

  const unique = Array.from(new Set(candidates));
  const base = unique.slice(0, 10);
  return base.map((name) => truncatePresence(`Try /${name}`));
}

function getPresencePoolForMode(mode) {
  const normalized = String(mode || '').toLowerCase();

  if (normalized === 'games') return gamePresenceMessages;
  if (normalized === 'funfact') return funFactMessages.map(truncatePresence);
  if (normalized === 'dadjoke') return dadJokeMessages.map(truncatePresence);
  if (normalized === 'commands') {
    const commands = buildCommandPresenceMessages();
    return commands.length ? commands : presenceMessages;
  }
  if (normalized === 'mixed') {
    const commands = buildCommandPresenceMessages();
    const pool = [];
    const defaults = presenceMessages;
    const facts = funFactMessages;
    const jokes = dadJokeMessages;

    const maxLen = Math.max(commands.length, defaults.length, facts.length, jokes.length, 1);
    for (let i = 0; i < maxLen; i += 1) {
      if (commands[i]) pool.push(truncatePresence(commands[i]));
      if (defaults[i]) pool.push(truncatePresence(defaults[i]));
      if (facts[i]) pool.push(truncatePresence(facts[i]));
      if (jokes[i]) pool.push(truncatePresence(jokes[i]));
    }
    return pool.length ? pool : presenceMessages;
  }

  return presenceMessages;
}

function modeHasButtons(mode) {
  const normalized = String(mode || '').toLowerCase();
  return normalized === 'default' || normalized === 'commands';
}

function getPresenceMode() {
  return presenceMode;
}

function setPresenceMode(mode) {
  const normalized = String(mode || '').toLowerCase();
  if (
    normalized !== 'default' &&
    normalized !== 'games' &&
    normalized !== 'commands' &&
    normalized !== 'funfact' &&
    normalized !== 'dadjoke' &&
    normalized !== 'mixed'
  ) {
    throw new Error('invalid-presence-mode');
  }
  presenceMode = normalized;
}

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

async function loadCommands() {
  const { manifest, duplicates } = loadCommandManifest(COMMANDS_DIR, { requireExecute: true });
  client.commands.clear();
  commandManifest = manifest;
  for (const entry of manifest) {
    if (entry?.module?.execute) {
      client.commands.set(entry.name, entry.module);
    }
  }
  if (duplicates.length) {
    for (const dup of duplicates) {
      console.warn(
        `⚠️  Command ${dup.name} duplikat, file ${dup.file} dilewati (menggunakan ${dup.original}).`
      );
    }
  }
}

async function registerApplicationCommands() {
  if (process.env.SKIP_COMMAND_REGISTRATION === 'true') {
    console.warn('⚠️  Lewati registrasi command: SKIP_COMMAND_REGISTRATION=true');
    return;
  }
  if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID) {
    console.warn('⚠️  Lewati registrasi command: DISCORD_TOKEN atau DISCORD_CLIENT_ID tidak tersedia.');
    return;
  }

  if (!process.env.GUILD_ID) {
    console.warn('⚠️  Lewati registrasi command: GUILD_ID tidak tersedia.');
    return;
  }

  if (!Array.isArray(commandManifest) || commandManifest.length === 0) {
    console.warn('⚠️  Tidak ada command yang dimuat, registrasi dilewati.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('🧹 Membersihkan command global sebelumnya...');
    await clearGlobalCommands(rest, process.env.DISCORD_CLIENT_ID);
    console.log(`🧹 Membersihkan command guild sebelumnya untuk ${process.env.GUILD_ID}...`);
    const names = await syncGuildCommands(
      rest,
      process.env.DISCORD_CLIENT_ID,
      process.env.GUILD_ID,
      commandManifest
    );
    console.log(`✅ Command terpasang: ${names.join(', ')}`);
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

async function getCachedBlacklistEntry(guildId, userId) {
  const cached = blacklistCache.get(userId);
  if (cached && cached.expires > Date.now()) {
    return cached.entry;
  }
  const entry = await getBlacklistEntry(userId, guildId).catch(() => null);
  blacklistCache.set(userId, { entry, expires: Date.now() + 60 * 1000 });
  return entry;
}

async function enforceBlacklistOnMember({ guild, member, reason }) {
  const memberRoleId = process.env.MEMBER_ROLE_ID;
  const blacklistRoleId = process.env.BLACKLIST_ROLE_ID;
  const timeoutMinutes = Number(process.env.BLACKLIST_TIMEOUT_MINUTES || 0);

  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  const canManageRoles = Boolean(me?.permissions?.has?.(PermissionFlagsBits.ManageRoles));
  const canTimeout = Boolean(me?.permissions?.has?.(PermissionFlagsBits.ModerateMembers));

  if (canManageRoles && memberRoleId && member.roles.cache.has(memberRoleId)) {
    await member.roles.remove(memberRoleId, 'blacklisted').catch(() => {});
  }

  if (canManageRoles && blacklistRoleId && !member.roles.cache.has(blacklistRoleId)) {
    await member.roles.add(blacklistRoleId, 'blacklisted').catch(() => {});
  }

  if (canTimeout && timeoutMinutes > 0) {
    const ms = Math.min(timeoutMinutes, 60 * 24 * 28) * 60 * 1000;
    await member.timeout(ms, reason || 'blacklisted').catch(() => {});
  }
}

async function handleDMChatAI(message) {
  try {
    // Typing indicator
    await message.channel.sendTyping();

    // Check if this is first interaction or introduction request
    const content = message.content.toLowerCase();
    const isIntroRequest = content.includes('siapa kamu') || content.includes('hai') || content.includes('hello') || content.includes('intro') || content.includes('kenalan');
    
    // Get user's shared servers
    const sharedGuilds = message.client.guilds.cache.filter(guild => guild.members.cache.has(message.author.id));
    const guildList = sharedGuilds.map(guild => `**${guild.name}**`).join(', ') || 'tidak ada server bersama';

    // Build system prompt with bot info and features
    let systemPrompt = `Kamu adalah asisten AI Discord yang cerdas dan ramah. Nama kamu "Verify Portal Bot".

**Info Bot:**
- Tujuan utama: Verifikasi member dan management server Discord
- Bisa ngobrol, voice call, bantu verifikasi
- Terhubung di server: ${guildList}

**Fitur-fitur yang tersedia:**
🔐 **Verifikasi**: /verify start - Mulai proses verifikasi
🎙️ **Voice Verify**: /voiceverify start - Verifikasi dengan suara
🤖 **AI Chat**: /ai [pesan] - Ngobrol dengan AI
📢 **Say**: /say [pesan] - Bot bicara di voice channel
💬 **Voice Chat**: /voicechat - Ngobrol suara dengan AI
📋 **Application**: /app list, /app interview - Management aplikasi
🛡️ **Moderation**: /kick, /ban, /timeout - Tools moderator
🎵 **Music**: Basic voice commands

**Cara pakai di DM:**
- Ketik pesan apa saja untuk ngobrol dengan AI
- Start voice call dengan bot untuk ngobrol suara
- Bot akan auto-detect dan join voice call

**Saran fitur:**
- "Bisakah bantu verifikasi?" → Guide ke /verify
- "Mau voice call" → Guide ke voice call
- "Butuh bantuan moderator" → List command moderator
- "Info server" → Berikan info server yang bersama
- "Fitur lain?" → Jelaskan semua fitur bot

Jika user minta bantuan atau tanya fitur, berikan panduan yang jelas. Selalu ramah dan helpful.`;

    // Add intro for first-time users
    if (isIntroRequest) {
      const introMessage = `👋 Halo! Aku **Verify Portal Bot** - asisten AI Discord yang membantu verifikasi dan management server.

**Server kita yang bersama:** ${guildList}

**Yang bisa aku lakuin:**
- 🔐 Bantu verifikasi member baru
- 🎙️ Voice verification dengan suara  
- 🤖 Ngobrol chat atau voice call
- 📢 Management server dan moderator
- 🎵 Main di voice channel

**Mau mulai dari mana?**
- Ketik apa saja untuk ngobrol sama aku
- Start voice call untuk ngobrol suara
- Ketik "bantuan" untuk lihat semua command

Aku siap bantu! 😊`;
      
      await message.reply({
        content: introMessage,
        allowedMentions: { repliedUser: false }
      });
      return;
    }

    // Get AI response with system prompt
    const { callGroqChat } = require('./commands/ai');
    const aiResponse = await callGroqChat(message.content, 'id', systemPrompt);

    // Send AI response
    await message.reply({
      content: aiResponse.slice(0, 2000), // Discord limit
      allowedMentions: { repliedUser: false }
    });

  } catch (error) {
    console.error('[DM AI] Error:', error);
    await message.reply({
      content: 'Maaf, terjadi kesalahan. Coba lagi nanti ya.',
      allowedMentions: { repliedUser: false }
    });
  }
}

async function handleDMVoiceCallAI(message) {
  try {
    const voiceChannel = message.member.voice.channel;
    
    // Get user's shared servers for context
    const sharedGuilds = message.client.guilds.cache.filter(guild => guild.members.cache.has(message.author.id));
    const guildList = sharedGuilds.map(guild => guild.name).join(', ') || 'tidak ada server bersama';
    
    // Join the voice channel
    const { joinVoiceChannel, createAudioPlayer, createAudioResource, VoiceConnectionStatus, entersState, AudioPlayerStatus } = require('@discordjs/voice');
    const { groqTtsWav, groqTranscribe } = require('./commands/voiceverify');
    
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    const welcomeMessage = `🎙️ Aku join voice call! Kita di server **${voiceChannel.guild.name}**. 

Aku siap ngobrol suara sama kamu! 🎤

**Tips ngobrol:**
- Bicara jelas setelah aku selesai bicara
- Bisa tanya apa aja tentang server atau fitur bot
- Aku auto-leave setelah 5 menit kalau nggak ada aktivitas

Silakan mulai bicara ya! 😊`;

    await message.reply({
      content: welcomeMessage,
      allowedMentions: { repliedUser: false }
    });

    // Wait for connection to be ready
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

    // Start listening loop with server context
    await startVoiceChatLoop(connection, message, voiceChannel.guild.name, guildList);

  } catch (error) {
    console.error('[Voice Call AI] Error:', error);
    await message.reply({
      content: 'Maaf, gabisa join voice call. Pastikan aku punya permission Connect dan Speak di server ini.',
      allowedMentions: { repliedUser: false }
    });
  }
}

async function startVoiceChatLoop(connection, originalMessage, serverName, guildList) {
  const { createAudioPlayer, createAudioResource, AudioPlayerStatus, entersState } = require('@discordjs/voice');
  const { groqTtsWav, groqTranscribe } = require('./commands/voiceverify');
  const { callGroqChat } = require('./commands/ai');
  const { recordUserToWav } = require('./commands/voiceverify');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const { VoiceConnectionStatus } = require('@discordjs/voice');

  const player = createAudioPlayer();
  connection.subscribe(player);

  let isListening = false;
  const tmpDir = os.tmpdir();

  // Enhanced system prompt for voice chat
  const voiceSystemPrompt = `Kamu adalah asisten AI Discord yang sedang voice call di server "${serverName}". 

Server bersama user: ${guildList}

**Konteks voice call:**
- User sedang voice call langsung dengan kamu
- Respon harus lebih singkat dan natural (cocok untuk suara)
- Bisa bantu tentang verifikasi, fitur bot, atau ngobrol casual
- Sedia bantu jika user tanya command atau fitur

**Style bicara:**
- Ramah dan casual seperti teman ngobrol
- Jawaban singkat dan jelas
- Bisa kasih saran fitur bot yang relevan
- Jika user bingging, guide ke command yang tepat

Contoh respons:
- "Mau verifikasi? Coba /verify start ya"
- "Butuh bantuan? Ketik /help di server"
- "Aku juga bisa voice verify lho, coba /voiceverify"`;

  // Welcome message
  try {
    const welcomeWav = await groqTtsWav(`Halo! Selamat datang di voice call server ${serverName}. Aku siap bantu kamu!`, 'id');
    const welcomeResource = createAudioResource(welcomeWav);
    player.play(welcomeResource);
    await entersState(player, AudioPlayerStatus.Idle, 60_000);
  } catch (err) {
    console.error('[Voice Chat] Failed to play welcome:', err);
  }

  // Start continuous listening
  const listenInterval = setInterval(async () => {
    if (isListening) return;
    isListening = true;

    try {
      // Record user speech
      const tmpPath = path.join(tmpDir, `voice-ai-${Date.now()}.wav`);
      await recordUserToWav(connection, originalMessage.author.id, tmpPath);

      // Transcribe
      const wavBuffer = await fs.promises.readFile(tmpPath);
      const transcript = await groqTranscribe(wavBuffer, 'voice-ai.wav', 'id');

      if (transcript && transcript.trim().length > 0) {
        console.log(`[Voice Chat] User: ${transcript}`);

        // Get AI response with voice context
        const aiResponse = await callGroqChat(transcript, 'id', voiceSystemPrompt);
        console.log(`[Voice Chat] AI: ${aiResponse}`);

        // Speak AI response
        try {
          const responseWav = await groqTtsWav(aiResponse.slice(0, 300), 'id'); // Limit TTS length
          const responseResource = createAudioResource(responseWav);
          player.play(responseResource);
          await entersState(player, AudioPlayerStatus.Idle, 60_000);
        } catch (ttsErr) {
          console.error('[Voice Chat] TTS error:', ttsErr);
          // Fallback: send text message
          await originalMessage.channel.send(`🤖: ${aiResponse.slice(0, 500)}`);
        }
      }

      // Cleanup
      try {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      } catch (cleanupErr) {
        console.error('[Voice Chat] Cleanup error:', cleanupErr);
      }

    } catch (error) {
      console.error('[Voice Chat] Loop error:', error);
    } finally {
      isListening = false;
    }
  }, 3000); // Listen every 3 seconds

  // Cleanup on disconnect
  connection.on(VoiceConnectionStatus.Disconnected, () => {
    clearInterval(listenInterval);
    connection.destroy();
  });

  // Auto-disconnect after 5 minutes of inactivity
  let lastActivity = Date.now();
  const activityCheck = setInterval(() => {
    if (Date.now() - lastActivity > 5 * 60 * 1000) {
      clearInterval(listenInterval);
      clearInterval(activityCheck);
      connection.destroy();
      originalMessage.channel.send(`👋 Terima kasih sudah voice call di **${serverName}**! Aku leave ya. Sampai jumpa lagi! 😊`);
    }
  }, 30 * 1000);
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
      const freshMember = await member.guild.members.fetch(member.id).catch(() => member);

      if (freshMember) {
        if (isStaffMember(freshMember) || hasNonEveryoneRole(freshMember)) {
          return;
        }
      }

      const verified = await isUserVerified(member.guild.id, member.id);
      if (verified) {
        return;
      }

      const blacklistEntry = await getBlacklistEntry(member.id, member.guild.id);
      if (blacklistEntry) {
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

      try {
        const oldMessages = await listDmMessagesForUser(member.id, member.guild.id, 25).catch(() => []);
        for (const item of oldMessages) {
          const channelId = item?.dmChannelId;
          const messageId = item?.dmMessageId;
          if (!channelId || !messageId) continue;
          try {
            const dmChannel = await client.channels.fetch(channelId).catch(() => null);
            if (dmChannel?.messages) {
              const msg = await dmChannel.messages.fetch(messageId).catch(() => null);
              if (msg && msg.author?.id === client.user.id) {
                await msg.delete().catch(() => {});
              }
            }
          } catch (_) {
            // ignore
          }
          await clearTokenDmFields(item.token).catch(() => {});
        }
      } catch (_) {
        // ignore
      }

      const dmMessage = await member.send({
        content: [
          `Hai ${member.user.username}!`,
          'Kami belum mendeteksi bahwa kamu sudah diverifikasi.',
          'Klik tombol di bawah untuk menyelesaikan verifikasi dan mendapatkan akses penuh.',
          '',
          `Kalau tombol tidak muncul, salin tautan ini: ${verificationUrl}`,
        ].join('\n'),
        components: [row],
      });

      if (dmMessage?.channel?.id && dmMessage?.id) {
        await setTokenStatus(tokenDoc.token, 'PENDING', {
          dmChannelId: dmMessage.channel.id,
          dmMessageId: dmMessage.id,
        }).catch(() => {});
      }
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
  if (!message.guild) {
    if (message.author?.bot) return;
    const content = String(message.content || '').trim();
    if (!content) return;

    // Check if user is in voice call (DM voice call)
    const voiceState = message.member?.voice;
    const isInVoiceCall = voiceState?.channel && !voiceState.channel.isVoiceBased();

    if (isInVoiceCall) {
      await handleDMVoiceCallAI(message);
      return;
    }

    // Check for interview answers first
    try {
      const tokenDoc = await findLatestByUserWithStatuses(message.author.id, GUILD_ID, ['INTERVIEW_REQUIRED']);
      if (tokenDoc?.token) {
        const answer = content.slice(0, 1800);
        await setTokenStatus(tokenDoc.token, 'INTERVIEW_ANSWERED', {
          interviewAnswer: answer,
          interviewAnsweredAt: new Date(),
        }).catch(() => {});

        const config = await fetchConfig(GUILD_ID);
        await sendVerificationLog({
          client,
          guildId: GUILD_ID,
          config,
          user: message.author,
          member: null,
          type: 'info',
          status: 'INTERVIEW_ANSWERED',
          riskScore: 0,
          reason: `Token: ${tokenDoc.token}\nInterview answer: ${answer}`,
        });

        await message.reply('Terima kasih! Jawaban interview kamu sudah terkirim ke staf. Tunggu keputusan ya.');
        return;
      }
    } catch (_) {
      null;
    }

    // Handle DM AI chat
    await handleDMChatAI(message);
    return;
  }
  if (!message.guild || message.guild.id !== GUILD_ID) return;
  if (message.author.bot) return;

  const blacklistEnabled = (process.env.BLACKLIST_ENFORCE_DELETE || 'true').toLowerCase() !== 'false';
  if (blacklistEnabled) {
    const entry = await getCachedBlacklistEntry(message.guild.id, message.author.id);
    if (entry) {
      const me = message.guild.members.me || (await message.guild.members.fetchMe().catch(() => null));
      if (me?.permissions?.has?.(PermissionFlagsBits.ManageMessages)) {
        await message.delete().catch(() => {});
      }

      const cooldownMs = Math.max(5_000, Number(process.env.BLACKLIST_ENFORCE_COOLDOWN_MS || 15_000));
      const key = `${message.guild.id}:${message.author.id}`;
      const now = Date.now();
      const next = blacklistEnforcementCooldown.get(key) || 0;
      if (next <= now) {
        blacklistEnforcementCooldown.set(key, now + cooldownMs);
        const member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
        if (member) {
          await enforceBlacklistOnMember({
            guild: message.guild,
            member,
            reason: `blacklisted:${entry.reason || 'unspecified'}`,
          });
        }
      }
      return;
    }
  }

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
    const pool = getPresencePoolForMode(presenceMode);
    const message = pool[presenceIndex % pool.length];

    const activity = {
      name: message,
      type: ActivityType.Playing,
    };

    if (modeHasButtons(presenceMode)) {
      activity.buttons = ['Join Support Server'];
      activity.metadata = { button_urls: [SUPPORT_INVITE_URL] };
      activity.url = SUPPORT_INVITE_URL;
      if (process.env.DISCORD_CLIENT_ID) {
        activity.applicationId = process.env.DISCORD_CLIENT_ID;
      }
    }

    client.user.setPresence({
      activities: [activity],
      status: 'online',
    });
    presenceIndex = (presenceIndex + 1) % pool.length;
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

    if (interaction.inGuild?.() && interaction.guild && interaction.member) {
      let hasNonEveryoneRole = true;
      const roles = interaction.member.roles;
      if (roles?.cache) {
        hasNonEveryoneRole = roles.cache.some((role) => role && role.id && role.id !== interaction.guild.id);
      } else if (Array.isArray(roles)) {
        hasNonEveryoneRole = roles.length > 0;
      }

      if (!hasNonEveryoneRole) {
        const group = interaction.options.getSubcommandGroup(false);
        const sub = interaction.options.getSubcommand(false);
        const isVerifyStart =
          interaction.commandName === 'verify' && !group && (!sub || sub === 'start');

        const isVoiceVerify =
          interaction.commandName === 'voiceverify' && !group && (sub === 'start' || sub === 'stop');

        if (!isVerifyStart && !isVoiceVerify) {
          await interaction.reply({
            content: 'Kamu belum punya role. Silakan jalankan `/verify start` dulu untuk verifikasi.',
            flags: 64,
          });
          return;
        }
      }
    }

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

  const blocking = process.env.COMMAND_REGISTRATION_BLOCKING === 'true';
  if (blocking) {
    await registerApplicationCommands();
  } else {
    registerApplicationCommands().catch((err) => {
      console.error('❌ Registrasi command gagal (async)', err);
    });
  }

  await client.login(process.env.DISCORD_TOKEN);
  return client;
}

module.exports = {
  startBot,
  client,
  registerRecentVerification,
  cancelReminder,
  getPresenceMode,
  setPresenceMode,
  getPresencePoolForMode,
};
