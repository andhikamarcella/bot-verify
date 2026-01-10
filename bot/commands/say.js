const { SlashCommandBuilder } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  entersState,
  AudioPlayerStatus,
  VoiceConnectionStatus,
} = require('@discordjs/voice');
const { Readable } = require('stream');
const { ensureStaff } = require('../utils/permissions');

const GROQ_API_BASE = 'https://api.groq.com/openai/v1';
const DEFAULT_TTS_MODEL = process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english';
const DEFAULT_TTS_VOICE = process.env.GROQ_TTS_VOICE || 'troy';

if (!globalThis.__voiceConnections) {
  globalThis.__voiceConnections = new Map();
}

async function groqTtsWav(text) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('missing-groq-api-key');

  const res = await fetch(`${GROQ_API_BASE}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEFAULT_TTS_MODEL,
      voice: DEFAULT_TTS_VOICE,
      input: String(text || '').slice(0, 200),
      response_format: 'wav',
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`tts-failed:${res.status}:${errText.slice(0, 200)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function playWavToConnection(connection, wavBuffer) {
  const player = createAudioPlayer();
  const resource = createAudioResource(Readable.from(wavBuffer));
  connection.subscribe(player);
  player.play(resource);
  await entersState(player, AudioPlayerStatus.Playing, 15_000);
  await entersState(player, AudioPlayerStatus.Idle, 60_000);
}

async function getOrJoinConnection(interaction, channel) {
  const guild = interaction.guild;
  if (!guild) throw new Error('guild-not-available');
  const map = globalThis.__voiceConnections;
  const existing = map.get(guild.id);
  if (existing) {
    return existing;
  }
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });
  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  map.set(guild.id, connection);
  return connection;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Join voice and speak via Orpheus TTS (staff only)')
    .setDMPermission(false)
    .addStringOption((opt) => opt.setName('text').setDescription('Text to speak').setRequired(true)),

  async execute(interaction) {
    try {
      ensureStaff(interaction);
    } catch (_) {
      await interaction.reply({ content: 'Kamu tidak punya izin untuk perintah ini.', flags: 64 });
      return;
    }

    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: 'Command ini hanya bisa dipakai di server.', flags: 64 });
      return;
    }

    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    const channel = member?.voice?.channel;
    if (!channel) {
      await interaction.reply({ content: 'Kamu harus join voice channel dulu.', flags: 64 });
      return;
    }

    const text = interaction.options.getString('text', true);
    await interaction.deferReply({ flags: 64 });

    try {
      const connection = await getOrJoinConnection(interaction, channel);
      const wav = await groqTtsWav(text);
      await playWavToConnection(connection, wav);
      await interaction.editReply({ content: '✅ Selesai bicara.' });
    } catch (error) {
      await interaction.editReply({ content: `Say error: ${error?.message || error}` });
    }
  },
};
