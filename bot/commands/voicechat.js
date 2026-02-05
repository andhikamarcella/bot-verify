const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  EndBehaviorType,
} = require('@discordjs/voice');
const prism = require('prism-media');
const { SlashCommandBuilder } = require('discord.js');
const { createWavBuffer, groqTranscribe, groqTtsWav, requireGroqApiKey, GROQ_API_BASE, getGroqApiKey } = require('../utils/groqAudio');

const GROQ_CHAT_URL = `${GROQ_API_BASE}/chat/completions`;

const DEFAULT_CHAT_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

if (!globalThis.__voicechatSessions) {
  globalThis.__voicechatSessions = new Map();
}
const sessions = globalThis.__voicechatSessions;

if (!globalThis.__voiceConnections) {
  globalThis.__voiceConnections = new Map();
}

function randomDigits(count) {
  const n = Math.max(3, Math.min(6, Number(count) || 3));
  let out = '';
  for (let i = 0; i < n; i += 1) {
    out += String(Math.floor(Math.random() * 10));
  }
  return out;
}

function digitsWithHyphens(digits) {
  return String(digits || '')
    .split('')
    .filter((c) => /\d/.test(c))
    .join('-');
}

function normalizeAnswer(raw) {
  const text = String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const directDigits = text.replace(/\D/g, '');
  if (directDigits.length >= 3) {
    return directDigits;
  }

  const numberWords = {
    zero: '0', one: '1', two: '2', three: '3', four: '4',
    five: '5', six: '6', seven: '7', eight: '8', nine: '9',
    ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14',
    fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19',
    twenty: '20',
    // Indonesian numbers
    nol: '0', satu: '1', dua: '2', tiga: '3', empat: '4',
    lima: '5', enam: '6', tujuh: '7', delapan: '8', sembilan: '9',
    sepuluh: '10', sebelas: '11', 'dua belas': '12', 'tiga belas': '13', 'empat belas': '14',
    'lima belas': '15', 'enam belas': '16', 'tujuh belas': '17', 'delapan belas': '18', 'sembilan belas': '19',
    'dua puluh': '20'
  };

  const words = text.split(/\s+/);
  let digits = '';
  for (const word of words) {
    if (numberWords[word]) {
      digits += numberWords[word];
    }
  }

  return digits;
}

async function transcribeAudio(audioBuffer) {
  try {
    const sttLang = String(process.env.GROQ_STT_LANGUAGE || '').trim();
    return await groqTranscribe(audioBuffer, 'voicechat.wav', sttLang || undefined);
  } catch (error) {
    console.error('[VoiceChat] Transcription error:', error);
    return '';
  }
}

async function generateTts(text) {
  try {
    return await groqTtsWav(text);
  } catch (error) {
    console.error('[VoiceChat] Groq TTS error:', error);
  }

  // Fallback: Simple text response (no audio)
  console.log('[VoiceChat] TTS failed, using text fallback');
  return null;
}

