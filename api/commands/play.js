const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play music from YouTube')
    .addStringOption(option =>
      option
        .setName('query')
        .setDescription('YouTube video URL or search query')
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const musicCommands = require('../music/lavalink').musicCommands;
    await musicCommands.play(interaction);
  }
};
