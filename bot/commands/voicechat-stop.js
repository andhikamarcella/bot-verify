const { SlashCommandBuilder } = require('discord.js');
const { getVoiceConnection } = require('@discordjs/voice');

if (!globalThis.__voiceConnections) {
  globalThis.__voiceConnections = new Map();
}
if (!globalThis.__voicechatSessions) {
  globalThis.__voicechatSessions = new Map();
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

    const sessions = globalThis.__voicechatSessions;
    const session = sessions.get(guild.id);
    if (session?.cleanup) {
      try { session.cleanup(); } catch (_) {}
      try { sessions.delete(guild.id); } catch (_) {}
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
