const crypto = require('crypto');
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const { connectMongo } = require('../../api/lib/db');
const {
  createTokenDocument,
  findLatestByUser,
  listDmMessagesForUser,
  setTokenStatus,
  clearTokenDmFields,
} = require('../../api/models/Tokens');
const { getExtraRolesForUser } = require('../../api/lib/roleSync');
const { fetchConfig, updateConfig } = require('../utils/guildConfig');
const { shouldRateLimit } = require('../utils/rateLimiter');
const {
  getVerificationProfile,
  upsertVerificationProfile,
} = require('../../api/models/VerificationProfiles');
const { getUserProfile, clearUserVerification } = require('../../api/models/Users');
const { insertHistoryEntry, getHistoryForUser } = require('../../api/models/VerificationHistory');
const { sendVerificationLog } = require('../utils/logging');
const { describeRisk } = require('../../api/lib/riskScore');
const { getBlacklistEntry } = require('../../api/models/BlacklistedUsers');
const {
  ensureStaff,
  isStaff,
  isMemberOrHigher,
  hasNonEveryoneRole,
  isStaffMember,
} = require('../utils/permissions');

const FRONTEND_BASE = (process.env.PUBLIC_FRONTEND_URL || '').replace(/\/$/, '');
const MEMBER_ROLE_ID = process.env.MEMBER_ROLE_ID;

async function ensureMongo() {
  await connectMongo();
}

function ensureAdmin(interaction) {
  ensureStaff(interaction);
}

async function sendVerificationDm(user, url) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Verify Me').setStyle(ButtonStyle.Link).setURL(url)
  );
  const message = await user.send({
    content: [
      'Halo! Klik tombol di bawah untuk memulai verifikasi.',
      '',
      'Kalau tombol tidak muncul / tidak bisa diklik, gunakan link ini:',
      url,
    ].join('\n'),
    components: [row],
  });
  return message;
}

