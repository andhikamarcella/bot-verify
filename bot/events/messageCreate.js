const { Events } = require('discord.js');

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    // Only process DM messages, ignore server messages and bot messages
    if (message.inGuild() || message.author.bot) return;

    // Handle text DM chat with AI
    await handleDMChatAI(message, client);
  },
};

async function handleDMChatAI(message, client) {
  try {
    // Typing indicator
    await message.channel.sendTyping();

    // Get AI response using existing Groq logic
    const { callGroqChat } = require('../commands/ai');
    const aiResponse = await callGroqChat(message.content, 'id');

    // Send AI response
    await message.reply({
      content: aiResponse.slice(0, 2000), // Discord limit
      allowedMentions: { repliedUser: false }
    });

  } catch (error) {
    console.error('[DM AI] Error:', error);
    await message.reply({
      content: 'Maaf, terjadi kesalahan. Coba lagi nanti ya.',
      allowedMentions: { repliedUser: false }
    });
  }
}
