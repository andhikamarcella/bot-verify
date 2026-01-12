const { SlashCommandBuilder } = require('discord.js');
const { ensureMemberOrHigher, ensureStaff } = require('../utils/permissions');
const { fetchConfig } = require('../utils/guildConfig');
const { sendVerificationLog } = require('../utils/logging');
const { upsertUserProfile } = require('../../api/models/Users');
const { upsertVerificationProfile } = require('../../api/models/VerificationProfiles');

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

async function callGroq({ apiKey, model, messages, tools, toolChoice }) {
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
      messages,
      tools,
      tool_choice: toolChoice,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.error?.message || `Groq HTTP ${res.status}`;
    throw new Error(message);
  }

  const message = json?.choices?.[0]?.message;
  if (!message) {
    throw new Error('empty-response');
  }
  return message;
}

async function moderatePrompt({ apiKey, prompt, model }) {
  const moderationSystem =
    'You are a safety moderation filter for a Discord community bot. Determine if the user message should be allowed.\n' +
    'If the content is spam, harassment, hate, sexual content involving minors, instructions for wrongdoing, or attempts to get secrets, block it.\n' +
    'Output ONLY one line: ALLOW or BLOCK: <short reason>. No extra text.';

  const message = await callGroq({
    apiKey,
    model,
    messages: [
      { role: 'system', content: moderationSystem },
      { role: 'user', content: String(prompt || '') },
    ],
  });
  const trimmed = String(message?.content || '').trim();
  if (/^allow\b/i.test(trimmed)) {
    return { allow: true, reason: '' };
  }
  if (/^block\b/i.test(trimmed)) {
    const reason = trimmed.replace(/^block\s*:\s*/i, '').trim();
    return { allow: false, reason: reason || 'blocked' };
  }
  return { allow: true, reason: '' };
}

function buildAssistantSystem(interaction) {
  const lines = [];

  lines.push('You are the AI assistant for a Discord verification bot.');
  lines.push('Primary job: help users verify themselves and help staff operate the bot safely.');
  lines.push('Be concise and answer in Indonesian when the user speaks Indonesian.');
  lines.push('Never ask for or reveal secrets (API keys, tokens).');
  lines.push('If asked to do moderation actions (kick/ban/etc), explain which slash command to use and required permissions.');
  lines.push('');
  lines.push('How to verify (website flow):');
  lines.push('1) Run /verify start in the server (or click the verify panel button if provided).');
  lines.push('2) Open the verification link from DM/browser.');
  lines.push('3) Complete CAPTCHA.');
  lines.push('4) (Optional) Fill custom nickname or pick a suggestion.');
  lines.push('5) Submit verification. Bot will assign the Member role and apply nickname if configured.');
  lines.push('');
  lines.push('Common issues:');
  lines.push('- Token expired: restart with /verify start.');
  lines.push('- Link used on other device: use the same device or create a new link with /verify start.');
  lines.push('- Blacklisted: contact server staff.');
  lines.push('');
  lines.push('Available slash commands (auto-detected):');

  try {
    const cmdMap = interaction?.client?.commands;
    const entries = [];
    if (cmdMap && typeof cmdMap.entries === 'function') {
      for (const [name, mod] of cmdMap.entries()) {
        const data = mod?.data;
        const cmdName = data?.name || name;
        const desc = data?.description || data?.toJSON?.()?.description || '';
        if (!cmdName) continue;
        entries.push({ name: String(cmdName), desc: String(desc || '') });
      }
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries.slice(0, 60)) {
      lines.push(`/${entry.name}${entry.desc ? ` — ${entry.desc}` : ''}`);
    }
  } catch (_) {
    lines.push('(command list unavailable)');
  }

  const system = lines.join('\n');
  return system.length > 6000 ? system.slice(0, 6000) : system;
}

function parseCsvEnv(value) {
  return String(value || '')
    .split(',')
    .map((v) => String(v || '').trim())
    .filter(Boolean);
}

function getAllowedToolNames() {
  const raw = process.env.AI_TOOL_ALLOWLIST;
  const list = parseCsvEnv(raw);
  return new Set(list.length ? list : ['assignRole', 'markVerified', 'logVerification']);
}

