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
<<<<<<< HEAD
const { fetchConfig } = require('../utils/guildConfig');
const { sendVerificationLog } = require('../utils/logging');
const { normalizeTtsText } = require('../utils/tts');

const GROQ_API_BASE = 'https://api.groq.com/openai/v1';
=======
const { normalizeTtsText } = require('../utils/tts');

const GROQ_API_BASE = 'https://api.groq.com/openai/v1';
const GROQ_CHAT_URL = `${GROQ_API_BASE}/chat/completions`;

const DEFAULT_CHAT_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
>>>>>>> 7874041 (feat: Add music streaming with Lavalink and YouTube support)
const DEFAULT_STT_MODEL = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';
const DEFAULT_TTS_MODEL = process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english';
const DEFAULT_TTS_VOICE = process.env.GROQ_TTS_VOICE || 'troy';

const sessions = new Map();

if (!globalThis.__voiceConnections) {
  globalThis.__voiceConnections = new Map();
}

<<<<<<< HEAD
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
  if (directDigits) return directDigits;

  const map = {
    nol: '0',
    kosong: '0',
    zero: '0',
    satu: '1',
    one: '1',
    dua: '2',
    two: '2',
    tiga: '3',
    three: '3',
    empat: '4',
    four: '4',
    lima: '5',
    five: '5',
    enam: '6',
    six: '6',
    tujuh: '7',
    seven: '7',
    delapan: '8',
    eight: '8',
    sembilan: '9',
    nine: '9',
  };

  const parts = text.split(' ').filter(Boolean);
  let result = '';
  for (const p of parts) {
    if (map[p]) result += map[p];
  }
  return result;
