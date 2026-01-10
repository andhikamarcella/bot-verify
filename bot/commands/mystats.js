const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { connectMongo } = require('../../api/lib/db');
const { getHistoryForUser } = require('../../api/models/VerificationHistory');
const { ensureMemberOrHigher } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mystats')
    .setDescription('Lihat ringkasan riwayat verifikasi kamu')
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
    const entries = await getHistoryForUser(userId, guildId, 10);

    const embed = new EmbedBuilder()
      .setTitle('Riwayat Verifikasi Kamu')
      .setColor(0x5865f2);

    if (!entries.length) {
      embed.setDescription('Belum ada riwayat verifikasi yang tersimpan.');
      await interaction.reply({ embeds: [embed], flags: 64 });
      return;
    }

    const lines = entries.map((entry) => {
      const time = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—';
      const status = String(entry.status || '').toUpperCase();
      const risk = entry.riskScore ?? 'n/a';
      const reason = entry.reason ? ` — ${entry.reason}` : '';
      return `${time} — ${status} (risk ${risk})${reason}`;
    });

    embed.setDescription(lines.join('\n'));
    await interaction.reply({ embeds: [embed], flags: 64 });
  },
};