function getAllowedRoleIds() {
  const list = parseCsvEnv(process.env.AI_ALLOWED_ROLE_IDS);
  const fallback = process.env.MEMBER_ROLE_ID ? [String(process.env.MEMBER_ROLE_ID)] : [];
  return new Set(list.length ? list : fallback);
}

function buildAiTools() {
  return [
    {
      type: 'function',
      function: {
        name: 'assignRole',
        description: 'Assign a Discord role to a user in the current guild (allowlist enforced).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            userId: { type: 'string' },
            roleId: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['userId', 'roleId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'markVerified',
        description:
          'Mark a user as verified in the database and optionally assign the member role (allowlist enforced).',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            userId: { type: 'string' },
            reason: { type: 'string' },
            assignMemberRole: { type: 'boolean' },
          },
          required: ['userId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'logVerification',
        description: 'Send a verification log message to the configured logs channel.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            userId: { type: 'string' },
            status: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['userId', 'status'],
        },
      },
    },
  ];
}

async function toolAssignRole(interaction, args) {
  const guild = interaction.guild;
  if (!guild) throw new Error('guild-not-available');
  const allowedRoleIds = getAllowedRoleIds();
  const userId = String(args?.userId || '');
  const roleId = String(args?.roleId || '');
  const reason = typeof args?.reason === 'string' ? args.reason : undefined;
  if (!userId || !roleId) throw new Error('invalid-args');
  if (!allowedRoleIds.has(roleId)) throw new Error('role-not-allowed');

  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) throw new Error('role-not-found');
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) throw new Error('member-not-found');

  const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!botMember) throw new Error('bot-member-not-found');
  if (!botMember.permissions.has('ManageRoles')) throw new Error('bot-missing-manage-roles');
  if (role.position >= botMember.roles.highest.position) throw new Error('role-too-high');

  await member.roles.add(roleId, reason || 'AI tool: assignRole');
  return { ok: true, userId, roleId };
}

async function toolMarkVerified(interaction, args) {
  const guild = interaction.guild;
  if (!guild) throw new Error('guild-not-available');

  const userId = String(args?.userId || '');
  if (!userId) throw new Error('invalid-args');

  const assignMemberRole = args?.assignMemberRole !== false;
  const memberRoleId = process.env.MEMBER_ROLE_ID ? String(process.env.MEMBER_ROLE_ID) : null;
  const reason = typeof args?.reason === 'string' ? args.reason : null;

  if (assignMemberRole && memberRoleId) {
    await toolAssignRole(interaction, { userId, roleId: memberRoleId, reason: reason || 'markVerified' });
  }

  await upsertUserProfile({
    userId,
    guildId: guild.id,
    badgeEmoji: '🛡️',
    badgeName: 'Verified Member',
    suspicious: false,
    suspiciousReason: null,
    verifiedAt: new Date(),
  });

  await upsertVerificationProfile({
    userId,
    guildId: guild.id,
    isSuspect: false,
    suspectReasons: [],
    incrementAttempts: false,
    riskScore: 0,
  });

  return { ok: true, userId, guildId: guild.id, assignedMemberRole: Boolean(assignMemberRole && memberRoleId) };
}

async function toolLogVerification(interaction, args) {
  const guild = interaction.guild;
  if (!guild) throw new Error('guild-not-available');

  const userId = String(args?.userId || '');
  const status = String(args?.status || '');
  const reason = typeof args?.reason === 'string' ? args.reason : null;
  if (!userId || !status) throw new Error('invalid-args');

  const config = await fetchConfig(guild.id);
  const member = await guild.members.fetch(userId).catch(() => null);
  const user = member?.user || (await interaction.client.users.fetch(userId).catch(() => null));

  await sendVerificationLog({
    client: interaction.client,
    guildId: guild.id,
    config,
    user,
    member,
    type: 'info',
    status,
    riskScore: 0,
    reason,
  });

  return { ok: true, userId, status };
}

async function runTool(interaction, toolCall) {
  const allowedTools = getAllowedToolNames();
  const name = toolCall?.function?.name;
  if (!name || !allowedTools.has(name)) {
    throw new Error('tool-not-allowed');
  }
  let args = toolCall?.function?.arguments;
  if (typeof args === 'string') {
    args = JSON.parse(args);
  }
  if (!args || typeof args !== 'object') {
    throw new Error('invalid-args');
  }
  if (name === 'assignRole') return toolAssignRole(interaction, args);
  if (name === 'markVerified') return toolMarkVerified(interaction, args);
  if (name === 'logVerification') return toolLogVerification(interaction, args);
  throw new Error('tool-not-implemented');
}

