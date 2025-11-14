const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require('discord.js');
const {
  addToBlacklist,
  removeFromBlacklist,
  listBlacklisted,
} = require('../../api/models/BlacklistedUsers');
const { fetchConfig } = require('../utils/guildConfig');
const { sendVerificationLog } = require('../utils/logging');

function ensureAdmin(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    throw new Error('no-permission');
  }
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
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Hapus user dari blacklist')
        .addUserOption((option) => option.setName('user').setDescription('User yang dihapus').setRequired(true))
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
        await addToBlacklist({
          userId: user.id,
          guildId: interaction.guildId,
          reason,
          addedBy: interaction.user.id,
        });
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
        await interaction.reply({
          content: `<@${user.id}> telah diblacklist (alasan: ${reason}).`,
          flags: 64,
        });
      } else if (subcommand === 'remove') {
        const user = interaction.options.getUser('user');
        await removeFromBlacklist(user.id, interaction.guildId);
        await interaction.reply({ content: `<@${user.id}> dihapus dari blacklist.`, flags: 64 });
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
            .map(
              (entry) =>
                `• <@${entry.userId}> — ${entry.reason || 'tanpa alasan'} (ditambah ${new Date(
                  entry.createdAt
                ).toISOString()})`
            )
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
