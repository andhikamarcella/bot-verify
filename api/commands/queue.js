const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current music queue'),

  async execute(interaction, client) {
    const musicCommands = require('../music/lavalink').musicCommands;
    await musicCommands.queue(interaction);
  }
};
