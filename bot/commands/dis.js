const { SlashCommandBuilder } = require('discord.js');
const { ensureStaff } = require('../utils/permissions');

// Shared connection map is stored on globalThis to allow reuse across command modules
if (!globalThis.__voiceConnections) {
  globalThis.__voiceConnections = new Map();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dis')
    .setDescription('Disconnect bot from voice channel (staff only)')
    .setDMPermission(false),

  async execute(interaction) {
    try {
      ensureStaff(interaction);
    } catch (_) {
      await interaction.reply({ content: 'Kamu tidak punya izin untuk perintah ini.', flags: 64 });
      return;
    }

    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: 'Command ini hanya bisa dipakai di server.', flags: 64 });
      return;
    }

    const map = globalThis.__voiceConnections;
    const connection = map.get(guild.id);
    if (!connection) {
      await interaction.reply({ content: 'Bot tidak sedang terkoneksi ke voice.', flags: 64 });
      return;
    }

    try {
      connection.destroy();
    } catch (_) {
      null;
    }
    map.delete(guild.id);

    await interaction.reply({ content: '✅ Bot disconnected dari voice.', flags: 64 });
  },
};
