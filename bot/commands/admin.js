const {
  SlashCommandBuilder,
  EmbedBuilder,
} = require('discord.js');
const {
  getVerificationProfile,
  upsertVerificationProfile,
  setRiskScore,
} = require('../../api/models/VerificationProfiles');
const { getBlacklistEntry } = require('../../api/models/BlacklistedUsers');
const { computeRiskScore, describeRisk } = require('../../api/lib/riskScore');
const { insertHistoryEntry } = require('../../api/models/VerificationHistory');
const { fetchConfig } = require('../utils/guildConfig');
const { sendVerificationLog } = require('../utils/logging');
const { ensureStaff } = require('../utils/permissions');

function ensureAdmin(interaction) {
  ensureStaff(interaction);
}

function accountAgeDaysFrom(profile, member, user) {
  const createdAt = profile?.accountCreatedAt || member?.user?.createdAt || user?.createdAt;
  if (!createdAt) return 0;
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.max(ms / (1000 * 60 * 60 * 24), 0);
}

async function recomputeRisk({ userId, guildId, profile, member, blacklistEntry, user }) {
  const suspectReasons = profile?.suspectReasons || [];
  const accountAgeDays = accountAgeDaysFrom(profile, member, user);
  const score = computeRiskScore({
    accountAgeDays,
    blacklisted: Boolean(blacklistEntry),
    suspectReasons,
    failedAttempts: profile?.attempts || 0,
  });
  await setRiskScore(userId, guildId, score);
  return score;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Alat bantu admin untuk profiling risiko verifikasi')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('suspect')
        .setDescription('Tandai pengguna sebagai suspect')
        .addUserOption((option) => option.setName('user').setDescription('User yang ditandai').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Catatan tambahan'))
    )
    .addSubcommand((sub) =>
      sub
        .setName('trust')
        .setDescription('Hapus flag suspect dan tandai sebagai trusted')
        .addUserOption((option) => option.setName('user').setDescription('User yang diubah statusnya').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('risk')
        .setDescription('Hitung ulang risk score untuk seorang user')
        .addUserOption((option) => option.setName('user').setDescription('User yang dicek').setRequired(true))
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    try {
      ensureAdmin(interaction);
      const target = interaction.options.getUser('user');
      const guild = await client.guilds.fetch(interaction.guildId);
      const member = await guild.members.fetch(target.id).catch(() => null);
      const profile = await getVerificationProfile(target.id, interaction.guildId);
      const blacklistEntry = await getBlacklistEntry(target.id, interaction.guildId);
      const config = await fetchConfig(interaction.guildId);

      if (sub === 'suspect') {
        const manualReason = interaction.options.getString('reason') || 'manual-suspect';
        const reasons = new Set(profile?.suspectReasons || []);
        reasons.add('MANUAL_SUSPECT');
        reasons.add(manualReason);

        const updatedProfile = {
          ...(profile || {}),
          suspectReasons: Array.from(reasons),
          accountCreatedAt: profile?.accountCreatedAt || member?.user?.createdAt || null,
        };

        await upsertVerificationProfile({
          userId: target.id,
          guildId: interaction.guildId,
          isSuspect: true,
          suspectReasons: Array.from(reasons),
          accountCreatedAt: profile?.accountCreatedAt || member?.user?.createdAt || null,
        });
        const score = await recomputeRisk({
          userId: target.id,
          guildId: interaction.guildId,
          profile: updatedProfile,
          member,
          blacklistEntry,
          user: target,
        });
        await insertHistoryEntry({
          userId: target.id,
          guildId: interaction.guildId,
          status: 'failed',
          reason: `manual-suspect:${manualReason}`,
          riskScore: score,
        });
        await sendVerificationLog({
          client,
          guildId: interaction.guildId,
          config,
          user: target,
          member,
          type: 'failure',
          status: 'FLAGGED',
          riskScore: score,
          suspectReasons: Array.from(reasons),
          reason: `Manual suspect oleh ${interaction.user.tag}: ${manualReason}`,
        });
        await interaction.reply({
          content: `✅ <@${target.id}> ditandai sebagai suspect (risk ${score}).`,
          flags: 64,
        });
        return;
      }

      if (sub === 'trust') {
        const remaining = new Set(profile?.suspectReasons || []);
        remaining.delete('MANUAL_SUSPECT');
        const updatedReasons = Array.from(remaining).filter((item) => !item?.startsWith('manual-suspect'));

        const updatedProfile = {
          ...(profile || {}),
          suspectReasons: updatedReasons,
          isSuspect: false,
          accountCreatedAt: profile?.accountCreatedAt || member?.user?.createdAt || null,
        };

        await upsertVerificationProfile({
          userId: target.id,
          guildId: interaction.guildId,
          isSuspect: false,
          suspectReasons: updatedReasons,
          accountCreatedAt: profile?.accountCreatedAt || member?.user?.createdAt || null,
        });
        const score = await recomputeRisk({
          userId: target.id,
          guildId: interaction.guildId,
          profile: updatedProfile,
          member,
          blacklistEntry,
          user: target,
        });
        await insertHistoryEntry({
          userId: target.id,
          guildId: interaction.guildId,
          status: 'reset',
          reason: 'manual-trust',
          riskScore: score,
        });
        await sendVerificationLog({
          client,
          guildId: interaction.guildId,
          config,
          user: target,
          member,
          type: 'success',
          status: 'TRUSTED',
          riskScore: score,
          suspectReasons: updatedReasons,
          reason: `Manual trust oleh ${interaction.user.tag}`,
        });
        await interaction.reply({
          content: `🟢 <@${target.id}> ditandai sebagai trusted (risk ${score}).`,
          flags: 64,
        });
        return;
      }

      // risk subcommand
      const score = await recomputeRisk({
        userId: target.id,
        guildId: interaction.guildId,
        profile,
        member,
        blacklistEntry,
        user: target,
      });
      const riskInfo = describeRisk(score);
      const embed = new EmbedBuilder()
        .setTitle('Risk Assessment')
        .setColor(riskInfo.label === 'HIGH' ? 0xed4245 : riskInfo.label === 'MEDIUM' ? 0xfaa61a : 0x57f287)
        .setDescription(`Risk untuk <@${target.id}>: ${riskInfo.emoji} ${riskInfo.text}`)
        .addFields(
          { name: 'Skor', value: String(score), inline: true },
          { name: 'Flags', value: profile?.suspectReasons?.join(', ') || '—', inline: false }
        )
        .setFooter({ text: `Diminta oleh ${interaction.user.tag}` });

      await interaction.reply({ embeds: [embed], flags: 64 });
    } catch (error) {
      if (error.message === 'no-permission') {
        await interaction.reply({ content: 'Kamu tidak punya izin untuk perintah ini.', flags: 64 });
        return;
      }
      console.error('admin command error', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Terjadi kesalahan saat menjalankan perintah admin.', flags: 64 });
      }
    }
  },
};