async function chatWithGroq(messages) {
  try {
    const apiKey = requireGroqApiKey();
    const candidates = [
      String(DEFAULT_CHAT_MODEL || '').trim(),
      String(process.env.GROQ_MODEL_FALLBACK || '').trim(),
      ...String(process.env.GROQ_MODEL_FALLBACKS || '')
        .split(',')
        .map((v) => String(v || '').trim())
        .filter(Boolean),
      'llama-3.3-70b-versatile',
      'llama-3.1-70b-versatile',
      'llama3-70b-8192',
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
    ].filter(Boolean);

    const unique = Array.from(new Set(candidates));
    let lastErr = null;

    for (const model of unique) {
      const response = await fetch(GROQ_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: messages,
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        lastErr = new Error(`chat-failed:${response.status}:${errText.slice(0, 200)}`);
        if (response.status === 400 || response.status === 404) {
          const lower = errText.toLowerCase();
          if (lower.includes('model') || lower.includes('not found') || lower.includes('invalid') || lower.includes('unknown')) {
            continue;
          }
        }
        throw lastErr;
      }

      const data = await response.json().catch(() => null);
      const content = data?.choices?.[0]?.message?.content;
      if (content) return content;
      lastErr = new Error('empty-response');
    }

    throw lastErr || new Error('chat-failed');
  } catch (error) {
    console.error('[VoiceChat] Chat error:', error);
    return 'Sorry, I encountered an error while processing your request.';
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voicechat')
    .setDescription('Voice chat dengan AI')
    .addSubcommand(sub =>
      sub
        .setName('start')
        .setDescription('Mulai voice chat dengan AI')
        .addStringOption(option =>
          option
            .setName('language')
            .setDescription('Pilih bahasa (id/en)')
            .addChoices(
              { name: 'Indonesian', value: 'id' },
              { name: 'English', value: 'en' }
            )
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('stop')
        .setDescription('Hentikan sesi voice chat dan disconnect bot')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand?.() || 'start';
    if (sub === 'stop') {
      const guild = interaction.guild;
      if (!guild) {
        await interaction.reply({ content: 'Command ini hanya bisa dipakai di server.', flags: 64 });
        return;
      }
      const session = sessions.get(guild.id);
      if (session?.cleanup) {
        try { session.cleanup(); } catch (_) {}
        try { sessions.delete(guild.id); } catch (_) {}
      }
      const map = globalThis.__voiceConnections;
      const { getVoiceConnection } = require('@discordjs/voice');
      const connection = map.get(guild.id) || getVoiceConnection(guild.id);
      if (!connection) {
        await interaction.reply({ content: 'Bot tidak sedang berada di voice channel.', flags: 64 });
        return;
      }
      try { connection.destroy(); } catch (_) {}
      try { map.delete(guild.id); } catch (_) {}
      await interaction.reply({ content: '✅ Sesi voice chat dihentikan dan bot disconnect.', flags: 64 });
      return;
    }
    const { member, guild, channel } = interaction;
    const language = interaction.options.getString('language') || 'id';
    
    if (!member.voice.channel) {
      return await interaction.reply({
        content: '❌ Kamu harus berada di voice channel untuk menggunakan voice chat!',
        ephemeral: true,
      });
    }

    try {
      requireGroqApiKey();
      await interaction.deferReply();

      const connection = joinVoiceChannel({
        channelId: member.voice.channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
      });
      try { globalThis.__voiceConnections.set(guild.id, connection); } catch (_) {}

      const player = createAudioPlayer();
      connection.subscribe(player);

      // Initialize conversation
      let conversationMessages = [
        {
          role: 'system',
          content: language === 'id' 
            ? 'Kamu adalah asisten AI yang ramah dan membantu. Berbicaralah dalam bahasa Indonesia yang natural dan santai. Jawab pertanyaan dengan jelas dan ringkas.'
            : 'You are a helpful and friendly AI assistant. Speak naturally and conversationally. Answer questions clearly and concisely.',
        },
      ];

      // Generate welcome TTS
      const welcomeText = language === 'id' 
        ? 'Halo! Saya asisten AI. Silakan bicara apa saja, saya akan mendengarkan dan merespons. Mulai saja berbicara!'
        : 'Hello! I\'m your AI assistant. Feel free to talk about anything, I\'ll listen and respond. Just start speaking!';

      const ttsAudio = await generateTts(welcomeText);

      if (ttsAudio) {
        const resource = createAudioResource(Readable.from(ttsAudio));
        player.play(resource);
      } else {
        // Fallback: Send text message instead
        await interaction.followUp({
          content: `🎤 **${welcomeText}**`,
          ephemeral: true,
        });
      }

      // Create audio receiver
      const receiver = connection.receiver;
      const userId = interaction.user.id;

      const listenForSpeech = async () => {
        try {
          const opusStream = receiver.subscribe(userId, {
            end: {
              behavior: EndBehaviorType.AfterSilence,
              duration: 1500,
            },
          });

          const audioData = [];
          for await (const chunk of opusStream) {
            audioData.push(chunk);
          }

          if (audioData.length > 0) {
            const decoder = new prism.opus.Decoder({ rate: 48000, channels: 1, frameSize: 960 });
            const pcmChunks = [];
            const pcmStream = Readable.from(Buffer.concat(audioData)).pipe(decoder);
            for await (const chunk of pcmStream) {
              pcmChunks.push(chunk);
            }
            const pcmBuffer = Buffer.concat(pcmChunks);
            const wavBuffer = createWavBuffer(pcmBuffer, 48000, 1);
            
            const transcription = await transcribeAudio(wavBuffer);
            
            if (transcription.trim()) {
              console.log(`[VoiceChat] User said: ${transcription}`);
              
              // Add user message to conversation
              conversationMessages.push({
                role: 'user',
                content: transcription,
              });

              // Get AI response
              const aiResponse = await chatWithGroq(conversationMessages);
              conversationMessages.push({
                role: 'assistant',
                content: aiResponse,
              });

              console.log(`[VoiceChat] AI responded: ${aiResponse}`);

              // Generate TTS for AI response
              const responseTts = await generateTts(aiResponse);
              
              if (responseTts) {
                const responseResource = createAudioResource(Readable.from(responseTts));
                player.play(responseResource);
              }

              // Send text feedback (optional, for debugging)
              await interaction.followUp({
                content: `🎤 **Kamu:** ${transcription}\n🤖 **AI:** ${aiResponse}`,
                ephemeral: true,
              });
            }
          }

          // Continue listening
          setTimeout(listenForSpeech, 1000);
        } catch (error) {
          console.error('[VoiceChat] Speech listening error:', error);
          // Continue listening even on error
          setTimeout(listenForSpeech, 2000);
        }
      };

      // Start listening after welcome message
      setTimeout(listenForSpeech, 3000);

      // Store session for cleanup
      sessions.set(guild.id, {
        connection,
        player,
        userId,
        cleanup: () => {
          try {
            connection.destroy();
            player.stop();
          } catch (error) {
            console.error('[VoiceChat] Cleanup error:', error);
          }
        },
      });

      const startMessage = language === 'id'
        ? '🎤 **Voice Chat Dimulai!**\n\nSaya siap mendengarkan. Silakan bicara apa saja dalam bahasa Indonesia atau English!'
        : '🎤 **Voice Chat Started!**\n\nI\'m ready to listen. Feel free to talk about anything in Indonesian or English!';

      await interaction.editReply({
        content: startMessage,
      });

    } catch (error) {
      console.error('[VoiceChat] Command error:', error);
      await interaction.editReply({
        content: '❌ Gagal memulai voice chat. Silakan coba lagi.',
      });
    }
  },
};
