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
const { fetchConfig } = require('../utils/guildConfig');
const { sendVerificationLog } = require('../utils/logging');
const { normalizeTtsText } = require('../utils/tts');

const GROQ_API_BASE = 'https://api.groq.com/openai/v1';
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
}

async function groqTtsWav(text, lang) {
  const apiKey = process.env.GROQ_API_KEY;
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
      input: String(normalized || '').slice(0, 600),
      response_format: 'wav',
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`tts-failed:${res.status}:${errText.slice(0, 200)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

async function groqTranscribe(fileBuffer, filename, language) {
  const apiKey = process.env.GROQ_API_KEY;
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

async function playWavToConnection(connection, wavBuffer) {
  const player = createAudioPlayer();
  const resource = createAudioResource(Readable.from(wavBuffer));
  connection.subscribe(player);
  player.play(resource);
  await entersState(player, AudioPlayerStatus.Playing, 15_000);
  await entersState(player, AudioPlayerStatus.Idle, 60_000);
}

async function recordUserToWav(connection, userId, outPath) {
  const receiver = connection.receiver;
  if (!receiver) throw new Error('receiver-not-available');

  const silenceMs = Math.max(500, Number(process.env.VOICEVERIFY_SILENCE_MS) || 1200);
  const maxDurationMs = Math.max(3_000, Number(process.env.VOICEVERIFY_MAX_RECORD_MS) || 10_000);

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
    .setName('voiceverify')
    .setDescription('Verifikasi via voice channel (eksperimental)')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('start')
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
      await interaction.reply({ content: 'Voice verification dihentikan.', flags: 64 });
      return;
    }

    // start
    const memberRoleId = process.env.MEMBER_ROLE_ID;
    if (!memberRoleId) {
      await interaction.reply({ content: 'MEMBER_ROLE_ID belum diset di environment bot.', flags: 64 });
      return;
    }

    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: 'Gagal fetch member dari guild. Coba lagi sebentar.', flags: 64 });
      return;
    }
    if (member?.roles?.cache?.has?.(memberRoleId)) {
      const roleName = guild.roles?.cache?.get(memberRoleId)?.name;
      const roleInfo = roleName ? `${roleName} (${memberRoleId})` : memberRoleId;
      await interaction.reply({ content: `Kamu terdeteksi sudah punya role Member (${roleInfo}), tidak perlu verifikasi ulang. Kalau ini salah, cek MEMBER_ROLE_ID di .env.`, flags: 64 });
      return;
    }

    if (sessions.has(key)) {
      await interaction.reply({ content: 'Sesi verifikasi voice kamu masih berjalan. Gunakan /voiceverify stop untuk batal.', flags: 64 });
      return;
    }

    const channel = member?.voice?.channel;
    if (!channel) {
      await interaction.reply({ content: 'Kamu harus join voice channel dulu.', flags: 64 });
      return;
    }

    const config = await fetchConfig(guild.id);

    const langChoice = String(interaction.options.getString('lang') || 'id').toLowerCase();
    const sttLang = langChoice === 'en' ? 'en' : 'id';

    const code = randomDigits(Number(process.env.VOICEVERIFY_DIGITS) || 3);
    const maxAttempts = Math.max(1, Number(process.env.VOICEVERIFY_MAX_ATTEMPTS) || 3);

    const tmpPath = path.join(os.tmpdir(), `voiceverify-${guild.id}-${interaction.user.id}-${Date.now()}.wav`);

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    sessions.set(key, { connection, tmpPath, attempts: 0, code, guildId: guild.id });
    try {
      globalThis.__voiceConnections.set(guild.id, connection);
    } catch (_) {
      null;
    }

    await interaction.deferReply({ flags: 64 });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

      const prompt =
        langChoice === 'en'
          ? `Hello. Please say the digits: ${digitsWithHyphens(code)}.`
          : `Halo. Sebutkan angka: ${digitsWithHyphens(code)}.`;
      try {
        const wav = await groqTtsWav(prompt, langChoice);
        await playWavToConnection(connection, wav);
      } catch (error) {
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

        await recordUserToWav(connection, interaction.user.id, tmpPath);
        const oggBuf = await fs.promises.readFile(tmpPath);
        const transcript = await groqTranscribe(oggBuf, path.basename(tmpPath), sttLang);
        const answer = normalizeAnswer(transcript);

        if (answer === code) {
          const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
          if (!botMember?.permissions?.has?.('ManageRoles')) {
            throw new Error('bot-missing-manage-roles');
          }
          await member.roles.add(memberRoleId, 'voiceverify');

          await sendVerificationLog({
            client: interaction.client,
            guildId: guild.id,
            config,
            user: interaction.user,
            member,
            type: 'success',
            status: 'VOICE_VERIFY_SUCCESS',
            riskScore: 0,
            reason: `Transcript: ${transcript}`,
          });

          await interaction.editReply({
            content: `✅ Verifikasi voice berhasil! Transcript: "${transcript}" (=> ${answer})`,
          });
          break;
        }

        if (session.attempts >= maxAttempts) {
          await sendVerificationLog({
            client: interaction.client,
            guildId: guild.id,
            config,
            user: interaction.user,
            member,
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
      await interaction.editReply({
        content: `Voice verify error: ${error?.message || error}`,
      });
    } finally {
      await cleanupSession(key);
    }
  },
};
