const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop music and clear the queue'),

  async execute(interaction, client) {
    const musicCommands = require('../../api/music/lavalink').musicCommands;
    await musicCommands.stop(interaction);
  }
};
