const fs = require('fs');
const { Readable } = require('stream');
const prism = require('prism-media');
const { EndBehaviorType, createAudioPlayer, createAudioResource, entersState, AudioPlayerStatus } = require('@discordjs/voice');
const { normalizeTtsText } = require('./tts');

const GROQ_API_BASE = 'https://api.groq.com/openai/v1';

function getGroqApiKey() {
  return process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_FALLBACK || '';
}

function requireGroqApiKey() {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error('missing-groq-api-key');
  }
  return apiKey;
}

function createWavBuffer(pcmBuffer, sampleRate = 48000, channels = 1) {
  const dataLength = pcmBuffer.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);
  return Buffer.concat([header, pcmBuffer]);
}

async function groqTranscribe(wavBuffer, filename = 'audio.wav', language = undefined) {
  const apiKey = requireGroqApiKey();
  const model = process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';

  const formData = new FormData();
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  formData.append('file', blob, filename);
  formData.append('model', model);
  const envLang = process.env.GROQ_STT_LANGUAGE;
  const lang = language || envLang;
  if (lang && String(lang).trim()) {
    formData.append('language', String(lang).trim());
  }

  const res = await fetch(`${GROQ_API_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error?.message || `stt-failed:${res.status}`;
    throw new Error(msg);
  }
  return String(json?.text || '');
}

function uniqPush(arr, value) {
  const v = String(value || '').trim();
  if (!v) return;
  if (!arr.includes(v)) arr.push(v);
}

function parseCsvEnv(value) {
  return String(value || '')
    .split(',')
    .map((v) => String(v || '').trim())
    .filter(Boolean);
}

async function groqTtsWav(text, lang = undefined) {
  const apiKey = requireGroqApiKey();
  const normalized = normalizeTtsText(text, lang);

  const modelCandidates = [];
  uniqPush(modelCandidates, process.env.GROQ_TTS_MODEL);
  uniqPush(modelCandidates, process.env.GROQ_TTS_MODEL_FALLBACK);
  for (const m of parseCsvEnv(process.env.GROQ_TTS_MODEL_FALLBACKS)) uniqPush(modelCandidates, m);
  uniqPush(modelCandidates, 'canopylabs/orpheus-v1-english');
  uniqPush(modelCandidates, 'playai-tts');

  const voiceCandidates = [];
  uniqPush(voiceCandidates, process.env.GROQ_TTS_VOICE);
  uniqPush(voiceCandidates, process.env.GROQ_TTS_VOICE_FALLBACK);
  for (const v of parseCsvEnv(process.env.GROQ_TTS_VOICE_FALLBACKS)) uniqPush(voiceCandidates, v);
  for (const v of ['troy', 'hannah', 'austin', 'alloy']) uniqPush(voiceCandidates, v);

  let lastErr = null;

  for (const model of modelCandidates.length ? modelCandidates : ['canopylabs/orpheus-v1-english']) {
    for (const voice of voiceCandidates.length ? voiceCandidates : ['troy']) {
      const res = await fetch(`${GROQ_API_BASE}/audio/speech`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          voice,
          input: String(normalized || '').slice(0, 600),
          response_format: 'wav',
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        lastErr = new Error(`tts-failed:${res.status}:${errText.slice(0, 200)}`);
        if (res.status === 400 || res.status === 404) {
          const lower = errText.toLowerCase();
          if (lower.includes('model') || lower.includes('voice') || lower.includes('not found') || lower.includes('invalid') || lower.includes('unknown')) {
            continue;
          }
        }
        throw lastErr;
      }

      return Buffer.from(await res.arrayBuffer());
    }
  }

  throw lastErr || new Error('tts-failed');
}

async function playWavBuffer(connection, wavBuffer, timeoutMs = 60_000) {
  const player = createAudioPlayer();
  const resource = createAudioResource(Readable.from(wavBuffer));
  connection.subscribe(player);
  player.play(resource);
  await entersState(player, AudioPlayerStatus.Playing, 15_000);
  await entersState(player, AudioPlayerStatus.Idle, timeoutMs);
  return player;
}

async function recordUserToWavBuffer(connection, userId, opts = {}) {
  const silenceMs = Math.max(300, Number(opts.silenceMs ?? process.env.VOICEVERIFY_SILENCE_MS ?? 1200));
  const maxRecordMs = Math.max(1000, Number(opts.maxRecordMs ?? process.env.VOICEVERIFY_MAX_RECORD_MS ?? 10000));
  const receiver = connection.receiver;

  const opusStream = receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: silenceMs,
    },
  });

  const decoder = new prism.opus.Decoder({ rate: 48000, channels: 1, frameSize: 960 });
  const pcmStream = opusStream.pipe(decoder);
  const pcmChunks = [];

  const timeout = setTimeout(() => {
    try {
      opusStream.destroy();
    } catch (_) {
      null;
    }
  }, maxRecordMs);

  try {
    for await (const chunk of pcmStream) {
      pcmChunks.push(chunk);
    }
  } finally {
    clearTimeout(timeout);
  }

  const pcmBuffer = Buffer.concat(pcmChunks);
  return createWavBuffer(pcmBuffer, 48000, 1);
}

async function recordUserToWav(connection, userId, outputPath, opts = {}) {
  const wavBuffer = await recordUserToWavBuffer(connection, userId, opts);
  await fs.promises.writeFile(outputPath, wavBuffer);
  return wavBuffer;
}

module.exports = {
  GROQ_API_BASE,
  getGroqApiKey,
  requireGroqApiKey,
  createWavBuffer,
  groqTranscribe,
  groqTtsWav,
  playWavBuffer,
  recordUserToWavBuffer,
  recordUserToWav,
};
