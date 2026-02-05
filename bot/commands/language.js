const { SlashCommandBuilder } = require('discord.js');
const { setUserLanguage } = require('../../api/models/Users');
const { detectLangFromInteraction, t } = require('../utils/i18n');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('language')
    .setDescription('Ubah bahasa DM bot (ID/EN)')
    .addStringOption((opt) =>
      opt
        .setName('value')
        .setDescription('Pilih bahasa')
        .setRequired(true)
        .addChoices({ name: 'Indonesia', value: 'id' }, { name: 'English', value: 'en' })
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: 'Command ini hanya bisa dipakai di server.', flags: 64 });
      return;
    }

    const lang = interaction.options.getString('value', true);
    await setUserLanguage(interaction.user.id, guildId, lang);

    const uiLang = detectLangFromInteraction(interaction, 'id');
    await interaction.reply({
      content: t(uiLang, 'languageSet').replace('{lang}', lang === 'en' ? 'EN' : 'ID'),
      flags: 64,
    });
  },
};

