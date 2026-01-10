const { SlashCommandBuilder, ActivityType } = require('discord.js');
const { ensureStaff } = require('../utils/permissions');
const { setPresenceMode, getPresenceMode } = require('../bot');

const SUPPORT_INVITE_URL = 'https://discord.gg/w3ENr2uEeH';

const presenceMessages = [
  'Verifying members | /verify',
  'Protecting servers | /verify',
  'Need help? Try /help',
  'Join support: discord.gg/w3ENr2uEeH',
];

const gamePresenceMessages = [
  'Elden Ring',
  'Dark Souls',
  'The Elder Scrolls',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rpc')
    .setDescription('Kontrol status playing bot (staff only)')
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('mode')
        .setDescription('Pilih mode status')
        .addStringOption((option) =>
          option
            .setName('value')
            .setDescription('Mode presence')
            .setRequired(true)
            .addChoices(
              { name: 'default', value: 'default' },
              { name: 'games', value: 'games' }
            )
        )
    )
    .addSubcommand((sub) => sub.setName('show').setDescription('Lihat mode status saat ini')),

  async execute(interaction, client) {
    try {
      ensureStaff(interaction);

      const sub = interaction.options.getSubcommand();
      if (sub === 'show') {
        await interaction.reply({ content: `Mode presence saat ini: **${getPresenceMode()}**`, flags: 64 });
        return;
      }

      const mode = interaction.options.getString('value');
      setPresenceMode(mode);

      const pool = mode === 'games' ? gamePresenceMessages : presenceMessages;
      const activity = {
        name: pool[0],
        type: ActivityType.Playing,
      };

      if (mode !== 'games') {
        activity.buttons = ['Join Support Server'];
        activity.metadata = { button_urls: [SUPPORT_INVITE_URL] };
        activity.url = SUPPORT_INVITE_URL;
        if (process.env.DISCORD_CLIENT_ID) {
          activity.applicationId = process.env.DISCORD_CLIENT_ID;
        }
      }

      if (client?.user) {
        client.user.setPresence({
          activities: [activity],
          status: 'online',
        });
      }

      await interaction.reply({ content: `Presence mode diset ke **${mode}**.`, flags: 64 });
    } catch (error) {
      if (error.message === 'no-permission') {
        await interaction.reply({ content: 'Kamu tidak punya izin untuk perintah ini.', flags: 64 });
        return;
      }
      console.error('rpc command error', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Terjadi kesalahan saat menjalankan perintah rpc.', flags: 64 });
      }
    }
  },
};