=======
function pcmToWavBuffer(pcmBuffer, { channels, sampleRate }) {
  const ch = Number(channels) || 1;
  const sr = Number(sampleRate) || 48000;
  const bitsPerSample = 16;
  const byteRate = (sr * ch * bitsPerSample) / 8;
  const blockAlign = (ch * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(ch, 22);
  header.writeUInt32LE(sr, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
>>>>>>> 7874041 (feat: Add music streaming with Lavalink and YouTube support)
}

async function groqTtsWav(text, lang) {
  const apiKey = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_FALLBACK;
  if (!apiKey) throw new Error('missing-groq-api-key');

  const normalized = normalizeTtsText(text, lang);

  const res = await fetch(`${GROQ_API_BASE}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEFAULT_TTS_MODEL,
      voice: DEFAULT_TTS_VOICE,
<<<<<<< HEAD
      input: String(normalized || '').slice(0, 600),
=======
      input: String(normalized || '').slice(0, 900),
>>>>>>> 7874041 (feat: Add music streaming with Lavalink and YouTube support)
      response_format: 'wav',
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`tts-failed:${res.status}:${errText.slice(0, 200)}`);
  }

<<<<<<< HEAD
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
=======
  return Buffer.from(await res.arrayBuffer());
>>>>>>> 7874041 (feat: Add music streaming with Lavalink and YouTube support)
}

async function groqTranscribe(fileBuffer, filename, language) {
  const apiKey = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_FALLBACK;
  if (!apiKey) throw new Error('missing-groq-api-key');

  const form = new FormData();
  const blob = new Blob([fileBuffer], { type: 'audio/wav' });
  form.append('file', blob, filename || 'audio.wav');
  form.append('model', DEFAULT_STT_MODEL);
  form.append('response_format', 'json');
  const lang = String(language || process.env.GROQ_STT_LANGUAGE || '').trim();
  if (lang) {
    form.append('language', lang);
  }

  const res = await fetch(`${GROQ_API_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.error?.message || `stt-failed:${res.status}`;
    throw new Error(message);
  }

  const text = json?.text;
  if (!text) throw new Error('stt-empty');
  return String(text);
}

<<<<<<< HEAD
function pcmToWavBuffer(pcmBuffer, { channels, sampleRate }) {
  const ch = Number(channels) || 1;
  const sr = Number(sampleRate) || 48000;
  const bitsPerSample = 16;
  const byteRate = (sr * ch * bitsPerSample) / 8;
  const blockAlign = (ch * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(ch, 22);
  header.writeUInt32LE(sr, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

async function ensureEveryoneVoiceAccess(guild) {
  const voiceChannelId = process.env.VOICEVERIFY_CHANNEL_ID;
  if (!voiceChannelId) {
    console.log('[VoiceVerify] VOICEVERIFY_CHANNEL_ID not set, skipping permission setup');
    return;
  }

  const voiceChannel = guild.channels.cache.get(voiceChannelId) || await guild.channels.fetch(voiceChannelId).catch(() => null);
  if (!voiceChannel || !voiceChannel.isVoiceBased()) {
    console.error(`[VoiceVerify] Voice channel ${voiceChannelId} not found or not voice-based`);
    return;
  }

  try {
    // Get @everyone role
    const everyoneRole = guild.roles.everyone;
    
    // Set permissions for @everyone to connect and speak
    await voiceChannel.permissionOverwrites.edit(everyoneRole, {
      Connect: true,
      Speak: true,
      ViewChannel: true,
    }, 'Voice verification access');
    
    console.log(`[VoiceVerify] Updated @everyone permissions for voice channel ${voiceChannel.name} (${voiceChannelId})`);
  } catch (err) {
    console.error('[VoiceVerify] Failed to update voice channel permissions:', err);
  }
=======
async function callGroqChat({ messages, model }) {
  const apiKey = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_FALLBACK;
  if (!apiKey) throw new Error('missing-groq-api-key');

  const res = await fetch(GROQ_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: String(model || DEFAULT_CHAT_MODEL),
      temperature: 0.7,
      max_tokens: 256,
      messages,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.error?.message || `Groq HTTP ${res.status}`;
    throw new Error(message);
  }

  const msg = json?.choices?.[0]?.message?.content;
  const out = String(msg || '').trim();
  if (!out) throw new Error('empty-response');
  return out;
>>>>>>> 7874041 (feat: Add music streaming with Lavalink and YouTube support)
}

async function playWavToConnection(connection, wavBuffer) {
  const player = createAudioPlayer();
  const resource = createAudioResource(Readable.from(wavBuffer));
  connection.subscribe(player);
  player.play(resource);
  await entersState(player, AudioPlayerStatus.Playing, 15_000);
<<<<<<< HEAD
  await entersState(player, AudioPlayerStatus.Idle, 60_000);
=======
  await entersState(player, AudioPlayerStatus.Idle, 90_000);
>>>>>>> 7874041 (feat: Add music streaming with Lavalink and YouTube support)
}

async function recordUserToWav(connection, userId, outPath) {
  const receiver = connection.receiver;
  if (!receiver) throw new Error('receiver-not-available');

<<<<<<< HEAD
  const silenceMs = Math.max(500, Number(process.env.VOICEVERIFY_SILENCE_MS) || 1200);
  const maxDurationMs = Math.max(3_000, Number(process.env.VOICEVERIFY_MAX_RECORD_MS) || 10_000);
=======
  const silenceMs = Math.max(500, Number(process.env.VOICECHAT_SILENCE_MS) || 1200);
  const maxDurationMs = Math.max(3_000, Number(process.env.VOICECHAT_MAX_RECORD_MS) || 12_000);
>>>>>>> 7874041 (feat: Add music streaming with Lavalink and YouTube support)

  const channels = 2;
  const sampleRate = 48000;
  const frameSize = 960;

  const opusStream = receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: silenceMs,
    },
  });

  const decoder = new prism.opus.Decoder({ rate: sampleRate, channels, frameSize });
  const pcmChunks = [];
  decoder.on('data', (chunk) => pcmChunks.push(chunk));

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        opusStream.destroy();
      } catch (_) {
        null;
      }
    }, maxDurationMs);

    decoder.once('end', () => {
      clearTimeout(timer);
      resolve();
    });
    decoder.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    opusStream.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    opusStream.pipe(decoder);
  });

  const pcm = Buffer.concat(pcmChunks);
  const wav = pcmToWavBuffer(pcm, { channels, sampleRate });
  await fs.promises.writeFile(outPath, wav);
}

