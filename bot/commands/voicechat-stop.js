const { SlashCommandBuilder } = require('discord.js');
const { getVoiceConnection } = require('@discordjs/voice');

if (!globalThis.__voiceConnections) {
  globalThis.__voiceConnections = new Map();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voicechat-stop')
    .setDescription('Hentikan sesi voice chat AI dan disconnect bot'),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: 'Command ini hanya bisa dipakai di server.', flags: 64 });
      return;
    }

    const map = globalThis.__voiceConnections;
    const connection = map.get(guild.id) || getVoiceConnection(guild.id);

    if (!connection) {
      await interaction.reply({ content: 'Bot tidak sedang berada di voice channel.', flags: 64 });
      return;
    }

    try {
      connection.destroy();
    } catch (_) {
      null;
    }
    try {
      map.delete(guild.id);
    } catch (_) {
      null;
    }

    await interaction.reply({ content: '✅ Sesi voice chat dihentikan dan bot disconnect.', flags: 64 });
  },
};
