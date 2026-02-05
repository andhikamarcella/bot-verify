const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetchConfig } = require('../utils/guildConfig');
const { getUserProfile } = require('../../api/models/Users');
const { detectLangFromInteraction, t } = require('../utils/i18n');

function softColor() {
  return 0x8bd3dd;
}

module.exports = {
  data: new SlashCommandBuilder().setName('rules').setDescription('Tampilkan rules server'),

  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: 'Command ini hanya bisa dipakai di server.', flags: 64 });
      return;
    }

    const config = await fetchConfig(guildId);
    const profile = await getUserProfile(interaction.user.id, guildId).catch(() => null);
    const uiLang = (profile?.language && (profile.language === 'en' || profile.language === 'id')) ? profile.language : detectLangFromInteraction(interaction, 'id');

    const rulesUrl = String(config.rulesUrl || '').trim();
    const rulesChannelId = String(config.rulesChannelId || '').trim();

    let content = '';
    if (rulesUrl) {
      content = rulesUrl;
    } else if (rulesChannelId) {
      content = `<#${rulesChannelId}>`;
    }

    const embed = new EmbedBuilder().setTitle(t(uiLang, 'rulesTitle')).setColor(softColor());
    if (content) {
      embed.setDescription(content);
    } else {
      embed.setDescription(t(uiLang, 'rulesMissing'));
    }

    await interaction.reply({ embeds: [embed], flags: 64 });
  },
};

