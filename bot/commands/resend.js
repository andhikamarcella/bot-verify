const crypto = require('crypto');
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { connectMongo } = require('../../api/lib/db');
const { createTokenDocument, findLatestByUser, listDmMessagesForUser, setTokenStatus, clearTokenDmFields } = require('../../api/models/Tokens');
const { fetchConfig } = require('../utils/guildConfig');
const { getExtraRolesForUser } = require('../../api/lib/roleSync');
const { getUserProfile } = require('../../api/models/Users');
const { detectLangFromInteraction, t } = require('../utils/i18n');

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

async function sendVerificationDm(user, url, lang) {
  const isEn = lang === 'en';
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel(isEn ? 'Verify Me' : 'Verifikasi Sekarang').setStyle(ButtonStyle.Link).setURL(url)
  );
  const message = await user.send({
    content: [
      isEn ? 'Hey! Quick verification steps:' : 'Hai! Ini langkah verifikasi yang gampang:',
      '',
      isEn ? 'Step 1 → Click the button below' : 'Step 1 → Klik tombol di bawah',
      isEn ? 'Step 2 → Complete captcha on the website' : 'Step 2 → Selesaikan captcha di website',
      isEn ? 'Done → You will get access automatically' : 'Selesai → Kamu akan dapat akses otomatis',
      '',
      isEn ? 'If the button does not work, use this link:' : 'Kalau tombolnya tidak muncul, pakai link ini:',
      url,
    ].join('\n'),
    components: [row],
  });
  return message;
}

module.exports = {
  data: new SlashCommandBuilder().setName('resend').setDescription('Kirim ulang DM link verifikasi'),

  async execute(interaction, client) {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: 'Command ini hanya bisa dipakai di server.', flags: 64 });
      return;
    }

    await interaction.deferReply({ flags: 64 });
    const config = await fetchConfig(guildId).catch(() => null);
    const profile = await getUserProfile(interaction.user.id, guildId).catch(() => null);
    const lang = (profile?.language && (profile.language === 'en' || profile.language === 'id')) ? profile.language : detectLangFromInteraction(interaction, 'id');

    const frontend = sanitizeUrlBase(process.env.PUBLIC_FRONTEND_URL);
    if (!frontend) {
      await interaction.editReply({ content: t(lang, 'resendNoFrontend') });
      return;
    }

    await connectMongo();

    const latestToken = await findLatestByUser(interaction.user.id, guildId).catch(() => null);
    let tokenDoc = latestToken;
    const now = Date.now();
    if (!tokenDoc || tokenDoc.status !== 'PENDING' || now - new Date(tokenDoc.createdAt).getTime() > 15 * 60 * 1000) {
      const extraRoles = await getExtraRolesForUser(interaction.client, interaction.user.id).catch(() => []);
      const token = crypto.randomUUID();
      tokenDoc = await createTokenDocument({
        token,
        userId: interaction.user.id,
        guildId,
        roleId: process.env.MEMBER_ROLE_ID,
        status: 'PENDING',
        extraRolesEligible: extraRoles,
        createdAt: new Date(),
      });
    }

    const url = `${frontend}/verify?token=${tokenDoc.token}`;

    try {
      const oldMessages = await listDmMessagesForUser(interaction.user.id, guildId, 25).catch(() => []);
      for (const item of oldMessages) {
        const channelId = item?.dmChannelId;
        const messageId = item?.dmMessageId;
        if (!channelId || !messageId) continue;
        try {
          const dmChannel = await interaction.client.channels.fetch(channelId).catch(() => null);
          if (dmChannel?.messages) {
            const msg = await dmChannel.messages.fetch(messageId).catch(() => null);
            if (msg && msg.author?.id === interaction.client.user.id) {
              await msg.delete().catch(() => {});
            }
          }
        } catch (_) {
          null;
        }
        await clearTokenDmFields(item.token).catch(() => {});
      }
    } catch (_) {
      null;
    }

    try {
      const dmMessage = await sendVerificationDm(interaction.user, url, lang);
      if (dmMessage?.channel?.id && dmMessage?.id) {
        await setTokenStatus(tokenDoc.token, 'PENDING', {
          dmChannelId: dmMessage.channel.id,
          dmMessageId: dmMessage.id,
        }).catch(() => {});
      }
      await interaction.editReply({ content: t(lang, 'resendSent') });
    } catch (err) {
      await interaction.editReply({ content: t(lang, 'resendCantDm') });
    }
  },
};

