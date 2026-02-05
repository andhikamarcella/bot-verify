const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const os = require('os');
const { connectMongo } = require('../../api/lib/db');
const { getPresenceMode } = require('../bot');
const { getGroqApiKey } = require('../utils/groqAudio');

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

function formatDurationSeconds(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

async function checkGroqQuick() {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    return { ok: false, error: 'missing-groq-api-key' };
  }

  const candidates = uniq([
    sanitizeEnvString(process.env.GROQ_MODEL),
    sanitizeEnvString(process.env.GROQ_MODEL_FALLBACK),
    ...String(process.env.GROQ_MODEL_FALLBACKS || '')
      .split(',')
      .map((v) => sanitizeEnvString(v))
      .filter(Boolean),
    'llama-3.3-70b-versatile',
    'llama-3.1-70b-versatile',
    'llama3-70b-8192',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
  ]);

  const url = 'https://api.groq.com/openai/v1/chat/completions';
  let lastError = null;

  for (const model of candidates.length ? candidates : ['llama-3.3-70b-versatile']) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 8,
        messages: [
          { role: 'system', content: 'Reply with OK only.' },
          { role: 'user', content: 'ping' },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      lastError = `groq:${res.status}:${text.slice(0, 160)}`;
      if (res.status === 400 || res.status === 404) {
        const lower = text.toLowerCase();
        if (lower.includes('model') || lower.includes('not found') || lower.includes('invalid') || lower.includes('unknown')) {
          continue;
        }
      }
      return { ok: false, error: lastError };
    }

    const json = await res.json().catch(() => null);
    const content = json?.choices?.[0]?.message?.content;
    if (!content) {
      lastError = 'groq:empty-response';
      continue;
    }
    return { ok: true, model };
  }

  return { ok: false, error: lastError || 'groq:failed' };
}

async function checkHttpOk(url) {
  const clean = sanitizeEnvString(url);
  if (!clean) return { ok: false, error: 'missing-url' };
  const res = await fetch(clean, { method: 'GET' }).catch((e) => ({ ok: false, status: 0, statusText: String(e?.message || 'fetch-failed') }));
  if (!res || res.ok === false) {
    return { ok: false, error: res?.statusText || 'fetch-failed' };
  }
  if (!res.ok) {
    return { ok: false, error: `http:${res.status}` };
  }
  return { ok: true, status: res.status };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Cek kesehatan bot, database, dan integrasi AI')
    .setDMPermission(false)
    .addBooleanOption((opt) =>
      opt
        .setName('deep')
        .setDescription('Jalankan cek eksternal (Mongo/Groq/URL) (lebih lambat)')
        .setRequired(false)
    ),

  async execute(interaction, client) {
    const deep = Boolean(interaction.options.getBoolean('deep'));
    await interaction.deferReply({ flags: 64 });

    const frontend = sanitizeUrlBase(process.env.PUBLIC_FRONTEND_URL);
    const apiBase = sanitizeUrlBase(process.env.API_BASE_URL);
    const discordInvite = sanitizeEnvString(process.env.DISCORD_BROWSER_URL || process.env.DISCORD_INVITE_LINK);
    const hasGroq = Boolean(getGroqApiKey());

    const envChecks = [
      { k: 'DISCORD_TOKEN', ok: Boolean(process.env.DISCORD_TOKEN) },
      { k: 'DISCORD_CLIENT_ID', ok: Boolean(process.env.DISCORD_CLIENT_ID) },
      { k: 'GUILD_ID', ok: Boolean(process.env.GUILD_ID) },
      { k: 'MEMBER_ROLE_ID', ok: Boolean(process.env.MEMBER_ROLE_ID) },
      { k: 'MONGO_URI', ok: Boolean(process.env.MONGO_URI) },
      { k: 'PUBLIC_FRONTEND_URL', ok: Boolean(frontend) },
      { k: 'API_BASE_URL', ok: Boolean(apiBase) },
      { k: 'GROQ_API_KEY(/fallback)', ok: hasGroq },
    ];

    const envLine = envChecks.map((e) => `${e.ok ? '✅' : '❌'} ${e.k}`).join('\n');

    const uptime = formatDurationSeconds(process.uptime());
    const wsPing = client?.ws?.ping;
    const voiceCount = globalThis.__voiceConnections?.size || 0;

    const embed = new EmbedBuilder()
      .setTitle('🩺 Status Bot')
      .setColor(0x2ecc71)
      .addFields(
        {
          name: 'Runtime',
          value:
            `Uptime: **${uptime}**\n` +
            `WS Ping: **${Number.isFinite(wsPing) ? Math.round(wsPing) : '?'}ms**\n` +
            `Guilds: **${client?.guilds?.cache?.size ?? '?'}**\n` +
            `Voice connections: **${voiceCount}**`,
          inline: false,
        },
        {
          name: 'Konfigurasi',
          value:
            `Presence mode: **${getPresenceMode()}**\n` +
            `Frontend: ${frontend ? `**${frontend}**` : '❌ (belum diset)'}\n` +
            `API: ${apiBase ? `**${apiBase}**` : '❌ (belum diset)'}\n` +
            `Invite: ${discordInvite ? `**${discordInvite}**` : '—'}`,
          inline: false,
        },
        {
          name: 'Env Check',
          value: envLine.length > 1024 ? envLine.slice(0, 1021) + '...' : envLine,
          inline: false,
        }
      )
      .setFooter({ text: `Node ${process.version} • ${os.platform()} ${os.release()}` });

    if (deep) {
      const results = [];

      const mongoRes = await connectMongo()
        .then(() => ({ ok: true }))
        .catch((e) => ({ ok: false, error: String(e?.message || 'mongo-failed').slice(0, 120) }));
      results.push(`${mongoRes.ok ? '✅' : '❌'} MongoDB${mongoRes.ok ? '' : ` (${mongoRes.error})`}`);

      const groqRes = await checkGroqQuick().catch((e) => ({ ok: false, error: String(e?.message || 'groq-failed').slice(0, 160) }));
      results.push(`${groqRes.ok ? '✅' : '❌'} Groq Chat${groqRes.ok ? ` (model: ${groqRes.model})` : ` (${groqRes.error})`}`);

      if (frontend) {
        const urlCheck = await checkHttpOk(frontend).catch((e) => ({ ok: false, error: String(e?.message || 'fetch-failed') }));
        results.push(`${urlCheck.ok ? '✅' : '❌'} Frontend URL${urlCheck.ok ? '' : ` (${urlCheck.error})`}`);
      }

      if (apiBase) {
        const urlCheck = await checkHttpOk(apiBase).catch((e) => ({ ok: false, error: String(e?.message || 'fetch-failed') }));
        results.push(`${urlCheck.ok ? '✅' : '❌'} API URL${urlCheck.ok ? '' : ` (${urlCheck.error})`}`);
      }

      embed.addFields({
        name: 'Deep Check',
        value: results.join('\n').slice(0, 1024),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

