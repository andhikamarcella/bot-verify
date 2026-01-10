const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Lihat info user & nickname')
    .setDMPermission(false)
    .addUserOption((option) =>
      option.setName('target').setDescription('User yang ingin dicek (opsional)')
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('target') || interaction.user;
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    const displayName = member?.displayName || target.username;
    const joinedAtText = member?.joinedAt ? new Date(member.joinedAt).toLocaleString() : '—';
    const createdAtText = target.createdAt ? new Date(target.createdAt).toLocaleString() : '—';

    const embed = new EmbedBuilder()
      .setTitle('User Info')
      .setColor(0x5865f2)
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'User', value: `<@${target.id}>`, inline: true },
        { name: 'Username', value: target.tag || target.username, inline: true },
        { name: 'Nickname', value: displayName, inline: true },
        { name: 'Account Created', value: createdAtText, inline: true },
        { name: 'Joined Server', value: joinedAtText, inline: true },
        { name: 'User ID', value: target.id, inline: false }
      );

    await interaction.reply({ embeds: [embed], flags: 64 });
  },
};
