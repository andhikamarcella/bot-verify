const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { connectMongo } = require('../../api/lib/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whois')
    .setDescription('Lihat status verifikasi seorang member')
    .addUserOption((option) =>
      option.setName('target').setDescription('Member yang ingin dicek').setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('target');

    try {
      const db = await connectMongo();
      const profile = await db.collection('users').findOne({
        userId: target.id,
        guildId: process.env.GUILD_ID,
      });

      const badgeEmoji = profile?.badgeEmoji || '❌';
      const badgeName = profile?.badgeName || 'Not Verified';
      const verifiedAtText = profile?.verifiedAt
        ? new Date(profile.verifiedAt).toLocaleString()
        : '—';
      const suspiciousText = profile?.suspicious ? 'YES 🚨' : 'No';
      const thumbnailUrl = profile?.avatarUrl || target.displayAvatarURL({ size: 256 });
      const color = profile?.accentColor || 0x5865f2;

      const embed = new EmbedBuilder()
        .setTitle(`${target.username}'s Verification Info`)
        .setThumbnail(thumbnailUrl)
        .setColor(color)
        .addFields(
          { name: 'Badge', value: `${badgeEmoji} ${badgeName}`, inline: true },
          { name: 'Verified At', value: verifiedAtText, inline: true },
          { name: 'Suspicious?', value: suspiciousText, inline: true }
        )
        .setFooter({ text: `User ID: ${target.id}` });

      if (profile?.bannerUrl) {
        embed.setImage(profile.bannerUrl);
      }

      await interaction.reply({
        embeds: [embed],
        flags: 64,
      });
    } catch (error) {
      console.error('whois command error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'Gagal mengambil data pengguna.',
          flags: 64,
        });
      }
    }
  },
};