async function cleanupSession(key) {
  const session = sessions.get(key);
  sessions.delete(key);
  if (!session) return;
<<<<<<< HEAD
=======

>>>>>>> 7874041 (feat: Add music streaming with Lavalink and YouTube support)
  try {
    session.connection?.destroy?.();
  } catch (_) {
    null;
  }
  try {
    const map = globalThis.__voiceConnections;
    if (map && session.guildId && map.get(session.guildId) === session.connection) {
      map.delete(session.guildId);
    }
  } catch (_) {
    null;
  }
  try {
    if (session.tmpPath && fs.existsSync(session.tmpPath)) {
      fs.unlinkSync(session.tmpPath);
    }
  } catch (_) {
    null;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
<<<<<<< HEAD
    .setName('voiceverify')
    .setDescription('Verifikasi via voice channel (eksperimental)')
=======
    .setName('voicechat')
    .setDescription('Voice chat interaktif (eksperimental)')
>>>>>>> 7874041 (feat: Add music streaming with Lavalink and YouTube support)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('start')
<<<<<<< HEAD
        .setDescription('Mulai verifikasi voice')
        .addStringOption((opt) =>
          opt
            .setName('lang')
            .setDescription('Bahasa prompt (default: id)')
            .setRequired(false)
            .addChoices(
              { name: 'Indonesian', value: 'id' },
              { name: 'English', value: 'en' }
            )
        )
    )
    .addSubcommand((sub) => sub.setName('stop').setDescription('Hentikan verifikasi voice')),

  async execute(interaction, client) {
    const { guild, member } = interaction;
    if (!member) {
      await interaction.reply({ content: 'Member tidak ditemukan.', flags: 64 });
      return;
    }

    // Ensure @everyone has voice access
    await ensureEveryoneVoiceAccess(guild);

    const sub = interaction.options.getSubcommand();
    const key = `${guild.id}:${member.id}`;

    if (sub === 'stop') {
      await cleanupSession(key);
      await interaction.reply({ content: 'Voice verification dihentikan.', flags: 64 });
      return;
    }

    // start
    const memberRoleId = process.env.MEMBER_ROLE_ID;
    if (!memberRoleId) {
      await interaction.reply({ content: 'MEMBER_ROLE_ID belum diset di environment bot.', flags: 64 });
      return;
    }

    const freshMember = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!freshMember) {
      await interaction.reply({ content: 'Gagal fetch member dari guild. Coba lagi sebentar.', flags: 64 });
      return;
    }
    if (freshMember?.roles?.cache?.has?.(memberRoleId)) {
      const roleName = guild.roles?.cache?.get(memberRoleId)?.name;
      const roleInfo = roleName ? `${roleName} (${memberRoleId})` : memberRoleId;
      await interaction.reply({ content: `Kamu terdeteksi sudah punya role Member (${roleInfo}), tidak perlu verifikasi ulang. Kalau ini salah, cek MEMBER_ROLE_ID di .env.`, flags: 64 });
=======
        .setDescription('Mulai voice chat')
        .addStringOption((opt) =>
          opt
            .setName('lang')
            .setDescription('Bahasa (default: id)')
            .setRequired(false)
            .addChoices({ name: 'Indonesian', value: 'id' }, { name: 'English', value: 'en' })
        )
    )
    .addSubcommand((sub) => sub.setName('stop').setDescription('Hentikan voice chat')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: 'Command ini hanya bisa dipakai di server.', flags: 64 });
      return;
    }

    const key = `${guild.id}:${interaction.user.id}`;

    if (sub === 'stop') {
      await cleanupSession(key);
      await interaction.reply({ content: 'Voice chat dihentikan.', flags: 64 });
>>>>>>> 7874041 (feat: Add music streaming with Lavalink and YouTube support)
      return;
    }

    if (sessions.has(key)) {
<<<<<<< HEAD
      await interaction.reply({ content: 'Sesi verifikasi voice kamu masih berjalan. Gunakan /voiceverify stop untuk batal.', flags: 64 });
      return;
    }

    const channel = freshMember?.voice?.channel;
    if (!channel) {
      // Try to find a voice verification channel and move user there
      const voiceChannelId = process.env.VOICEVERIFY_CHANNEL_ID;
      if (voiceChannelId) {
        const voiceChannel = guild.channels.cache.get(voiceChannelId) || await guild.channels.fetch(voiceChannelId).catch(() => null);
        if (voiceChannel && voiceChannel.isVoiceBased()) {
          try {
            await freshMember.voice.setChannel(voiceChannel, 'Voice verification');
            await interaction.reply({ content: 'Kamu dipindahkan ke voice channel verifikasi. Silakan coba lagi.', flags: 64 });
            return;
          } catch (moveErr) {
            console.error('[VoiceVerify] Failed to move user to voice channel:', moveErr);
            await interaction.reply({ 
              content: `Gagal memindahkan ke voice channel. Error: ${moveErr.message}. Pastikan bot punya permission Move Members dan user tidak di-lock.`, 
              flags: 64 
            });
            return;
          }
        } else {
          console.error(`[VoiceVerify] Voice channel ${voiceChannelId} not found or not voice-based`);
        }
      } else {
        console.log('[VoiceVerify] VOICEVERIFY_CHANNEL_ID not set');
      }
      
      await interaction.reply({ 
        content: 'Kamu harus join voice channel dulu. Jika gabisa masuk, hubungi staff untuk permission voice channel. Pastikan voice channel verifikasi sudah diset di VOICEVERIFY_CHANNEL_ID.', 
        flags: 64 
      });
      return;
    }

    const config = await fetchConfig(guild.id);

    const langChoice = String(interaction.options.getString('lang') || 'id').toLowerCase();
    const sttLang = langChoice === 'en' ? 'en' : 'id';

    const code = randomDigits(Number(process.env.VOICEVERIFY_DIGITS) || 3);
    const maxAttempts = Math.max(1, Number(process.env.VOICEVERIFY_MAX_ATTEMPTS) || 3);

    const tmpPath = path.join(os.tmpdir(), `voiceverify-${guild.id}-${interaction.user.id}-${Date.now()}.wav`);
