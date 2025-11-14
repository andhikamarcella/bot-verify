const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Periksa latensi bot'),

  async execute(interaction, client) {
    const replyTime = Date.now() - interaction.createdTimestamp;
    await interaction.reply({
      content: `🏓 Pong! Latensi: ${replyTime}ms • Websocket: ${Math.round(client.ws.ping)}ms`,
      flags: 64,
    });
  },
};
