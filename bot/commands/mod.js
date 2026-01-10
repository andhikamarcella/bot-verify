const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { ensureStaff } = require('../utils/permissions');

function parseMessageLink(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const m = raw.match(/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/i);
  if (m) {
    return { guildId: m[1], channelId: m[2], messageId: m[3] };
  }
  if (/^\d{16,20}$/.test(raw)) {
    return { guildId: null, channelId: null, messageId: raw };
  }
  return null;
}

async function fetchTargetMessage(interaction, channel, messageRef) {
  if (!channel) throw new Error('channel-not-found');
  if (!messageRef?.messageId) throw new Error('invalid-message');
  return channel.messages.fetch(messageRef.messageId);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderation tools (staff only)')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('kick')
        .setDescription('Kick a member')
        .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason'))
    )
    .addSubcommand((sub) =>
      sub
        .setName('ban')
        .setDescription('Ban a member')
        .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason'))
        .addIntegerOption((opt) =>
          opt
            .setName('delete_days')
            .setDescription('Delete message history (days, 0-7)')
            .setMinValue(0)
            .setMaxValue(7)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('timeout')
        .setDescription('Timeout a member')
        .addUserOption((opt) => opt.setName('user').setDescription('Target user').setRequired(true))
        .addIntegerOption((opt) =>
          opt
            .setName('minutes')
            .setDescription('Duration in minutes')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(60 * 24 * 28)
        )
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason'))
    )
    .addSubcommand((sub) =>
      sub
        .setName('pin')
        .setDescription('Pin a message')
        .addChannelOption((opt) => opt.setName('channel').setDescription('Channel containing the message').setRequired(true))
        .addStringOption((opt) =>
          opt
            .setName('message')
            .setDescription('Message link or ID')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('react')
        .setDescription('Add reaction to a message')
        .addChannelOption((opt) => opt.setName('channel').setDescription('Channel containing the message').setRequired(true))
        .addStringOption((opt) =>
          opt
            .setName('message')
            .setDescription('Message link or ID')
            .setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('emoji')
            .setDescription('Emoji (unicode or custom <:name:id>)')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('announce')
        .setDescription('Send an announcement message')
        .addChannelOption((opt) => opt.setName('channel').setDescription('Target channel').setRequired(true))
        .addStringOption((opt) => opt.setName('text').setDescription('Announcement text').setRequired(true))
        .addBooleanOption((opt) =>
          opt.setName('everyone').setDescription('Mention @everyone (requires permission)').setRequired(false)
        )
        .addBooleanOption((opt) => opt.setName('tts').setDescription('Send as TTS message').setRequired(false))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    try {
      ensureStaff(interaction);
    } catch (error) {
      await interaction.reply({ content: 'Kamu tidak punya izin untuk perintah ini.', flags: 64 });
      return;
    }

    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: 'Command ini hanya bisa dipakai di server.', flags: 64 });
      return;
    }

    if (sub === 'kick') {
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') || 'mod.kick';
      await interaction.deferReply({ flags: 64 });
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        await interaction.editReply({ content: 'Member tidak ditemukan.' });
        return;
      }
      if (!guild.members.me?.permissions.has(PermissionFlagsBits.KickMembers)) {
        await interaction.editReply({ content: 'Bot tidak punya permission Kick Members.' });
        return;
      }
      await member.kick(reason);
      await interaction.editReply({ content: `✅ Kick berhasil: <@${user.id}>` });
      return;
    }

    if (sub === 'ban') {
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') || 'mod.ban';
      const deleteDays = interaction.options.getInteger('delete_days') ?? 0;
      await interaction.deferReply({ flags: 64 });
      if (!guild.members.me?.permissions.has(PermissionFlagsBits.BanMembers)) {
        await interaction.editReply({ content: 'Bot tidak punya permission Ban Members.' });
        return;
      }
      await guild.members.ban(user.id, { reason, deleteMessageSeconds: Math.max(0, Math.min(deleteDays, 7)) * 86400 });
      await interaction.editReply({ content: `✅ Ban berhasil: <@${user.id}>` });
      return;
    }

    if (sub === 'timeout') {
      const user = interaction.options.getUser('user', true);
      const minutes = interaction.options.getInteger('minutes', true);
      const reason = interaction.options.getString('reason') || 'mod.timeout';
      await interaction.deferReply({ flags: 64 });
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        await interaction.editReply({ content: 'Member tidak ditemukan.' });
        return;
      }
      if (!guild.members.me?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        await interaction.editReply({ content: 'Bot tidak punya permission Moderate Members.' });
        return;
      }
      const ms = Math.max(1, minutes) * 60 * 1000;
      await member.timeout(ms, reason);
      await interaction.editReply({ content: `✅ Timeout berhasil: <@${user.id}> (${minutes} menit)` });
      return;
    }

    if (sub === 'pin') {
      const channel = interaction.options.getChannel('channel', true);
      const msgRaw = interaction.options.getString('message', true);
      const parsed = parseMessageLink(msgRaw);
      await interaction.deferReply({ flags: 64 });
      if (!parsed) {
        await interaction.editReply({ content: 'Format message tidak valid. Pakai link atau message ID.' });
        return;
      }
      if (!channel?.isTextBased?.()) {
        await interaction.editReply({ content: 'Channel harus berupa text channel.' });
        return;
      }
      if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageMessages)) {
        await interaction.editReply({ content: 'Bot tidak punya permission Manage Messages.' });
        return;
      }
      const message = await fetchTargetMessage(interaction, channel, parsed).catch(() => null);
      if (!message) {
        await interaction.editReply({ content: 'Message tidak ditemukan.' });
        return;
      }
      await message.pin();
      await interaction.editReply({ content: '✅ Message berhasil dipin.' });
      return;
    }

    if (sub === 'react') {
      const channel = interaction.options.getChannel('channel', true);
      const msgRaw = interaction.options.getString('message', true);
      const emoji = interaction.options.getString('emoji', true);
      const parsed = parseMessageLink(msgRaw);
      await interaction.deferReply({ flags: 64 });
      if (!parsed) {
        await interaction.editReply({ content: 'Format message tidak valid. Pakai link atau message ID.' });
        return;
      }
      if (!channel?.isTextBased?.()) {
        await interaction.editReply({ content: 'Channel harus berupa text channel.' });
        return;
      }
      const message = await fetchTargetMessage(interaction, channel, parsed).catch(() => null);
      if (!message) {
        await interaction.editReply({ content: 'Message tidak ditemukan.' });
        return;
      }
      await message.react(emoji);
      await interaction.editReply({ content: '✅ Reaction berhasil ditambahkan.' });
      return;
    }

    if (sub === 'announce') {
      const channel = interaction.options.getChannel('channel', true);
      const text = interaction.options.getString('text', true);
      const everyone = Boolean(interaction.options.getBoolean('everyone'));
      const tts = Boolean(interaction.options.getBoolean('tts'));
      await interaction.deferReply({ flags: 64 });
      if (!channel?.isTextBased?.()) {
        await interaction.editReply({ content: 'Channel harus berupa text channel.' });
        return;
      }

      if (everyone) {
        const me = guild.members.me;
        if (!me?.permissions.has(PermissionFlagsBits.MentionEveryone)) {
          await interaction.editReply({ content: 'Bot tidak punya permission Mention Everyone.' });
          return;
        }
      }

      const content = `${everyone ? '@everyone\n' : ''}${text}`;
      await channel.send({ content, tts });
      await interaction.editReply({ content: '✅ Announcement terkirim.' });
      return;
    }

    await interaction.reply({ content: 'Subcommand tidak dikenali.', flags: 64 });
  },
};