=======
      await interaction.reply({ content: 'Sesi voice chat kamu masih berjalan. Gunakan /voicechat stop untuk berhenti.', flags: 64 });
      return;
    }

    const apiKey = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_FALLBACK;
    if (!apiKey) {
      await interaction.reply({ content: 'GROQ_API_KEY / GROQ_API_KEY_FALLBACK belum diset di environment bot.', flags: 64 });
      return;
    }

    const langChoice = String(interaction.options.getString('lang') || 'id').toLowerCase();
    const isEn = langChoice === 'en';
    const sttLang = isEn ? 'en' : 'id';

    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    const channel = member?.voice?.channel;
    if (!channel) {
      await interaction.reply({ content: isEn ? 'You must join a voice channel first.' : 'Kamu harus join voice channel dulu.', flags: 64 });
      return;
    }

    const tmpPath = path.join(os.tmpdir(), `voicechat-${guild.id}-${interaction.user.id}-${Date.now()}.wav`);
>>>>>>> 7874041 (feat: Add music streaming with Lavalink and YouTube support)

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

<<<<<<< HEAD
    console.log(`[VoiceVerify] Joining voice channel ${channel.name} (${channel.id}) for user ${interaction.user.tag}`);

    sessions.set(key, { connection, tmpPath, attempts: 0, code, guildId: guild.id });
=======
    sessions.set(key, { connection, tmpPath, guildId: guild.id });
>>>>>>> 7874041 (feat: Add music streaming with Lavalink and YouTube support)
    try {
      globalThis.__voiceConnections.set(guild.id, connection);
    } catch (_) {
      null;
    }

    await interaction.deferReply({ flags: 64 });

