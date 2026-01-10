const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { connectMongo } = require('../../api/lib/db');
const { getUserProfile } = require('../../api/models/Users');
const { getVerificationProfile } = require('../../api/models/VerificationProfiles');
const { describeRisk } = require('../../api/lib/riskScore');
const { ensureMemberOrHigher } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Lihat ringkasan status verifikasi & risk kamu')
    .setDMPermission(false),

  async execute(interaction) {
    try {
      ensureMemberOrHigher(interaction);
    } catch (_) {
      await interaction.reply({
        content: 'Fitur ini hanya untuk user yang sudah memiliki role Member.',
        flags: 64,
      });
      return;
    }

    await connectMongo();

    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    const [profile, verificationProfile, member] = await Promise.all([
      getUserProfile(userId, guildId).catch(() => null),
      getVerificationProfile(userId, guildId).catch(() => null),
      interaction.guild.members.fetch(userId).catch(() => null),
    ]);

    const nickname = member?.displayName || null;
    const riskScore = verificationProfile?.riskScore ?? profile?.riskScore ?? 0;
    const riskInfo = describeRisk(riskScore);

    const embed = new EmbedBuilder()
      .setTitle('Profil Verifikasi')
      .setColor(
        riskInfo.label === 'HIGH' ? 0xed4245 : riskInfo.label === 'MEDIUM' ? 0xfaa61a : 0x57f287
      )
      .setDescription(`Ringkasan untuk <@${userId}>`)
      .addFields(
        { name: 'Nickname', value: nickname || '—', inline: true },
        { name: 'Status', value: profile?.verifiedAt ? 'VERIFIED ✅' : 'BELUM VERIFIED', inline: true },
        {
          name: 'Risk',
          value: `${riskInfo.emoji} ${riskInfo.text} (${riskScore})`,
          inline: true,
        },
        {
          name: 'Attempts',
          value: String(verificationProfile?.attempts ?? 0),
          inline: true,
        },
        {
          name: 'Last Seen',
          value: verificationProfile?.lastSeenAt ? new Date(verificationProfile.lastSeenAt).toLocaleString() : '—',
          inline: true,
        }
      )
      .setFooter({ text: `User ID: ${userId}` });

    await interaction.reply({ embeds: [embed], flags: 64 });
  },
};
