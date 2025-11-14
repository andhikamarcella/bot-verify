const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Tampilkan daftar perintah utama untuk bot verifikasi'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('📘 Panduan Singkat Bot Verifikasi')
      .setColor(0x5865f2)
      .setDescription('Gunakan daftar perintah berikut untuk mengelola proses verifikasi dan keamanan server kamu:')
      .addFields(
        {
          name: 'Verifikasi Pengguna',
          value:
            '`/verify start` • Kirim tautan verifikasi\n' +
            '`/verify status` • Cek status verifikasi\n' +
            '`/verify history` • Lihat riwayat verifikasi\n' +
            '`/verify panel create` • Kirim panel tombol verifikasi',
        },
        {
          name: 'Pengaturan Server',
          value:
            '`/settings show` • Lihat konfigurasi saat ini\n' +
            '`/settings set-logs-channel` • Ubah channel log\n' +
            '`/settings toggle-media-restriction` • Batasi media sebelum verifikasi',
        },
        {
          name: 'Keamanan & Admin',
          value:
            '`/blacklist ...` • Kelola daftar blacklist\n' +
            '`/admin suspect|trust|risk` • Tandai atau nilai ulang risiko akun\n' +
            '`/whois` • Lihat detail verifikasi cepat',
        },
        {
          name: 'Info Bot',
          value: ['`/about` • Info bot & tautan server resmi', '`/ping` • Cek latensi bot'].join('\n'),
        }
      );

    await interaction.reply({ embeds: [embed], flags: 64 });
  },
};