<<<<<<< HEAD
    try {
      console.log('[VoiceVerify] Waiting for voice connection to be ready...');
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
      console.log('[VoiceVerify] Voice connection is ready');

      const prompt =
        langChoice === 'en'
          ? `Hello. Please say the digits: ${digitsWithHyphens(code)}.`
          : `Halo. Sebutkan angka: ${digitsWithHyphens(code)}.`;
      try {
        console.log('[VoiceVerify] Generating TTS for prompt...');
        const wav = await groqTtsWav(prompt, langChoice);
        console.log('[VoiceVerify] Playing TTS to voice channel...');
        await playWavToConnection(connection, wav);
        console.log('[VoiceVerify] TTS played successfully');
      } catch (error) {
        console.error('[VoiceVerify] TTS error:', error);
        // fallback: still proceed with text instruction
        await interaction.followUp({
          content:
            langChoice === 'en'
              ? `Cannot play TTS in voice (check ffmpeg / audio format). Continue: please say **${code}** on your mic now.`
              : `Tidak bisa memutar TTS di voice (cek ffmpeg / format audio). Tetap lanjut: sebutkan angka **${code}** lewat mic sekarang.`,
          flags: 64,
        });
      }

      while (true) {
        const session = sessions.get(key);
        if (!session) throw new Error('session-ended');
        session.attempts += 1;

        console.log(`[VoiceVerify] Recording attempt ${session.attempts}/${maxAttempts} for user ${interaction.user.tag}`);
        await recordUserToWav(connection, interaction.user.id, tmpPath);
        console.log('[VoiceVerify] Recording completed, transcribing...');
        
        const oggBuf = await fs.promises.readFile(tmpPath);
        const transcript = await groqTranscribe(oggBuf, path.basename(tmpPath), sttLang);
        const answer = normalizeAnswer(transcript);
        
        console.log(`[VoiceVerify] Transcript: "${transcript}" => "${answer}" (expected: "${code}")`);

        if (answer === code) {
          // Voice verification successful - create interview token instead of giving role
          console.log('[VoiceVerify] Voice verification passed, creating interview token...');

          await sendVerificationLog({
            client: interaction.client,
            guildId: guild.id,
            config,
            user: interaction.user,
            member: freshMember,
            type: 'success',
            status: 'VOICE_VERIFY_SUCCESS',
            riskScore: 0,
            reason: `Transcript: ${transcript}`,
          });

          // Generate interview link after successful voice verification
          const baseUrl = process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_BASE || 'http://localhost:3000';
          
          // Create a proper verification token for interview
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
                throw new Error('Cannot load Tokens model');
              }
            }
          }
          
          const { createTokenDocument } = tokensModel;
          const crypto = require('crypto');
          const interviewToken = crypto.randomUUID(); // Use same format as web verification
          
          try {
            console.log('[Voice Verify] Creating interview token for user:', interaction.user.id);
            
            await createTokenDocument({
              token: interviewToken,
              userId: interaction.user.id,
              guildId: guild.id,
              roleId: memberRoleId,
              status: 'INTERVIEW_REQUIRED',
              interviewLink: `${baseUrl}/interview?token=${interviewToken}&guild=${encodeURIComponent(guild.name)}`,
              reviewedBy: interaction.user.id,
              reviewedAt: new Date(),
              reviewDecision: 'INTERVIEW',
              reviewNotes: 'Voice verification passed, interview required',
              createdAt: new Date(),
            });
            
            console.log('[Voice Verify] Interview token created successfully:', interviewToken);
            
            const interviewLink = `${baseUrl}/interview?token=${interviewToken}&guild=${encodeURIComponent(guild.name)}`;
            
            await interaction.user.send(
              [
                '🎉 Selamat! Verifikasi voice kamu berhasil!',
                '',
                `Sebagai langkah selanjutnya, silakan isi form interview di link berikut:`,
                `${interviewLink}`,
                '',
                'Link ini akan membawa kamu ke halaman interview untuk kelengkapan data.',
              ].join('\n')
            );
            
            console.log('[Voice Verify] Interview link sent to user via DM');
          } catch (dmErr) {
            console.error('[VoiceVerify] Failed to create interview token or send DM:', dmErr);
          }

          await interaction.editReply({
            content: `✅ Verifikasi voice berhasil! Transcript: "${transcript}" (=> ${answer}). Link interview telah dikirim ke DM kamu.`,
          });
          break;
        }

        if (session.attempts >= maxAttempts) {
          await sendVerificationLog({
            client: interaction.client,
            guildId: guild.id,
            config,
            user: interaction.user,
            member: freshMember,
            type: 'warn',
            status: 'VOICE_VERIFY_FAILED',
            riskScore: 0,
            reason: `Expected ${code} but got "${transcript}" (=> ${answer || 'empty'})`,
          });
          await interaction.editReply({
            content: `❌ Verifikasi gagal. Jawaban kamu: "${transcript}" (=> ${answer || 'empty'}). Coba ulang nanti.`,
          });
          break;
        }

        await interaction.followUp({
          content: `Jawaban belum cocok. Transcript: "${transcript}" (=> ${answer || 'empty'}). Coba lagi ya (attempt ${session.attempts}/${maxAttempts}).`,
          flags: 64,
        });
      }
    } catch (error) {
      console.error('[VoiceVerify] Voice verification error:', error);
      await interaction.editReply({
        content: `Voice verify error: ${error?.message || error}. Pastikan bot punya permission Voice Channel dan user sudah join voice.`,
      });
    } finally {
      console.log('[VoiceVerify] Cleaning up session...');
=======
    const system = isEn
      ? 'You are a friendly voice assistant inside a Discord server. Keep answers short and conversational. If asked about verification, explain how to use /verify start. Do not ask for secrets.'
      : 'Kamu adalah asisten voice ramah di server Discord. Jawab singkat dan natural. Kalau ditanya soal verifikasi, jelaskan cara pakai /verify start. Jangan pernah minta secret.';

    const messages = [{ role: 'system', content: system }];
    const maxTurns = Math.max(1, Number(process.env.VOICECHAT_MAX_TURNS) || 6);

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

      const greet = isEn
        ? 'Voice chat started. Ask me a question.'
        : 'Voice chat dimulai. Silakan tanya sesuatu.';

      try {
        const wav = await groqTtsWav(greet, langChoice);
        await playWavToConnection(connection, wav);
      } catch (_) {
        await interaction.followUp({ content: greet, flags: 64 });
      }

      await interaction.editReply({ content: isEn ? '✅ Listening...' : '✅ Mendengarkan...' });

      for (let turn = 0; turn < maxTurns; turn += 1) {
        if (!sessions.has(key)) break;

        await recordUserToWav(connection, interaction.user.id, tmpPath);
        const wavBuf = await fs.promises.readFile(tmpPath);
        const transcriptRaw = await groqTranscribe(wavBuf, path.basename(tmpPath), sttLang);
        const transcript = String(transcriptRaw || '').trim();

        if (!transcript) {
          await interaction.followUp({
            content: isEn ? 'I did not catch that. Try again.' : 'Aku belum menangkap suaranya. Coba lagi ya.',
            flags: 64,
          });
          continue;
        }

        messages.push({ role: 'user', content: transcript });

        const answer = await callGroqChat({ messages, model: process.env.GROQ_MODEL || DEFAULT_CHAT_MODEL });
        messages.push({ role: 'assistant', content: answer });

        try {
          const wav = await groqTtsWav(answer, langChoice);
          await playWavToConnection(connection, wav);
        } catch (err) {
          await interaction.followUp({ content: `TTS error: ${err?.message || err}`, flags: 64 });
          await interaction.followUp({ content: answer.slice(0, 1800), flags: 64 });
        }
      }

      await interaction.followUp({ content: isEn ? 'Voice chat session ended.' : 'Sesi voice chat selesai.', flags: 64 });
    } catch (error) {
      await interaction.editReply({ content: `Voice chat error: ${error?.message || error}` });
    } finally {
>>>>>>> 7874041 (feat: Add music streaming with Lavalink and YouTube support)
      await cleanupSession(key);
    }
  },
};
