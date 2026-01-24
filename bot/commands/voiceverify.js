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

const DEFAULT_CHAT_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const DEFAULT_STT_MODEL = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';
const DEFAULT_TTS_MODEL = process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english';
const DEFAULT_TTS_VOICE = process.env.GROQ_TTS_VOICE || 'troy';

const VOICEVERIFY_DIGITS = process.env.VOICEVERIFY_DIGITS || 3;
const VOICEVERIFY_MAX_ATTEMPTS = process.env.VOICEVERIFY_MAX_ATTEMPTS || 3;
const VOICEVERIFY_MAX_RECORD_MS = process.env.VOICEVERIFY_MAX_RECORD_MS || 10000;
const VOICEVERIFY_SILENCE_MS = process.env.VOICEVERIFY_SILENCE_MS || 1200;

function randomDigits(count) {
  const n = Math.max(3, Math.min(6, Number(count) || VOICEVERIFY_DIGITS));
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
    twenty: '20'
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
    console.error('[VoiceVerify] Transcription error:', error);
    return '';
  }
}

async function generateTts(text) {
  try {
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

    if (!response.ok) {
      throw new Error(`TTS generation failed: ${response.statusText}`);
    }

    return await response.arrayBuffer();
  } catch (error) {
    console.error('[VoiceVerify] TTS error:', error);
    return null;
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

async function assignRole(member, roleId, reason) {
  try {
    if (member.roles.cache.has(roleId)) {
      return true; // Already has role
    }
    
    await member.roles.add(roleId, reason);
    return true;
  } catch (error) {
    console.error('[VoiceVerify] Role assignment error:', error);
    return false;
  }
}

async function sendVerificationLog(client, guildId, logData) {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const logChannelId = process.env.WELCOME_CHANNEL_ID;
    if (!logChannelId) return;

    const logChannel = guild.channels.cache.get(logChannelId);
    if (!logChannel || !logChannel.isTextBased()) return;

    const embed = {
      title: '🔐 Voice Verification',
      description: `**User:** ${logData.user?.tag || 'Unknown'}\n**Status:** ${logData.status}\n**Digits:** ${logData.digits || 'N/A'}\n**Attempts:** ${logData.attempts || 0}`,
      color: logData.status === 'SUCCESS' ? 0x00FF00 : 0xFF0000,
      timestamp: new Date().toISOString(),
    };

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('[VoiceVerify] Log error:', error);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voiceverify')
    .setDescription('Verifikasi menggunakan suara')
    .addSubcommand(sub =>
      sub
        .setName('start')
        .setDescription('Mulai verifikasi suara')
        .addIntegerOption(option =>
          option
            .setName('digits')
            .setDescription('Jumlah digit (3-6)')
            .setMinValue(3)
            .setMaxValue(6)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('stop')
        .setDescription('Hentikan sesi voice verify dan disconnect bot')
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand?.() || 'start';
    if (sub === 'stop') {
      const guild = interaction.guild;
      if (!guild) {
        await interaction.reply({ content: 'Command ini hanya bisa dipakai di server.', flags: 64 });
        return;
      }
      const map = globalThis.__voiceConnections || new Map();
      const { getVoiceConnection } = require('@discordjs/voice');
      const connection = map.get(guild.id) || getVoiceConnection(guild.id);
      if (!connection) {
        await interaction.reply({ content: 'Bot tidak sedang berada di voice channel.', flags: 64 });
        return;
      }
      try { connection.destroy(); } catch (_) {}
      try { map.delete(guild.id); } catch (_) {}
      await interaction.reply({ content: '✅ Sesi voice verify dihentikan dan bot disconnect.', flags: 64 });
      return;
    }
    const { member, guild } = interaction;
    
    if (!member.voice.channel) {
      return await interaction.reply({
        content: '❌ You must be in a voice channel to use voice verification!',
        ephemeral: true,
      });
    }

    const memberRoleId = process.env.MEMBER_ROLE_ID;
    if (!memberRoleId) {
      return await interaction.reply({
        content: '❌ Member role ID not configured!',
        ephemeral: true,
      });
    }

    const digits = interaction.options.getInteger('digits') || VOICEVERIFY_DIGITS;
    const expectedDigits = randomDigits(digits);
    const expectedWithHyphens = digitsWithHyphens(expectedDigits);
    let attempts = 0;
    const maxAttempts = VOICEVERIFY_MAX_ATTEMPTS;

    try {
      await interaction.deferReply();

      const connection = joinVoiceChannel({
        channelId: member.voice.channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: true,
      });
      try { globalThis.__voiceConnections.set(guild.id, connection); } catch (_) {}

      const player = createAudioPlayer();
      connection.subscribe(player);

      // Generate TTS for the challenge
      const ttsAudio = await generateTts(
        `Voice verification started. Please say the following digits clearly: ${expectedWithHyphens}. You have ${maxAttempts} attempts.`
      );

      if (ttsAudio) {
        const resource = createAudioResource(Buffer.from(ttsAudio), {
          inputType: 'arbitrary',
          inlineVolume: true,
        });
        player.play(resource);
      }

      // Create audio receiver
      const receiver = connection.receiver;
      const userId = interaction.user.id;

      const listenForVerification = async () => {
        attempts++;
        
        if (attempts > maxAttempts) {
          await interaction.followUp({
            content: `❌ Voice verification failed! Maximum attempts (${maxAttempts}) reached.`,
          });

          await sendVerificationLog(client, guild.id, {
            user: interaction.user,
            status: 'FAILED',
            digits: expectedWithHyphens,
            attempts: attempts - 1,
          });

          connection.destroy();
          return;
        }

        try {
          const opusStream = receiver.subscribe(userId, {
            end: {
              behavior: EndBehaviorType.AfterSilence,
              duration: VOICEVERIFY_SILENCE_MS,
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
            const normalizedAnswer = normalizeAnswer(transcription);
            
            if (normalizedAnswer === expectedDigits) {
              // Verification successful
              const roleAssigned = await assignRole(member, memberRoleId, 'Voice verification passed');
              
              if (roleAssigned) {
                const successTts = await generateTts('Verification successful! Welcome to the server.');
                
                if (successTts) {
                  const successResource = createAudioResource(Buffer.from(successTts), {
                    inputType: 'arbitrary',
                    inlineVolume: true,
                  });
                  player.play(successResource);
                }

                await interaction.followUp({
                  content: `✅ Voice verification successful! Member role assigned.`,
                });

                await sendVerificationLog(client, guild.id, {
                  user: interaction.user,
                  status: 'SUCCESS',
                  digits: expectedWithHyphens,
                  attempts: attempts,
                });

                // Try to create interview token
                try {
                  const baseUrl = process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_BASE || 'http://localhost:3000';
                  
                  // Dynamic require with fallback for deployment environment
                  let tokensModel;
                  try {
                    tokensModel = require('../../api/models/Tokens');
                  } catch (error) {
                    console.error('[VoiceVerify] Failed to load Tokens model from relative path, trying absolute path...');
                    try {
                      tokensModel = require('/app/api/models/Tokens');
                    } catch (absError) {
                      console.error('[VoiceVerify] Failed to load Tokens model from absolute path, trying alternative...');
                      try {
                        tokensModel = require('../models/Tokens');
                      } catch (altError) {
                        console.error('[VoiceVerify] All attempts to load Tokens model failed:', altError);
                        tokensModel = null;
                      }
                    }
                  }

                  if (tokensModel && tokensModel.createTokenDocument) {
                    const token = await tokensModel.createTokenDocument(
                      interaction.user.id,
                      guild.id,
                      'VERIFIED',
                      { voiceVerified: true, verificationMethod: 'voice' }
                    );

                    const interviewUrl = `${baseUrl}/interview?token=${token.token}`;
                    
                    await interaction.followUp({
                      content: `📋 **Interview Ready:** [Click here to continue](${interviewUrl})`,
                    });
                  }
                } catch (tokenError) {
                  console.error('[VoiceVerify] Token creation error:', tokenError);
                }
              } else {
                await interaction.followUp({
                  content: '❌ Verification passed but failed to assign role. Please contact server staff.',
                });
              }
            } else {
              // Incorrect answer
              const remainingAttempts = maxAttempts - attempts;
              
              if (remainingAttempts > 0) {
                const retryTts = await generateTts(
                  `That was incorrect. Expected: ${expectedWithHyphens}. You have ${remainingAttempts} attempts remaining. Please try again.`
                );
                
                if (retryTts) {
                  const retryResource = createAudioResource(Buffer.from(retryTts), {
                    inputType: 'arbitrary',
                    inlineVolume: true,
                  });
                  player.play(retryResource);
                }

                await interaction.followUp({
                  content: `❌ Incorrect. Expected: ${expectedWithHyphens}, Got: "${transcription}". Attempts remaining: ${remainingAttempts}`,
                });

                // Continue listening
                setTimeout(listenForVerification, 2000);
              } else {
                await interaction.followUp({
                  content: `❌ Voice verification failed! Expected: ${expectedWithHyphens}`,
                });

                await sendVerificationLog(client, guild.id, {
                  user: interaction.user,
                  status: 'FAILED',
                  digits: expectedWithHyphens,
                  attempts: attempts,
                });
              }
            }
          } else {
            // No audio detected
            const remainingAttempts = maxAttempts - attempts;
            
            if (remainingAttempts > 0) {
              const noAudioTts = await generateTts(
                `No audio detected. Please speak clearly. You have ${remainingAttempts} attempts remaining.`
              );
              
              if (noAudioTts) {
                const noAudioResource = createAudioResource(Buffer.from(noAudioTts), {
                  inputType: 'arbitrary',
                  inlineVolume: true,
                });
                player.play(noAudioResource);
              }

              await interaction.followUp({
                content: `🔇 No audio detected. Attempts remaining: ${remainingAttempts}`,
              });

              setTimeout(listenForVerification, 2000);
            } else {
              await interaction.followUp({
                content: `❌ Voice verification failed! No audio detected.`,
              });

              await sendVerificationLog(client, guild.id, {
                user: interaction.user,
                status: 'FAILED',
                digits: expectedWithHyphens,
                attempts: attempts,
              });
            }
          }
        } catch (error) {
          console.error('[VoiceVerify] Speech listening error:', error);
          
          const remainingAttempts = maxAttempts - attempts;
          if (remainingAttempts > 0) {
            await interaction.followUp({
              content: `⚠️ Error processing audio. Attempts remaining: ${remainingAttempts}`,
            });
            setTimeout(listenForVerification, 2000);
          } else {
            await interaction.followUp({
              content: '❌ Voice verification failed due to technical issues.',
            });
          }
        }
      };

      // Start listening after TTS finishes
      setTimeout(listenForVerification, 4000);

      await interaction.editReply({
        content: `🎤 Voice verification started! Say: **${expectedWithHyphens}** (${maxAttempts} attempts)`,
      });

    } catch (error) {
      console.error('[VoiceVerify] Command error:', error);
      await interaction.editReply({
        content: '❌ Failed to start voice verification. Please try again.',
      });
    }
  },
};
