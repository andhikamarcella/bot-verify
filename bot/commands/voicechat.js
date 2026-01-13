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
const { normalizeTtsText } = require('../utils/tts');

const GROQ_API_BASE = 'https://api.groq.com/openai/v1';
const GROQ_CHAT_URL = `${GROQ_API_BASE}/chat/completions`;

const DEFAULT_CHAT_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const DEFAULT_STT_MODEL = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';
const DEFAULT_TTS_MODEL = process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english';
const DEFAULT_TTS_VOICE = process.env.GROQ_TTS_VOICE || 'troy';

const sessions = new Map();

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
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');
    formData.append('model', DEFAULT_STT_MODEL);
    formData.append('language', process.env.GROQ_STT_LANGUAGE || 'auto');

    const response = await fetch(`${GROQ_API_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Transcription failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.text || '';
  } catch (error) {
    console.error('[VoiceChat] Transcription error:', error);
    return '';
  }
}

async function generateTts(text) {
  try {
    // Try Groq TTS first
    const response = await fetch(`${GROQ_API_BASE}/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_TTS_MODEL,
        voice: DEFAULT_TTS_VOICE,
        input: normalizeTtsText(text),
      }),
    });

    if (response.ok) {
      return await response.arrayBuffer();
    }
  } catch (error) {
    console.error('[VoiceChat] Groq TTS error:', error);
  }

  // Fallback: Simple text response (no audio)
  console.log('[VoiceChat] TTS failed, using text fallback');
  return null;
}

async function chatWithGroq(messages) {
  try {
    const response = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_CHAT_MODEL,
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`Chat completion failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Sorry, I could not process your request.';
  } catch (error) {
    console.error('[VoiceChat] Chat error:', error);
    return 'Sorry, I encountered an error while processing your request.';
  }
}

function createWavBuffer(audioData, sampleRate = 24000) {
  const length = audioData.length;
  const arrayBuffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(arrayBuffer);

  // WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * 2, true);

  // PCM data
  let offset = 44;
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, audioData[i]));
    view.setInt16(offset, sample * 0x7FFF, true);
    offset += 2;
  }

  return Buffer.from(arrayBuffer);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voicechat')
    .setDescription('Start interactive voice chat with AI (supports Indonesian & English)')
    .addStringOption(option =>
      option
        .setName('language')
        .setDescription('Choose language (id/en)')
        .addChoices(
          { name: 'Indonesian', value: 'id' },
          { name: 'English', value: 'en' }
        )
    ),

  async execute(interaction) {
    const { member, guild, channel } = interaction;
    const language = interaction.options.getString('language') || 'id';
    
    if (!member.voice.channel) {
      return await interaction.reply({
        content: '❌ Kamu harus berada di voice channel untuk menggunakan voice chat!',
        ephemeral: true,
      });
    }

    try {
      await interaction.deferReply();

      const connection = joinVoiceChannel({
        channelId: member.voice.channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
      });

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
        const resource = createAudioResource(Buffer.from(ttsAudio), {
          inputType: 'arbitrary',
          inlineVolume: true,
        });
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
            const buffer = Buffer.concat(audioData);
            const wavBuffer = createWavBuffer(buffer);
            
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
                const responseResource = createAudioResource(Buffer.from(responseTts), {
                  inputType: 'arbitrary',
                  inlineVolume: true,
                });
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
      sessions.set(interaction.user.id, {
        connection,
        player,
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