async function callGroqChat(prompt, language = 'id', systemPrompt = null) {
  const apiKey = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_FALLBACK;
  if (!apiKey) throw new Error('missing-groq-api-key');

  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;
  
  // Build messages array
  const messages = [];
  
  // Add system prompt if provided
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  } else {
    // Default system prompt
    const defaultSystem = language === 'en' 
      ? 'You are a helpful AI assistant. Be friendly and concise.'
      : 'Kamu adalah asisten AI yang helpful. Jawab dengan ramah dan singkat.';
    messages.push({ role: 'system', content: defaultSystem });
  }
  
  // Add user prompt
  messages.push({ role: 'user', content: String(prompt) });

  const response = await callGroq({ apiKey, model, messages });
  return response?.content || 'Maaf, aku tidak bisa menjawab saat ini.';
}

// Export functions for use in other files
module.exports.callGroq = callGroq;
module.exports.callGroqChat = callGroqChat;

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
        .setDescription('Tampilkan ke semua orang (default: private)')
        .setRequired(false)
    )
    .addBooleanOption((opt) =>
      opt
        .setName('execute')
        .setDescription('Izinkan AI menjalankan aksi (STAFF ONLY)')
        .setRequired(false)
    ),

  async execute(interaction, client) {
    try {
      ensureMemberOrHigher(interaction);
    } catch (_) {
      try {
        ensureStaff(interaction);
      } catch (err) {
        await interaction.reply({
          content: 'Fitur ini hanya untuk user yang sudah memiliki role Member.',
          flags: 64,
        });
        return;
      }
    }

    const apiKey = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_FALLBACK;
    if (!apiKey) {
      await interaction.reply({
        content: 'GROQ_API_KEY / GROQ_API_KEY_FALLBACK belum diset di environment bot.',
        flags: 64,
      });
      return;
    }

    const prompt = interaction.options.getString('prompt', true);
    const isPublic = Boolean(interaction.options.getBoolean('public'));
    const execute = Boolean(interaction.options.getBoolean('execute'));

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

      let tools = undefined;
      let toolChoice = undefined;
      let toolExecutionEnabled = false;
      if (execute) {
        try {
          ensureStaff(interaction);
          toolExecutionEnabled = true;
          tools = buildAiTools();
          toolChoice = 'auto';
        } catch (_) {
          toolExecutionEnabled = false;
        }
      }

      const system = buildAssistantSystem(interaction);
      const messages = [
        { role: 'system', content: system },
        { role: 'user', content: String(prompt || '') },
      ];

      const first = await callGroq({ apiKey, model, messages, tools, toolChoice });
      const toolCalls = Array.isArray(first?.tool_calls) ? first.tool_calls : [];

      if (toolCalls.length > 0 && !toolExecutionEnabled) {
        const chunks = chunkText(
          'AI meminta menjalankan aksi, tapi eksekusi tool tidak diizinkan. Gunakan /ai execute:true (STAFF ONLY).',
          1800
        );
        await interaction.editReply({
          content: `**Q:** ${prompt.slice(0, 400)}\n\n${chunks[0]}`,
        });
        return;
      }

      let finalMessage = first;
      if (toolExecutionEnabled && toolCalls.length > 0) {
        const toolResults = [];
        for (const tc of toolCalls.slice(0, 5)) {
          try {
            const result = await runTool(interaction, tc);
            toolResults.push({ id: tc.id, ok: true, result });
          } catch (error) {
            toolResults.push({ id: tc.id, ok: false, error: error?.message || String(error) });
          }
        }

        const followMessages = messages.concat([
          {
            role: 'assistant',
            content: first?.content ?? null,
            tool_calls: toolCalls,
          },
          ...toolResults.map((r) => ({
            role: 'tool',
            tool_call_id: r.id,
            content: JSON.stringify(r),
          })),
        ]);

        finalMessage = await callGroq({
          apiKey,
          model,
          messages: followMessages,
          tools: buildAiTools(),
          toolChoice: 'none',
        });
      }

      const answerText = String(finalMessage?.content || '').trim();
      if (!answerText) {
        throw new Error('empty-response');
      }
      const chunks = chunkText(answerText, 1800);

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
