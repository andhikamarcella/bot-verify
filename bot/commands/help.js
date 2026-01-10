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
            '`/verify status [user]` • Cek status & risiko verifikasi\n' +
            '`/verify history <user>` • Lihat riwayat verifikasi\n' +
            '`/verify reset <user>` • Reset status verifikasi\n' +
            '`/verify panel create <channel>` • Kirim panel tombol verifikasi\n' +
            '`/verify debug` • Diagnosa cepat konfigurasi bot',
        },
        {
          name: 'Fitur Member',
          value:
            '`/profile` • Ringkasan status verifikasi & risk kamu\n' +
            '`/mystats` • Riwayat verifikasi kamu',
        },
        {
          name: 'Pengaturan Server',
          value:
            '`/settings show` • Lihat konfigurasi saat ini\n' +
            '`/settings set-logs-channel <channel>` • Ubah channel log\n' +
            '`/settings set-min-account-age <days>` • Atur umur akun minimal\n' +
            '`/settings toggle-media-restriction <on|off>` • Batasi media sebelum verifikasi\n' +
            '`/settings toggle-reminder <on|off>` • Atur DM reminder\n' +
            '`/settings set-reminder-delay <minutes>` • Ubah jeda pengingat\n' +
            '`/settings toggle-auto-nickname <on|off>` • Sinkronisasi nickname otomatis\n' +
            '`/settings set-nickname-template <template>` • Kustom template nickname\n' +
            '`/settings add/remove-forbidden-name <pattern>` • Kelola pola nama terlarang',
        },
        {
          name: 'Keamanan & Admin',
          value:
            '`/blacklist add|remove|list` • Kelola daftar blacklist\n' +
            '`/admin suspect|trust|risk <user>` • Tandai atau nilai ulang risiko akun\n' +
            '`/whois <user>` • Lihat detail verifikasi cepat dengan badge & risiko\n' +
            '`/rpc mode <default|games>` • (Staff) Ganti status playing bot',
        },
        {
          name: 'Info Bot',
          value:
            '`/help` • Tampilkan panduan ini\n' +
            '`/about` • Info bot & tautan server resmi\n' +
            '`/ping` • Cek latensi bot\n' +
            '`/userinfo [user]` • Lihat info user & nickname',
        }
      );

    await interaction.reply({ embeds: [embed], flags: 64 });
  },
};
