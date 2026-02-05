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
const { SlashCommandBuilder } = require('discord.js');
const { groqTtsWav, groqTranscribe, recordUserToWav, recordUserToWavBuffer, requireGroqApiKey } = require('../utils/groqAudio');

const VOICEVERIFY_DIGITS = process.env.VOICEVERIFY_DIGITS || 3;
const VOICEVERIFY_MAX_ATTEMPTS = process.env.VOICEVERIFY_MAX_ATTEMPTS || 3;
const VOICEVERIFY_MAX_RECORD_MS = process.env.VOICEVERIFY_MAX_RECORD_MS || 10000;
const VOICEVERIFY_SILENCE_MS = process.env.VOICEVERIFY_SILENCE_MS || 1200;

if (!globalThis.__voiceConnections) {
  globalThis.__voiceConnections = new Map();
}
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
    twenty: '20',
    nol: '0', satu: '1', dua: '2', tiga: '3', empat: '4',
    lima: '5', enam: '6', tujuh: '7', delapan: '8', sembilan: '9',
    sepuluh: '10', sebelas: '11', 'dua belas': '12', 'tiga belas': '13', 'empat belas': '14',
    'lima belas': '15', 'enam belas': '16', 'tujuh belas': '17', 'delapan belas': '18', 'sembilan belas': '19',
    'dua puluh': '20',
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

function sanitizeEnvString(value) {
  return String(value || '')
    .trim()
    .replace(/^[`"']+/, '')
    .replace(/[`"']+$/, '')
    .trim();
}

function sanitizeUrlBase(value) {
  const cleaned = sanitizeEnvString(value);
  return cleaned ? cleaned.replace(/\/+$/, '') : '';
}

module.exports = {
  groqTtsWav,
  groqTranscribe,
  recordUserToWav,
  recordUserToWavBuffer,
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

      // Generate TTS for the challenge
      try {
        const wav = await groqTtsWav(
          `Voice verification started. Please say the following digits clearly: ${expectedWithHyphens}. You have ${maxAttempts} attempts.`,
          'en'
        );
        const resource = createAudioResource(Readable.from(wav));
        player.play(resource);
      } catch (_) {
        null;
      }

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
          const wavBuffer = await recordUserToWavBuffer(connection, userId, {
            silenceMs: VOICEVERIFY_SILENCE_MS,
            maxRecordMs: VOICEVERIFY_MAX_RECORD_MS,
          });

          if (wavBuffer.length > 44) {
            const sttLang = String(process.env.GROQ_STT_LANGUAGE || '').trim();
            const transcription = await groqTranscribe(wavBuffer, 'voiceverify.wav', sttLang || undefined);
            const normalizedAnswer = normalizeAnswer(transcription);
            
            if (normalizedAnswer === expectedDigits) {
              // Verification successful
              const roleAssigned = await assignRole(member, memberRoleId, 'Voice verification passed');
              
              if (roleAssigned) {
                try {
                  const successWav = await groqTtsWav('Verification successful! Welcome to the server.', 'en');
                  const successResource = createAudioResource(Readable.from(successWav));
                  player.play(successResource);
                  await entersState(player, AudioPlayerStatus.Idle, 60_000).catch(() => null);
                } catch (_) {
                  null;
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
                  const baseUrl =
                    sanitizeUrlBase(process.env.PUBLIC_FRONTEND_URL) ||
                    sanitizeUrlBase(process.env.FRONTEND_BASE) ||
                    'http://localhost:3000';
                  
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
                try {
                  const retryWav = await groqTtsWav(
                    `That was incorrect. Expected: ${expectedWithHyphens}. You have ${remainingAttempts} attempts remaining. Please try again.`,
                    'en'
                  );
                  const retryResource = createAudioResource(Readable.from(retryWav));
                  player.play(retryResource);
                } catch (_) {
                  null;
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
              try {
                const noAudioWav = await groqTtsWav(
                  `No audio detected. Please speak clearly. You have ${remainingAttempts} attempts remaining.`,
                  'en'
                );
                const noAudioResource = createAudioResource(Readable.from(noAudioWav));
                player.play(noAudioResource);
              } catch (_) {
                null;
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
