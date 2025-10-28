const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const client = require('../discordClient');
const { findLatestByUser } = require('../../api/models/Tokens');
const { getUserProfile } = require('../../api/models/Users');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whois')
    .setDescription('Lihat status verifikasi seorang member')
    .addUserOption((option) =>
      option.setName('member').setDescription('Member yang ingin dicek').setRequired(true)
    ),
  async execute(interaction) {
    const target = interaction.options.getUser('member');
    try {
      const guild = interaction.guild || (await client.guilds.fetch(process.env.GUILD_ID));
      await guild.members.fetch(target.id);
    } catch (error) {
      await interaction.reply({
        content: 'Member tidak ditemukan di server ini.',
        flags: 64,
      });
      return;
    }

    const tokenDoc = await findLatestByUser(target.id);
    const profile = await getUserProfile(target.id, process.env.GUILD_ID);

    const embed = new EmbedBuilder()
      .setTitle(`Profil ${target.username}`)
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .setColor((profile?.accentColor as number | undefined) || 0x5865f2)
      .addFields([
        {
          name: 'Badge',
          value: profile?.badgeEmoji ? `${profile.badgeEmoji} ${profile.badgeName}` : 'Belum diverifikasi',
          inline: true,
        },
        {
          name: 'Status',
          value: tokenDoc?.status || 'unknown',
          inline: true,
        },
      ]);

    if (profile?.bannerUrl) {
      embed.setImage(profile.bannerUrl);
    }

    await interaction.reply({
      embeds: [embed],
      flags: 64,
    });
  },
};
