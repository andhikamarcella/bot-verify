const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const {
  findToken,
  listByStatuses,
  setTokenStatus,
  listDmMessagesForGuild,
  clearTokenDmFields,
} = require('../../api/models/Tokens');
const { upsertUserProfile } = require('../../api/models/Users');
const { fetchConfig } = require('../utils/guildConfig');
const { sendVerificationLog } = require('../utils/logging');
const { ensureStaff } = require('../utils/permissions');
const { addToBlacklist } = require('../../api/models/BlacklistedUsers');

const MEMBER_ROLE_ID = process.env.MEMBER_ROLE_ID;

function short(value, max) {
  const s = String(value || '').trim();
  if (!s) return '—';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

async function applyRolesAndNickname({ guild, member, tokenDoc }) {
  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
    throw new Error('bot-missing-manage-roles');
  }

  const roleIds = new Set();
  if (MEMBER_ROLE_ID) roleIds.add(String(MEMBER_ROLE_ID));
  for (const roleId of tokenDoc?.extraRolesEligible || []) {
    if (roleId) roleIds.add(String(roleId));
  }

  for (const roleId of roleIds) {
    if (!member.roles.cache.has(roleId)) {
      await member.roles.add(roleId, 'Application approved').catch(() => {});
    }
  }

  const desiredNick = tokenDoc?.application?.displayName;
  if (desiredNick) {
    await member.setNickname(String(desiredNick).slice(0, 32), 'Application approved').catch(() => {});
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('app')
    .setDescription('Review verification applications (staff only)')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List pending applications')
        .addStringOption((opt) =>
          opt
            .setName('status')
            .setDescription('Filter by status')
            .addChoices(
              { name: 'PENDING_REVIEW', value: 'PENDING_REVIEW' },
              { name: 'INTERVIEW_REQUIRED', value: 'INTERVIEW_REQUIRED' },
              { name: 'INTERVIEW_ANSWERED', value: 'INTERVIEW_ANSWERED' }
            )
        )
        .addIntegerOption((opt) => opt.setName('limit').setDescription('Max results').setMinValue(1).setMaxValue(20))
    )
    .addSubcommand((sub) =>
      sub
        .setName('approve')
        .setDescription('Approve by token (assign Member role)')
        .addStringOption((opt) => opt.setName('token').setDescription('Application token').setRequired(true))
        .addStringOption((opt) => opt.setName('note').setDescription('Staff note'))
    )
    .addSubcommand((sub) =>
      sub
        .setName('reject')
        .setDescription('Reject by token')
        .addStringOption((opt) => opt.setName('token').setDescription('Application token').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('interview')
        .setDescription('Mark as interview required + DM prompt')
        .addStringOption((opt) => opt.setName('token').setDescription('Application token').setRequired(true))
        .addStringOption((opt) => opt.setName('note').setDescription('Staff note'))
    )
    .addSubcommand((sub) =>
      sub
        .setName('ban')
        .setDescription('Blacklist + ban user')
        .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('purge-dm')
        .setDescription('Hapus DM verifikasi lama sampai bersih (staff only)')
        .addUserOption((opt) => opt.setName('user').setDescription('Target user (opsional)').setRequired(false))
        .addIntegerOption((opt) =>
          opt
            .setName('older_than_minutes')
            .setDescription('Hanya hapus DM token yang lebih lama dari X menit (default 15)')
            .setMinValue(0)
            .setMaxValue(60 * 24 * 30)
        )
        .addIntegerOption((opt) =>
          opt
            .setName('limit')
            .setDescription('Batas jumlah token/DM yang diproses (default 100)')
            .setMinValue(1)
            .setMaxValue(500)
        )
    ),

  async execute(interaction, client) {
    try {
      ensureStaff(interaction);
    } catch (_) {
      await interaction.reply({ content: 'Kamu tidak punya izin untuk perintah ini.', flags: 64 });
      return;
    }

    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: 'Command ini hanya bisa dipakai di server.', flags: 64 });
      return;
    }

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: 64 });

    const config = await fetchConfig(guild.id);

    if (sub === 'list') {
      const status = interaction.options.getString('status');
      const limit = interaction.options.getInteger('limit') || 10;
      const statuses = status ? [status] : ['PENDING_REVIEW', 'INTERVIEW_REQUIRED', 'INTERVIEW_ANSWERED'];
      const docs = await listByStatuses(guild.id, statuses, limit);
      if (!docs.length) {
        await interaction.editReply({ content: 'Tidak ada aplikasi.' });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📝 Application Queue')
        .setColor(0x5865f2)
        .setFooter({ text: `Total: ${docs.length}` });

      for (const d of docs.slice(0, 10)) {
        const reason = d.application?.applicationReason || '';
        const len = Number(d.applicationTextLength || reason.length || 0);
        embed.addFields({
          name: `<@${d.userId}> • ${String(d.status)}`,
          value: `len ${len} • token: ${d.token}\n${short(reason, 220)}`,
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (sub === 'ban') {
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason', true);

      await addToBlacklist({
        userId: user.id,
        guildId: guild.id,
        reason,
        addedBy: interaction.user.id,
        scope: 'guild',
      });

      await guild.members.ban(user.id, { reason: `blacklisted:${reason}` }).catch(() => {});

      await sendVerificationLog({
        client,
        guildId: guild.id,
        config,
        user,
        member: null,
        type: 'failure',
        status: 'BLACKLISTED',
        riskScore: 100,
        reason: `Banned + blacklisted by ${interaction.user.tag}: ${reason}`,
        suspectReasons: ['manual-blacklist'],
      });

      await interaction.editReply({ content: `✅ <@${user.id}> diblacklist + diban. (${reason})` });
      return;
    }

    if (sub === 'purge-dm') {
      const targetUser = interaction.options.getUser('user');
      const olderThanMinutes = interaction.options.getInteger('older_than_minutes') ?? 15;
      const limit = interaction.options.getInteger('limit') ?? 100;

      const items = await listDmMessagesForGuild(guild.id, {
        userId: targetUser?.id || null,
        olderThanMinutes,
        limit,
      });

      if (!items.length) {
        await interaction.editReply({ content: 'Tidak ada DM verifikasi yang bisa dihapus.' });
        return;
      }

      let deleted = 0;
      let cleared = 0;
      let skippedNotFound = 0;
      let skippedNotBot = 0;

      for (const doc of items) {
        const channelId = doc?.dmChannelId;
        const messageId = doc?.dmMessageId;
        if (!channelId || !messageId) continue;

        try {
          const dmChannel = await client.channels.fetch(channelId).catch(() => null);
          if (!dmChannel?.messages) {
            skippedNotFound += 1;
            await clearTokenDmFields(doc.token).catch(() => {});
            cleared += 1;
            continue;
          }

          const msg = await dmChannel.messages.fetch(messageId).catch(() => null);
          if (!msg) {
            skippedNotFound += 1;
            await clearTokenDmFields(doc.token).catch(() => {});
            cleared += 1;
            continue;
          }

          if (msg.author?.id && msg.author.id !== client.user.id) {
            skippedNotBot += 1;
            await clearTokenDmFields(doc.token).catch(() => {});
            cleared += 1;
            continue;
          }

          await msg.delete().catch(() => {});
          deleted += 1;

          await clearTokenDmFields(doc.token).catch(() => {});
          cleared += 1;
        } catch (_) {
          // best effort
          await clearTokenDmFields(doc.token).catch(() => {});
          cleared += 1;
        }
      }

      await interaction.editReply({
        content:
          `✅ Purge DM selesai.\n` +
          `Processed: ${items.length}\n` +
          `Deleted: ${deleted}\n` +
          `Cleared DB refs: ${cleared}\n` +
          `Skipped not found: ${skippedNotFound}\n` +
          `Skipped not bot-authored: ${skippedNotBot}`,
      });
      return;
    }

    const token = interaction.options.getString('token', true);
    const tokenDoc = await findToken(token);
    if (!tokenDoc || String(tokenDoc.guildId) !== String(guild.id)) {
      await interaction.editReply({ content: 'Token tidak ditemukan.' });
      return;
    }

    const member = await guild.members.fetch(tokenDoc.userId).catch(() => null);
    const user = member?.user || (await client.users.fetch(tokenDoc.userId).catch(() => null));

    if (sub === 'approve') {
      const note = interaction.options.getString('note') || null;
      if (!member) {
        await interaction.editReply({ content: 'Member tidak ditemukan di guild.' });
        return;
      }

      await applyRolesAndNickname({ guild, member, tokenDoc });

      const now = new Date();
      await setTokenStatus(token, 'VERIFIED', {
        verifiedAt: now,
        reviewedBy: interaction.user.id,
        reviewedAt: now,
        reviewDecision: 'APPROVED',
        reviewNotes: note,
      });

      if (user) {
        await upsertUserProfile({
          userId: tokenDoc.userId,
          guildId: guild.id,
          badgeEmoji: '🛡️',
          badgeName: 'Verified Member',
          suspicious: false,
          avatarUrl: user.displayAvatarURL?.({ size: 256, extension: 'png' }),
          bannerUrl: user.bannerURL?.({ size: 512, extension: 'png' }) || null,
          accentColor: user.accentColor ?? null,
          usernameSnapshot: user.username,
          globalNameSnapshot: user.globalName || null,
          verifiedAt: now,
          country: tokenDoc.application?.country || null,
          riskScore: null,
        });
      }

      await sendVerificationLog({
        client,
        guildId: guild.id,
        config,
        user,
        member,
        type: 'success',
        status: 'APPROVED',
        riskScore: 0,
        reason: note ? `Approved: ${note}` : 'Approved',
      });

      await interaction.editReply({ content: `✅ Approved <@${tokenDoc.userId}>` });
      return;
    }

    if (sub === 'reject') {
      const reason = interaction.options.getString('reason', true);
      await setTokenStatus(token, 'FAILED', {
        reviewedBy: interaction.user.id,
        reviewedAt: new Date(),
        reviewDecision: 'REJECTED',
        reviewNotes: reason,
      });

      if (user) {
        try {
          await user.send(`Aplikasi kamu ditolak. Alasan: ${reason}`);
        } catch (_) {
          null;
        }
      }

      await sendVerificationLog({
        client,
        guildId: guild.id,
        config,
        user,
        member,
        type: 'failure',
        status: 'REJECTED',
        riskScore: 0,
        reason: `Token: ${token}\n${short(reason, 900)}`,
      });

      await interaction.editReply({ content: `✅ Rejected <@${tokenDoc.userId}>` });
      return;
    }

    if (sub === 'interview') {
      const note = interaction.options.getString('note') || null;
      await setTokenStatus(token, 'INTERVIEW_REQUIRED', {
        reviewedBy: interaction.user.id,
        reviewedAt: new Date(),
        reviewDecision: 'INTERVIEW',
        reviewNotes: note,
        interviewQuestionSentAt: new Date(),
      });

      if (user) {
        try {
          await user.send(
            [
              'Staf meminta interview singkat untuk aplikasi kamu.',
              'Balas DM ini dengan alasan join yang lebih lengkap (minimal 100 karakter).',
            ].join('\n')
          );
        } catch (_) {
          null;
        }
      }

      await sendVerificationLog({
        client,
        guildId: guild.id,
        config,
        user,
        member,
        type: 'info',
        status: 'INTERVIEW_REQUIRED',
        riskScore: 0,
        reason: `Token: ${token}${note ? `\nNote: ${short(note, 900)}` : ''}`,
      });

      await interaction.editReply({ content: `✅ Marked interview for <@${tokenDoc.userId}>` });
      return;
    }

    await interaction.editReply({ content: 'Subcommand tidak dikenali.' });
  },
};
