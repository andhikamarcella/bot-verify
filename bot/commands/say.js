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
const { normalizeTtsText } = require('../utils/tts');

const GROQ_API_BASE = 'https://api.groq.com/openai/v1';
const DEFAULT_TTS_MODEL = process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english';
const DEFAULT_TTS_VOICE = process.env.GROQ_TTS_VOICE || 'troy';

if (!globalThis.__voiceConnections) {
  globalThis.__voiceConnections = new Map();
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
  map.set(guild.id, connection);
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (err) {
    try {
      map.delete(guild.id);
    } catch (_) {
      null;
    }
    throw err;
  }
  return connection;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Join voice and speak via Orpheus TTS (staff only)')
    .setDMPermission(false)
    .addStringOption((opt) => opt.setName('text').setDescription('Text to speak').setRequired(true))
    .addStringOption((opt) =>
      opt
        .setName('lang')
        .setDescription('Language for bot replies (default: id)')
        .setRequired(false)
        .addChoices({ name: 'Indonesian', value: 'id' }, { name: 'English', value: 'en' })
    ),

  async execute(interaction) {
    const langChoice = String(interaction.options.getString('lang') || 'id').toLowerCase();
    const isEn = langChoice === 'en';
    try {
      ensureStaff(interaction);
    } catch (_) {
      await interaction.reply({ content: isEn ? 'You do not have permission to use this command.' : 'Kamu tidak punya izin untuk perintah ini.', flags: 64 });
      return;
    }

    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: isEn ? 'This command can only be used in a server.' : 'Command ini hanya bisa dipakai di server.', flags: 64 });
      return;
    }

    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    const channel = member?.voice?.channel;
    if (!channel) {
      await interaction.reply({ content: isEn ? 'You must join a voice channel first.' : 'Kamu harus join voice channel dulu.', flags: 64 });
      return;
    }

    const text = interaction.options.getString('text', true);
    await interaction.deferReply({ flags: 64 });

    try {
      const connection = await getOrJoinConnection(interaction, channel);
      const wav = await groqTtsWav(text, langChoice);
      await playWavToConnection(connection, wav);
      await interaction.editReply({ content: isEn ? '✅ Done.' : '✅ Selesai bicara.' });
    } catch (error) {
      const msg = String(error?.message || error || 'unknown-error');
      if (msg.includes('requires terms acceptance')) {
        await interaction.editReply({
          content:
            isEn
              ? 'Say error: this TTS model requires Terms acceptance in Groq.\n' +
                'Open and accept terms: https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english\n' +
                'Then try again, or change model via env `GROQ_TTS_MODEL`.'
              : 'Say error: model TTS butuh persetujuan Terms di Groq.\n' +
                'Buka dan accept terms di: https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english\n' +
                'Setelah itu coba lagi, atau ganti model via env `GROQ_TTS_MODEL`.',
        });
        return;
      }
      await interaction.editReply({ content: `Say error: ${msg}` });
    }
  },
};
