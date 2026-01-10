const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const {
  addToBlacklist,
  removeFromBlacklist,
  listBlacklisted,
} = require('../../api/models/BlacklistedUsers');
const { fetchConfig } = require('../utils/guildConfig');
const { sendVerificationLog } = require('../utils/logging');
const { ensureStaff } = require('../utils/permissions');

function ensureAdmin(interaction) {
  ensureStaff(interaction);
}

async function enforceBlacklistOnMember({ guild, member, reason }) {
  const memberRoleId = process.env.MEMBER_ROLE_ID;
  const blacklistRoleId = process.env.BLACKLIST_ROLE_ID;
  const timeoutMinutes = Number(process.env.BLACKLIST_TIMEOUT_MINUTES || 0);

  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  const canManageRoles = Boolean(me?.permissions?.has?.(PermissionFlagsBits.ManageRoles));
  const canTimeout = Boolean(me?.permissions?.has?.(PermissionFlagsBits.ModerateMembers));

  if (canManageRoles && memberRoleId && member.roles.cache.has(memberRoleId)) {
    await member.roles.remove(memberRoleId, 'blacklisted').catch(() => {});
  }

  if (canManageRoles && blacklistRoleId && !member.roles.cache.has(blacklistRoleId)) {
    await member.roles.add(blacklistRoleId, 'blacklisted').catch(() => {});
  }

  if (canTimeout && timeoutMinutes > 0) {
    const ms = Math.min(timeoutMinutes, 60 * 24 * 28) * 60 * 1000;
    await member.timeout(ms, reason || 'blacklisted').catch(() => {});
  }
}

async function purgeRecentMessages({ guild, userId }) {
  const maxChannels = Math.max(0, Number(process.env.BLACKLIST_PURGE_CHANNELS || 0));
  const perChannel = Math.max(0, Number(process.env.BLACKLIST_PURGE_MESSAGES || 0));
  if (!maxChannels || !perChannel) return { channels: 0, deleted: 0 };

  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me?.permissions?.has?.(PermissionFlagsBits.ManageMessages)) {
    return { channels: 0, deleted: 0 };
  }

  let channelsScanned = 0;
  let deleted = 0;

  const channels = Array.from(guild.channels.cache.values())
    .filter((ch) => ch?.isTextBased?.() && ch?.viewable)
    .slice(0, maxChannels);

  for (const channel of channels) {
    channelsScanned += 1;
    try {
      const msgs = await channel.messages.fetch({ limit: Math.min(perChannel, 100) });
      const targets = msgs.filter((m) => m?.author?.id === userId);
      for (const msg of targets.values()) {
        await msg.delete().catch(() => {});
        deleted += 1;
      }
    } catch (_) {
      null;
    }
  }

  return { channels: channelsScanned, deleted };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Kelola daftar blacklist verifikasi')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Tambahkan user ke blacklist')
        .addUserOption((option) => option.setName('user').setDescription('User yang diblacklist').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Alasan').setRequired(true))
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('Ruang lingkup blacklist')
            .addChoices(
              { name: 'Guild only', value: 'guild' },
              { name: 'Global', value: 'global' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Hapus user dari blacklist')
        .addUserOption((option) => option.setName('user').setDescription('User yang dihapus').setRequired(true))
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('Hapus dari blacklist pada lingkup tertentu')
            .addChoices(
              { name: 'Guild only', value: 'guild' },
              { name: 'Global only', value: 'global' },
              { name: 'Semua entri', value: 'all' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Lihat daftar blacklist')
        .addIntegerOption((option) => option.setName('page').setDescription('Halaman').setMinValue(1))
    ),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    try {
      ensureAdmin(interaction);
      if (subcommand === 'add') {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const scope = interaction.options.getString('scope') || 'guild';
        await interaction.deferReply({ flags: 64 });
        await addToBlacklist({
          userId: user.id,
          guildId: interaction.guildId,
          reason,
          addedBy: interaction.user.id,
          scope,
        });

        const guild = interaction.guild;
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (member) {
          await enforceBlacklistOnMember({ guild, member, reason: `blacklisted:${reason}` });
        }
        const purge = await purgeRecentMessages({ guild, userId: user.id });

        const config = await fetchConfig(interaction.guildId);
        await sendVerificationLog({
          client,
          guildId: interaction.guildId,
          config,
          user,
          member: null,
          type: 'failure',
          status: 'BLACKLISTED',
          riskScore: 100,
          reason: `Ditambahkan ke blacklist: ${reason}`,
          suspectReasons: ['manual-blacklist'],
        });

        const extraLine = purge.deleted
          ? `\nPurge: deleted ${purge.deleted} messages (scanned ${purge.channels} channels).`
          : '';
        await interaction.editReply({
          content: `<@${user.id}> telah diblacklist (${scope.toUpperCase()} • alasan: ${reason}).${extraLine}`,
        });
      } else if (subcommand === 'remove') {
        const user = interaction.options.getUser('user');
        const scope = interaction.options.getString('scope') || 'guild';
        await removeFromBlacklist(user.id, interaction.guildId, scope);
        await interaction.reply({
          content: `<@${user.id}> dihapus dari blacklist (${scope.toUpperCase()}).`,
          flags: 64,
        });
      } else if (subcommand === 'list') {
        const page = interaction.options.getInteger('page') || 1;
        const { items, total } = await listBlacklisted(interaction.guildId, page, 10);
        if (!items.length) {
          await interaction.reply({ content: 'Blacklist kosong.', flags: 64 });
          return;
        }
        const embed = new EmbedBuilder()
          .setTitle('Daftar Blacklist')
          .setColor(0xed4245)
          .setFooter({ text: `Total ${total} entri • Halaman ${page}` });
        embed.setDescription(
          items
            .map((entry) => {
              const scopeLabel = (entry.scope || 'guild').toUpperCase();
              return `• <@${entry.userId}> — ${entry.reason || 'tanpa alasan'} (${scopeLabel}, ${new Date(
                entry.createdAt
              ).toISOString()})`;
            })
            .join('\n')
        );
        await interaction.reply({ embeds: [embed], flags: 64 });
      }
    } catch (error) {
      if (error.message === 'no-permission') {
        await interaction.reply({ content: 'Kamu tidak punya izin untuk perintah ini.', flags: 64 });
        return;
      }
      console.error('blacklist command error', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Terjadi kesalahan pada perintah blacklist.', flags: 64 });
      }
    }
  },
};