async function handleStart(interaction) {
  const blacklistEntry = await getBlacklistEntry(interaction.user.id, interaction.guildId).catch(() => null);
  if (blacklistEntry) {
    const blacklistedMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (blacklistedMember) {
      await blacklistedMember.kick(`Blacklisted: ${blacklistEntry.reason || 'unspecified'}`).catch(() => {});
    }
    try {
      if (typeof interaction.deferUpdate === 'function' && interaction.isButton?.()) {
        await interaction.deferUpdate().catch(() => {});
      } else {
        await interaction.reply({ content: ' ', flags: 64 });
        await interaction.deleteReply().catch(() => {});
      }
    } catch (_) {
      // ignore
    }
    return;
  }

  if (!FRONTEND_BASE) {
    await interaction.reply({
      content: 'Konfigurasi FRONTEND belum tersedia. Hubungi admin.',
      flags: 64,
    });
    return;
  }

  const currentMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (currentMember) {
    if (isStaffMember(currentMember)) {
      await interaction.reply({
        content: 'Kamu staff/admin, verifikasi tidak diperlukan.',
        flags: 64,
      });
      return;
    }
    if (hasNonEveryoneRole(currentMember)) {
      await interaction.reply({
        content: 'Kamu sudah punya role di server, verifikasi tidak diperlukan.',
        flags: 64,
      });
      return;
    }
  }
  if (shouldRateLimit(interaction.user.id, `verify-start:${interaction.guildId}`, 30 * 1000)) {
    await interaction.reply({
      content: 'Tolong tunggu sebentar sebelum meminta link verifikasi lagi.',
      flags: 64,
    });
    return;
  }

  await ensureMongo();
  const extraRoles = await getExtraRolesForUser(interaction.client, interaction.user.id);
  const token = crypto.randomUUID();
  await createTokenDocument({
    token,
    userId: interaction.user.id,
    guildId: interaction.guildId,
    roleId: MEMBER_ROLE_ID,
    status: 'PENDING',
    extraRolesEligible: extraRoles,
    createdAt: new Date(),
  });
  await upsertVerificationProfile({
    userId: interaction.user.id,
    guildId: interaction.guildId,
    incrementAttempts: true,
  });
  const verifyUrl = `${FRONTEND_BASE}/verify?token=${token}`;

  try {
    const oldMessages = await listDmMessagesForUser(interaction.user.id, interaction.guildId, 25).catch(() => []);
    for (const item of oldMessages) {
      const channelId = item?.dmChannelId;
      const messageId = item?.dmMessageId;
      if (!channelId || !messageId) continue;
      try {
        const dmChannel = await interaction.client.channels.fetch(channelId).catch(() => null);
        if (dmChannel?.messages) {
          const msg = await dmChannel.messages.fetch(messageId).catch(() => null);
          if (msg && msg.author?.id === interaction.client.user.id) {
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

  try {
    const dmMessage = await sendVerificationDm(interaction.user, verifyUrl);
    if (dmMessage?.channel?.id && dmMessage?.id) {
      await setTokenStatus(token, 'PENDING', {
        dmChannelId: dmMessage.channel.id,
        dmMessageId: dmMessage.id,
      }).catch(() => {});
    }
  } catch (err) {
    console.error('Gagal mengirim DM verifikasi', err);
    await interaction.reply({
      content:
        'Tidak dapat mengirim DM. Tolong buka DM kamu dan jalankan /verify start lagi atau gunakan panel verifikasi.',
      flags: 64,
    });
    return;
  }

  await interaction.reply({
    content: 'Link verifikasi sudah dikirim ke DM kamu. Cek DM ya! ✅',
    flags: 64,
  });
}

async function buildStatusEmbed(interaction, targetUserId) {
  await ensureMongo();
  const profile = await getUserProfile(targetUserId, interaction.guildId);
  const verificationProfile = await getVerificationProfile(targetUserId, interaction.guildId);
  const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);

  const nickname = member?.displayName || null;

  const riskScore = verificationProfile?.riskScore ?? 0;
  const riskInfo = describeRisk(riskScore);

  const embed = new EmbedBuilder()
    .setTitle('Status Verifikasi')
    .setColor(
      riskInfo.label === 'HIGH' ? 0xed4245 : riskInfo.label === 'MEDIUM' ? 0xfaa61a : 0x57f287
    );

  if (nickname) {
    embed.addFields({ name: 'Nickname', value: nickname, inline: true });
  }

  const accountCreatedAt =
    verificationProfile?.accountCreatedAt || member?.user?.createdAt || profile?.verifiedAt || null;
  let accountAgeDays = null;
  if (accountCreatedAt) {
    const diff = Date.now() - new Date(accountCreatedAt).getTime();
    accountAgeDays = Math.max(Math.floor(diff / (1000 * 60 * 60 * 24)), 0);
  }

  if (profile) {
    embed.setDescription(`<@${targetUserId}> sudah diverifikasi.`);
    embed.addFields(
      { name: 'Badge', value: `${profile.badgeEmoji || '🛡️'} ${profile.badgeName || 'Verified Member'}`, inline: true },
      {
        name: 'Verified At',
        value: profile.verifiedAt ? new Date(profile.verifiedAt).toISOString() : '—',
        inline: true,
      }
    );
    if (profile.country) {
      embed.addFields({ name: 'Country', value: profile.country, inline: true });
    }
  } else {
    embed.setDescription(`<@${targetUserId}> belum diverifikasi.`);
  }

  if (accountAgeDays !== null) {
    embed.addFields({ name: 'Account Age', value: `${accountAgeDays} hari`, inline: true });
  }

  embed.addFields({
    name: 'Risk',
    value: `${riskInfo.emoji} ${riskInfo.text} (${riskScore})`,
    inline: true,
  });

  const isSuspect = Boolean(verificationProfile?.isSuspect || verificationProfile?.suspectReasons?.length);
  embed.addFields({ name: 'Suspect?', value: isSuspect ? 'YES 🚨' : 'No', inline: true });

  if (verificationProfile?.suspectReasons?.length) {
    embed.addFields({
      name: 'Flags',
      value: verificationProfile.suspectReasons.join(', '),
      inline: false,
    });
  }

  embed.setFooter({ text: `User ID: ${targetUserId}` });
  return embed;
}

async function handleStatus(interaction) {
  const target = interaction.options.getUser('target') || interaction.user;
  if (target.id !== interaction.user.id && !isMemberOrHigher(interaction) && !isStaff(interaction)) {
    await interaction.reply({ content: 'Kamu tidak punya izin untuk cek status user lain.', flags: 64 });
    return;
  }
  const embed = await buildStatusEmbed(interaction, target.id);
  await interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleReset(interaction, client) {
  ensureAdmin(interaction);
  const target = interaction.options.getUser('target');
  if (!target) {
    await interaction.reply({ content: 'Kamu harus memilih user.', flags: 64 });
    return;
  }

  await ensureMongo();
  const guild = await client.guilds.fetch(interaction.guildId);
  const member = await guild.members.fetch(target.id).catch(() => null);
  if (member && MEMBER_ROLE_ID && member.roles.cache.has(MEMBER_ROLE_ID)) {
    try {
      await member.roles.remove(MEMBER_ROLE_ID, 'Verification reset via command');
    } catch (err) {
      console.warn('Gagal menghapus role saat reset', err?.message);
    }
  }

  const latest = await findLatestByUser(target.id, interaction.guildId);
  if (latest) {
    await setTokenStatus(latest.token, 'FAILED', { failureReason: 'manual-reset' }).catch(() => {});
  }
  await clearUserVerification(target.id, interaction.guildId);
  const verificationProfile = await getVerificationProfile(target.id, interaction.guildId);
  const riskScore = verificationProfile?.riskScore ?? 0;
  await insertHistoryEntry({
    userId: target.id,
    guildId: interaction.guildId,
    status: 'reset',
    reason: `Reset by ${interaction.user.id}`,
    riskScore,
  });

  const config = await fetchConfig(interaction.guildId);
  await sendVerificationLog({
    client,
    guildId: interaction.guildId,
    config,
    user: target,
    member,
    type: 'failure',
    status: 'RESET',
    riskScore,
    reason: `Verification reset oleh ${interaction.user.tag}`,
  });

  await interaction.reply({
    content: `Status verifikasi <@${target.id}> telah direset.`,
    flags: 64,
  });
}

async function handleHistory(interaction) {
  ensureAdmin(interaction);
  const target = interaction.options.getUser('target');
  if (!target) {
    await interaction.reply({ content: 'Kamu harus memilih user.', flags: 64 });
    return;
  }
  await ensureMongo();
  const entries = await getHistoryForUser(target.id, interaction.guildId, 10);
  if (!entries.length) {
    await interaction.reply({ content: 'Belum ada riwayat.', flags: 64 });
    return;
  }
  const lines = entries.map((entry) => {
    const reasonText = entry.reason ? ` — ${entry.reason}` : '';
    return `• ${new Date(entry.createdAt).toISOString()} — ${entry.status.toUpperCase()} (risk ${
      entry.riskScore ?? 'n/a'
    })${reasonText}`;
  });
  await interaction.reply({ content: lines.join('\n'), flags: 64 });
}

async function handlePanelCreate(interaction) {
  ensureAdmin(interaction);
  const targetChannel = interaction.options.getChannel('channel');
  if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: 'Pilih channel text.', flags: 64 });
    return;
  }
  if (!FRONTEND_BASE) {
    await interaction.reply({ content: 'PUBLIC_FRONTEND_URL belum diset.', flags: 64 });
    return;
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify:panel:start')
      .setLabel('Start Verification')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('verify:panel:help').setLabel('Help').setStyle(ButtonStyle.Secondary)
  );

  const embed = new EmbedBuilder()
    .setTitle('🛡️ Server Verification')
    .setColor(0x5865f2)
    .setDescription(
      [
        'Selamat datang! Klik tombol **Start Verification** untuk membuka portal verifikasi.',
        'Bot akan mengirim link unik ke DM kamu dan meminta kamu menyelesaikan captcha.',
        '',
        'Kalau butuh bantuan, gunakan tombol **Help** atau jalankan `/help`.',
      ].join('\n')
    )
    .setFooter({ text: 'Gunakan tombol di bawah ini untuk mendapatkan akses Member.' });

  const message = await targetChannel.send({
    embeds: [embed],
    components: [row],
  });
  await updateConfig(interaction.guildId, {
    panelChannelId: targetChannel.id,
    panelMessageId: message.id,
  });
  await interaction.reply({
    content: `Panel verifikasi dikirim ke <#${targetChannel.id}>.`,
    flags: 64,
  });
}

async function handleDebug(interaction, client) {
  ensureAdmin(interaction);
  await ensureMongo();
  const config = await fetchConfig(interaction.guildId);
  const guild = await client.guilds.fetch(interaction.guildId);
  const me = await guild.members.fetch(client.user.id);
  const checks = [
    { name: 'MongoDB', value: '✅ Terhubung' },
    { name: 'Logs Channel', value: config.logsChannelId ? `✅ <#${config.logsChannelId}>` : '⚠️ belum diset' },
    { name: 'Manage Roles', value: me.permissions.has(PermissionFlagsBits.ManageRoles) ? '✅' : '❌' },
    { name: 'Member Role', value: MEMBER_ROLE_ID ? `ID: ${MEMBER_ROLE_ID}` : '❌ belum diisi' },
  ];
  const embed = new EmbedBuilder()
    .setTitle('Verification Debug')
    .setColor(0x5865f2)
    .addFields(checks)
    .setTimestamp(new Date());
  await interaction.reply({ embeds: [embed], flags: 64 });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Mulai verifikasi atau kelola sistem verifikasi')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('start')
        .setDescription('Kirim tautan verifikasi ke DM kamu')
    )
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Lihat status verifikasi')
        .addUserOption((option) => option.setName('target').setDescription('User yang ingin dicek'))
    )
    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription('Reset status verifikasi seorang member')
        .addUserOption((option) => option.setName('target').setDescription('User yang akan direset').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('history')
        .setDescription('Lihat riwayat verifikasi')
        .addUserOption((option) => option.setName('target').setDescription('User yang ingin dicek').setRequired(true))
    )
    .addSubcommandGroup((group) =>
      group
        .setName('panel')
        .setDescription('Kelola panel verifikasi')
        .addSubcommand((sub) =>
          sub
            .setName('create')
            .setDescription('Kirim panel verifikasi ke sebuah channel')
            .addChannelOption((option) =>
              option
                .setName('channel')
                .setDescription('Channel tujuan panel')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
            )
        )
    )
    .addSubcommand((sub) =>
      sub.setName('debug').setDescription('Periksa konfigurasi dan perizinan bot')
    ),

  async execute(interaction, client) {
    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand(false);

    try {
      if (subcommandGroup === 'panel') {
        await handlePanelCreate(interaction);
        return;
      }

      switch (subcommand) {
        case 'start':
        case null:
          await handleStart(interaction);
          break;
        case 'status':
          await handleStatus(interaction);
          break;
        case 'reset':
          await handleReset(interaction, client);
          break;
        case 'history':
          await handleHistory(interaction);
          break;
        case 'debug':
          await handleDebug(interaction, client);
          break;
        default:
          await interaction.reply({ content: 'Subcommand tidak dikenal.', flags: 64 });
      }
    } catch (error) {
      if (error.message === 'no-permission') {
        await interaction.reply({ content: 'Kamu tidak punya izin untuk perintah ini.', flags: 64 });
        return;
      }
      console.error('verify command error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'Terjadi kesalahan saat memproses perintah.',
          flags: 64,
        });
      }
    }
  },
};

module.exports.handleStart = handleStart;
