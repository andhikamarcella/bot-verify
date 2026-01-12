const { Events } = require('discord.js');

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    // Only process DM messages, ignore server messages and bot messages
    if (message.inGuild() || message.author.bot) return;

    // Check if user is in a voice channel
    const voiceState = message.member?.voice;
    const isInVoiceCall = voiceState?.channel && !voiceState.channel.isVoiceBased();

    // Handle voice call - user wants to talk with AI
    if (isInVoiceCall) {
      await handleVoiceCallAI(message, client);
      return;
    }

    // Handle text DM chat with AI
    await handleDMChatAI(message, client);
  },
};

async function handleDMChatAI(message, client) {
  try {
    // Typing indicator
    await message.channel.sendTyping();

    // Get AI response using existing Groq logic
    const { callGroqChat } = require('./commands/ai');
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

async function handleVoiceCallAI(message, client) {
  try {
    const voiceChannel = message.member.voice.channel;
    
    // Join the voice channel
    const { joinVoiceChannel, createAudioPlayer, createAudioResource, VoiceConnectionStatus, entersState, AudioPlayerStatus } = require('@discordjs/voice');
    const { groqTtsWav, groqTranscribe } = require('./commands/voiceverify');
    
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    await message.reply({
      content: '🎙️ Aku join voice call! Silakan bicara, aku akan dengerin dan jawab.',
      allowedMentions: { repliedUser: false }
    });

    // Wait for connection to be ready
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

    // Start listening loop
    await startVoiceChatLoop(connection, message, client);

  } catch (error) {
    console.error('[Voice Call AI] Error:', error);
    await message.reply({
      content: 'Maaf, gabisa join voice call. Pastikan aku punya permission.',
      allowedMentions: { repliedUser: false }
    });
  }
}

async function startVoiceChatLoop(connection, originalMessage, client) {
  const { createAudioPlayer, createAudioResource, AudioPlayerStatus, entersState } = require('@discordjs/voice');
  const { groqTtsWav, groqTranscribe } = require('./commands/voiceverify');
  const { callGroqChat } = require('./commands/ai');
  const { recordUserToWav } = require('./commands/voiceverify');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const player = createAudioPlayer();
  connection.subscribe(player);

  let isListening = false;
  const tmpDir = os.tmpdir();

  // Welcome message
  try {
    const welcomeWav = await groqTtsWav('Halo! Aku siap ngobrol. Silakan bicara ya!', 'id');
    const welcomeResource = createAudioResource(welcomeWav);
    player.play(welcomeResource);
    await entersState(player, AudioPlayerStatus.Idle, 60_000);
  } catch (err) {
    console.error('[Voice Chat] Failed to play welcome:', err);
  }

  // Start continuous listening
  const listenInterval = setInterval(async () => {
    if (isListening) return;
    isListening = true;

    try {
      // Record user speech
      const tmpPath = path.join(tmpDir, `voice-ai-${Date.now()}.wav`);
      await recordUserToWav(connection, originalMessage.author.id, tmpPath);

      // Transcribe
      const wavBuffer = await fs.promises.readFile(tmpPath);
      const transcript = await groqTranscribe(wavBuffer, 'voice-ai.wav', 'id');

      if (transcript && transcript.trim().length > 0) {
        console.log(`[Voice Chat] User: ${transcript}`);

        // Get AI response
        const aiResponse = await callGroqChat(transcript, 'id');
        console.log(`[Voice Chat] AI: ${aiResponse}`);

        // Speak AI response
        try {
          const responseWav = await groqTtsWav(aiResponse.slice(0, 300), 'id'); // Limit TTS length
          const responseResource = createAudioResource(responseWav);
          player.play(responseResource);
          await entersState(player, AudioPlayerStatus.Idle, 60_000);
        } catch (ttsErr) {
          console.error('[Voice Chat] TTS error:', ttsErr);
          // Fallback: send text message
          await originalMessage.channel.send(`🤖: ${aiResponse.slice(0, 500)}`);
        }
      }

      // Cleanup
      try {
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      } catch (cleanupErr) {
        console.error('[Voice Chat] Cleanup error:', cleanupErr);
      }

    } catch (error) {
      console.error('[Voice Chat] Loop error:', error);
    } finally {
      isListening = false;
    }
  }, 3000); // Listen every 3 seconds

  // Cleanup on disconnect
  connection.on(VoiceConnectionStatus.Disconnected, () => {
    clearInterval(listenInterval);
    connection.destroy();
  });

  // Auto-disconnect after 5 minutes of inactivity
  let lastActivity = Date.now();
  const activityCheck = setInterval(() => {
    if (Date.now() - lastActivity > 5 * 60 * 1000) {
      clearInterval(listenInterval);
      clearInterval(activityCheck);
      connection.destroy();
      originalMessage.channel.send('👋 Sampai jumpa! Aku leave voice call ya.');
    }
  }, 30 * 1000);

  // Update activity on user speech
  // (This would need more complex implementation to detect actual speech)
}
