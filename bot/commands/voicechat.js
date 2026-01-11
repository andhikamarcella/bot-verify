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
const FALLBACK_TTS_MODEL = process.env.GROQ_TTS_MODEL_FALLBACK || 'playai/resemble-2.0';
const DEFAULT_TTS_VOICE = process.env.GROQ_TTS_VOICE || 'troy';

const sessions = new Map();

if (!globalThis.__voiceConnections) {
  globalThis.__voiceConnections = new Map();
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
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(ch, 22);
  header.writeUInt32LE(sr, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

async function groqTtsWav(text, lang) {
  const apiKey = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_FALLBACK;
  if (!apiKey) throw new Error('missing-groq-api-key');

  const normalized = normalizeTtsText(text, lang);

  async function attempt(model) {
    const res = await fetch(`${GROQ_API_BASE}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        voice: DEFAULT_TTS_VOICE,
        input: String(normalized || '').slice(0, 900),
        response_format: 'wav',
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`tts-failed:${res.status}:${errText.slice(0, 200)}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  try {
    return await attempt(DEFAULT_TTS_MODEL);
  } catch (err) {
    const msg = String(err.message || '');
    if (msg.includes('429') && FALLBACK_TTS_MODEL && FALLBACK_TTS_MODEL !== DEFAULT_TTS_MODEL) {
      try {
        return await attempt(FALLBACK_TTS_MODEL);
      } catch (fallbackErr) {
        throw fallbackErr;
      }
    }
    throw err;
  }
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
}

async function playWavToConnection(connection, wavBuffer) {
  const player = createAudioPlayer();
  const resource = createAudioResource(Readable.from(wavBuffer));
  connection.subscribe(player);
  player.play(resource);
  await entersState(player, AudioPlayerStatus.Playing, 15_000);
  await entersState(player, AudioPlayerStatus.Idle, 90_000);
}

async function recordUserToWav(connection, userId, outPath) {
  const receiver = connection.receiver;
  if (!receiver) throw new Error('receiver-not-available');

  const silenceMs = Math.max(500, Number(process.env.VOICECHAT_SILENCE_MS) || 1200);
  const maxDurationMs = Math.max(3_000, Number(process.env.VOICECHAT_MAX_RECORD_MS) || 12_000);

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
    .setName('voicechat')
    .setDescription('Voice chat interaktif (eksperimental)')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('start')
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
      return;
    }

    if (sessions.has(key)) {
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

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });

    sessions.set(key, { connection, tmpPath, guildId: guild.id });
    try {
      globalThis.__voiceConnections.set(guild.id, connection);
    } catch (_) {
      null;
    }

    await interaction.deferReply({ flags: 64 });

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
      await cleanupSession(key);
    }
  },
};
