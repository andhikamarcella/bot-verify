const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const { fetchConfig, updateConfig } = require('../utils/guildConfig');

function ensureAdmin(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    throw new Error('no-permission');
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Atur konfigurasi verifikasi guild')
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('show').setDescription('Tampilkan konfigurasi saat ini'))
    .addSubcommand((sub) =>
      sub
        .setName('set-logs-channel')
        .setDescription('Atur channel logs verifikasi')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel tujuan log')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-min-account-age')
        .setDescription('Setel minimal umur akun (hari)')
        .addIntegerOption((option) => option.setName('days').setDescription('Jumlah hari').setRequired(true).setMinValue(0))
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggle-media-restriction')
        .setDescription('Aktifkan/nonaktifkan blokir media untuk user belum diverifikasi')
        .addStringOption((option) =>
          option
            .setName('state')
            .setDescription('on/off')
            .setRequired(true)
            .addChoices(
              { name: 'on', value: 'on' },
              { name: 'off', value: 'off' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('add-forbidden-name')
        .setDescription('Tambahkan pola nama yang dilarang')
        .addStringOption((option) => option.setName('pattern').setDescription('Regex atau kata kunci').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove-forbidden-name')
        .setDescription('Hapus pola nama yang dilarang')
        .addStringOption((option) => option.setName('pattern').setDescription('Pattern yang dihapus').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggle-reminder')
        .setDescription('Aktifkan/nonaktifkan DM reminder verifikasi')
        .addStringOption((option) =>
          option
            .setName('state')
            .setDescription('on/off')
            .setRequired(true)
            .addChoices(
              { name: 'on', value: 'on' },
              { name: 'off', value: 'off' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-reminder-delay')
        .setDescription('Atur jeda DM reminder (menit)')
        .addIntegerOption((option) => option.setName('minutes').setDescription('Menit').setRequired(true).setMinValue(1))
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggle-auto-nickname')
        .setDescription('Aktifkan/nonaktifkan auto nickname saat verifikasi')
        .addStringOption((option) =>
          option
            .setName('state')
            .setDescription('on/off')
            .setRequired(true)
            .addChoices(
              { name: 'on', value: 'on' },
              { name: 'off', value: 'off' }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('set-nickname-template')
        .setDescription('Atur template nickname, gunakan {{username}} atau {{displayName}}')
        .addStringOption((option) => option.setName('template').setDescription('Template').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('add-allowed-channel')
        .setDescription('Izinkan channel tertentu mengirim media sebelum verifikasi')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel yang diizinkan')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove-allowed-channel')
        .setDescription('Hapus channel dari daftar pengecualian media')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel yang dihapus')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    try {
      ensureAdmin(interaction);
      if (subcommand === 'show') {
        const config = await fetchConfig(interaction.guildId);
        const reminderEnabled =
          typeof config.dmReminderEnabled === 'boolean' ? config.dmReminderEnabled : config.reminderEnabled;
        const reminderDelay = config.dmReminderDelayMinutes ?? config.reminderDelayMinutes ?? 10;
        const lines = [
          `Logs Channel: ${config.logsChannelId ? `<#${config.logsChannelId}>` : 'belum diset'}`,
          `Reminder: ${reminderEnabled ? `ON (${reminderDelay} menit)` : 'OFF'}`,
          `Min Account Age: ${config.minAccountAgeDays} hari`,
          `Media Restriction: ${config.mediaRestrictionEnabled ? 'ON' : 'OFF'}`,
          `Auto Nickname: ${config.autoNickname ? `ON (template: ${config.nicknameTemplate})` : 'OFF'}`,
          `Allowed Channels: ${(config.allowedChannels || []).map((id) => `<#${id}>`).join(', ') || '-'}`,
          `Forbidden Name Patterns: ${(config.forbiddenNamePatterns || []).join(', ') || '-'}`,
        ];
        await interaction.reply({ content: lines.join('\n'), flags: 64 });
      } else if (subcommand === 'set-logs-channel') {
        const channel = interaction.options.getChannel('channel');
        await updateConfig(interaction.guildId, { logsChannelId: channel.id });
        await interaction.reply({ content: `Logs channel diset ke <#${channel.id}>`, flags: 64 });
      } else if (subcommand === 'set-min-account-age') {
        const days = interaction.options.getInteger('days');
        await updateConfig(interaction.guildId, { minAccountAgeDays: days });
        await interaction.reply({ content: `Minimal umur akun diset ke ${days} hari.`, flags: 64 });
      } else if (subcommand === 'toggle-media-restriction') {
        const state = interaction.options.getString('state');
        await updateConfig(interaction.guildId, { mediaRestrictionEnabled: state === 'on' });
        await interaction.reply({ content: `Media restriction sekarang ${state === 'on' ? 'ON' : 'OFF'}.`, flags: 64 });
      } else if (subcommand === 'add-forbidden-name') {
        const pattern = interaction.options.getString('pattern');
        const config = await fetchConfig(interaction.guildId);
        const patterns = new Set(config.forbiddenNamePatterns || []);
        patterns.add(pattern);
        await updateConfig(interaction.guildId, { forbiddenNamePatterns: Array.from(patterns) });
        await interaction.reply({ content: `Pattern \`${pattern}\` ditambahkan.`, flags: 64 });
      } else if (subcommand === 'remove-forbidden-name') {
        const pattern = interaction.options.getString('pattern');
        const config = await fetchConfig(interaction.guildId);
        const filtered = (config.forbiddenNamePatterns || []).filter((item) => item !== pattern);
        await updateConfig(interaction.guildId, { forbiddenNamePatterns: filtered });
        await interaction.reply({ content: `Pattern \`${pattern}\` dihapus.`, flags: 64 });
      } else if (subcommand === 'toggle-reminder') {
        const state = interaction.options.getString('state');
        await updateConfig(interaction.guildId, {
          reminderEnabled: state === 'on',
          dmReminderEnabled: state === 'on',
        });
        await interaction.reply({ content: `DM reminder sekarang ${state === 'on' ? 'ON' : 'OFF'}.`, flags: 64 });
      } else if (subcommand === 'set-reminder-delay') {
        const minutes = interaction.options.getInteger('minutes');
        await updateConfig(interaction.guildId, {
          reminderDelayMinutes: minutes,
          dmReminderDelayMinutes: minutes,
        });
        await interaction.reply({ content: `Delay DM reminder diset ke ${minutes} menit.`, flags: 64 });
      } else if (subcommand === 'toggle-auto-nickname') {
        const state = interaction.options.getString('state');
        await updateConfig(interaction.guildId, { autoNickname: state === 'on' });
        await interaction.reply({ content: `Auto nickname sekarang ${state === 'on' ? 'ON' : 'OFF'}.`, flags: 64 });
      } else if (subcommand === 'set-nickname-template') {
        const template = interaction.options.getString('template');
        await updateConfig(interaction.guildId, { nicknameTemplate: template });
        await interaction.reply({ content: `Template nickname diperbarui menjadi \`${template}\`.`, flags: 64 });
      } else if (subcommand === 'add-allowed-channel') {
        const channel = interaction.options.getChannel('channel');
        const config = await fetchConfig(interaction.guildId);
        const allow = new Set((config.allowedChannels || []).map(String));
        allow.add(channel.id);
        await updateConfig(interaction.guildId, { allowedChannels: Array.from(allow) });
        await interaction.reply({ content: `Channel <#${channel.id}> diizinkan mengirim media.`, flags: 64 });
      } else if (subcommand === 'remove-allowed-channel') {
        const channel = interaction.options.getChannel('channel');
        const config = await fetchConfig(interaction.guildId);
        const filtered = (config.allowedChannels || []).filter((id) => id !== channel.id);
        await updateConfig(interaction.guildId, { allowedChannels: filtered });
        await interaction.reply({ content: `Channel <#${channel.id}> dihapus dari whitelist media.`, flags: 64 });
      }
    } catch (error) {
      if (error.message === 'no-permission') {
        await interaction.reply({ content: 'Kamu tidak punya izin untuk perintah ini.', flags: 64 });
        return;
      }
      console.error('settings command error', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Terjadi kesalahan saat mengubah settings.', flags: 64 });
      }
    }
  },
};
