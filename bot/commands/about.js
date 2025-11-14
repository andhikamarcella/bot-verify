const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const pkg = require('../../package.json');

const INVITE_URL = 'https://discord.gg/w3ENr2uEeH';

module.exports = {
  data: new SlashCommandBuilder().setName('about').setDescription('Informasi tentang bot verifikasi ini'),

  async execute(interaction, client) {
    const uptimeMs = client.uptime || 0;
    const uptimeHours = (uptimeMs / (1000 * 60 * 60)).toFixed(2);
    const embed = new EmbedBuilder()
      .setTitle('ℹ️ Tentang Bot Verifikasi')
      .setColor(0x5865f2)
      .setDescription('Bot keamanan & verifikasi untuk komunitas Discord kamu.')
      .addFields(
        { name: 'Versi', value: pkg.version ? `v${pkg.version}` : 'development', inline: true },
        { name: 'Websocket Ping', value: `${Math.round(client.ws.ping)}ms`, inline: true },
        { name: 'Uptime', value: `${uptimeHours} jam`, inline: true },
        {
          name: 'Jelajahi Lebih Lanjut',
          value: [`• Gunakan \`/help\` untuk daftar perintah`, `• Server resmi: ${INVITE_URL}`].join('\n'),
        }
      )
      .setFooter({ text: `Terhubung ke ${client.guilds.cache.size} guild` });

    await interaction.reply({ embeds: [embed], flags: 64 });
  },
};
