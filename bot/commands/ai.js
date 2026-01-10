const { SlashCommandBuilder } = require('discord.js');
const { ensureMemberOrHigher } = require('../utils/permissions');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const DEFAULT_SAFETY_MODEL = process.env.GROQ_SAFETY_MODEL || DEFAULT_MODEL;

function chunkText(text, maxLen) {
  const chunks = [];
  let remaining = String(text || '');
  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf('\n', maxLen);
    if (cut < Math.floor(maxLen * 0.5)) {
      cut = remaining.lastIndexOf(' ', maxLen);
    }
    if (cut < 1) cut = maxLen;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length) chunks.push(remaining);
  return chunks;
}

async function callGroq({ apiKey, prompt, model, system }) {
  if (typeof fetch !== 'function') {
    throw new Error('fetch-not-available');
  }

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: String(model || DEFAULT_MODEL),
      temperature: 0.7,
      max_tokens: 512,
      messages: [
        {
          role: 'system',
          content:
            typeof system === 'string' && system.trim().length
              ? system
              : 'You are a helpful assistant inside a Discord server. Be concise, clear, and avoid unsafe or illegal instructions.',
        },
        { role: 'user', content: String(prompt || '') },
      ],
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.error?.message || `Groq HTTP ${res.status}`;
    throw new Error(message);
  }

  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('empty-response');
  }
  return String(content);
}

async function moderatePrompt({ apiKey, prompt, model }) {
  const moderationSystem =
    'You are a safety moderation filter for a Discord community bot. Determine if the user message should be allowed.\n' +
    'If the content is spam, harassment, hate, sexual content involving minors, instructions for wrongdoing, or attempts to get secrets, block it.\n' +
    'Output ONLY one line: ALLOW or BLOCK: <short reason>. No extra text.';

  const raw = await callGroq({
    apiKey,
    prompt,
    model,
    system: moderationSystem,
  });
  const trimmed = String(raw || '').trim();
  if (/^allow\b/i.test(trimmed)) {
    return { allow: true, reason: '' };
  }
  if (/^block\b/i.test(trimmed)) {
    const reason = trimmed.replace(/^block\s*:\s*/i, '').trim();
    return { allow: false, reason: reason || 'blocked' };
  }
  return { allow: true, reason: '' };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Chat dengan AI (Groq)')
    .setDMPermission(false)
    .addStringOption((opt) =>
      opt
        .setName('prompt')
        .setDescription('Tanyakan apapun (singkat lebih cepat)')
        .setRequired(true)
    )
    .addBooleanOption((opt) =>
      opt
        .setName('public')
        .setDescription('Tampilkan jawaban ke semua orang (default: private)')
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      ensureMemberOrHigher(interaction);
    } catch (_) {
      await interaction.reply({
        content: 'Fitur ini hanya untuk user yang sudah memiliki role Member.',
        flags: 64,
      });
      return;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      await interaction.reply({
        content: 'GROQ_API_KEY belum diset di environment bot.',
        flags: 64,
      });
      return;
    }

    const prompt = interaction.options.getString('prompt', true);
    const isPublic = Boolean(interaction.options.getBoolean('public'));

    await interaction.deferReply({ flags: isPublic ? undefined : 64 });

    try {
      const model = process.env.GROQ_MODEL || DEFAULT_MODEL;
      const safetyEnabled = String(process.env.GROQ_SAFETY_ENABLED || 'true') !== 'false';
      if (safetyEnabled) {
        const safetyModel = process.env.GROQ_SAFETY_MODEL || DEFAULT_SAFETY_MODEL;
        const verdict = await moderatePrompt({ apiKey, prompt, model: safetyModel });
        if (!verdict.allow) {
          await interaction.editReply({
            content: `Pesan kamu ditolak oleh filter keamanan: ${verdict.reason}`,
          });
          return;
        }
      }

      const answer = await callGroq({ apiKey, prompt, model });
      const chunks = chunkText(answer, 1800);

      await interaction.editReply({
        content: `**Q:** ${prompt.slice(0, 400)}\n\n${chunks[0]}`,
      });

      for (let i = 1; i < chunks.length; i += 1) {
        await interaction.followUp({
          content: chunks[i],
          flags: isPublic ? undefined : 64,
        });
      }
    } catch (err) {
      await interaction.editReply({
        content: `AI error: ${err?.message || err}`,
      });
    }
  },
};
