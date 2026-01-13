const { SlashCommandBuilder } = require('discord.js');
const path = require('path');

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
      const lavalinkPath = path.join(__dirname, '..', '..', 'api', 'music', 'lavalink');
      console.log('[Play] Loading from:', lavalinkPath);
      const { musicCommands } = require(lavalinkPath);
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
