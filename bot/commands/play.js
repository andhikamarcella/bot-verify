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
    try {
      console.log('[Play] Command executed');
      const musicCommands = require('../../api/music/lavalink').musicCommands;
      console.log('[Play] musicCommands loaded:', typeof musicCommands);
      console.log('[Play] musicCommands.play:', typeof musicCommands?.play);
      
      if (!musicCommands || !musicCommands.play) {
        throw new Error('musicCommands.play is not defined');
      }
      
      await musicCommands.play(interaction);
    } catch (error) {
      console.error('[Play] Error:', error);
      await interaction.reply({
        content: '❌ Failed to play music. Please check if Lavalink is running.',
        ephemeral: true,
      });
    }
  }
};
