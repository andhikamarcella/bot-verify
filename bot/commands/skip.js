const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current track'),

  async execute(interaction, client) {
    const musicCommands = require('../../api/music/lavalink').musicCommands;
    await musicCommands.skip(interaction);
  }
};
