const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const SUPPORT_INVITE_URL = 'https://discord.gg/w3ENr2uEeH';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('support')
    .setDescription('Get the official support server invite'),

  async execute(interaction) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('Support Server')
        .setDescription(
          [
            'Perlu bantuan dengan proses verifikasi atau konfigurasi bot?',
            'Gabung ke server resmi kami melalui tautan di bawah ini.',
          ].join('\n')
        )
        .setColor(0x5865f2)
        .setURL(SUPPORT_INVITE_URL);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel('Join Support Server')
          .setURL(SUPPORT_INVITE_URL)
      );

      await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
    } catch (error) {
      console.error('Failed to execute /support command', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'Tidak dapat mengirim tautan support saat ini.',
          flags: 64,
        });
      }
    }
  },
};
