// Slash command that guides members through the verification DM flow.
const {
  SlashCommandBuilder,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const crypto = require('crypto');
const client = require('../discordClient');
const { createTokenDocument, markVerified } = require('../../api/models/Token');
const { upsertUserProfile } = require('../../api/models/UserProfile');

const FRONTEND_URL = process.env.PUBLIC_FRONTEND_URL;
const GUILD_ID = process.env.GUILD_ID;
const MEMBER_ROLE_ID = process.env.MEMBER_ROLE_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;

async function fetchBannerProfile(userId) {
  try {
    const data = await client.rest.get(Routes.user(userId));
    return {
      userId,
      username: data.username,
      globalName: data.global_name,
      avatar: data.avatar,
      banner: data.banner,
      accentColor: data.accent_color,
    };
  } catch (error) {
    console.warn('Failed to fetch user REST profile', error?.message);
    return null;
  }
}

async function assignRole(member, roleId) {
  if (!roleId) return;
  if (member.roles.cache.has(roleId)) return;
  try {
    await member.roles.add(roleId, 'Verification success');
  } catch (error) {
    console.error('Failed to assign role', error);
  }
}

async function sendWelcomeMessage(userId) {
  if (!WELCOME_CHANNEL_ID) return;
  try {
    const channel = await client.channels.fetch(WELCOME_CHANNEL_ID);
    await channel.send({
      content: `Welcome <@${userId}> 🎉 kamu sekarang sudah jadi Member!`,
    });
  } catch (error) {
    console.error('Failed to send welcome message', error);
  }
}

async function autoVerifyTrustedMember(interaction, member, trustedGuildId) {
  await assignRole(member, MEMBER_ROLE_ID);
  const token = crypto.randomUUID();
  await createTokenDocument({
    token,
    userId: member.id,
    username: interaction.user.tag,
    locale: interaction.locale,
    guildId: interaction.guildId,
    trustedSource: trustedGuildId,
  });
  await markVerified(token, {
    badgeEmoji: '💎',
    badgeName: 'Trusted Member',
    status: 'trusted',
  });
  await sendWelcomeMessage(member.id);
  try {
    const { registerRecentVerification } = require('../bot');
    registerRecentVerification(member.id);
  } catch (err) {
    console.warn('Failed to flag recent verification for trusted member', err?.message);
  }

  const profile = await fetchBannerProfile(member.id);
  if (profile) {
    await upsertUserProfile({
      userId: member.id,
      username: profile.username,
      globalName: profile.globalName,
      avatar: profile.avatar,
      bannerUrl: profile.banner,
      accentColor: profile.accentColor,
      badgeEmoji: '💎',
      badgeName: 'Trusted Member',
      suspicious: false,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('Trusted verification unlocked')
    .setDescription('Kamu otomatis diverifikasi karena tercatat di server terpercaya kami.')
    .setColor(0x86efac);
  try {
    await interaction.user.send({ embeds: [embed] });
  } catch (dmError) {
    console.warn('Failed to DM trusted verification info', dmError?.message);
  }

  return `Kamu otomatis diverifikasi karena sudah dikenal di server partner kami.`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Mulai proses verifikasi member server.'),
  async execute(interaction) {
    if (!FRONTEND_URL) {
      await interaction.reply({
        content: 'Konfigurasi frontend belum disetel. Hubungi admin.',
        flags: 64,
      });
      return;
    }

    if (interaction.guildId !== GUILD_ID) {
      await interaction.reply({
        content: 'Perintah ini hanya dapat digunakan di server utama.',
        flags: 64,
      });
      return;
    }

    const guild = interaction.guild || (await client.guilds.fetch(GUILD_ID));
    const member = await guild.members.fetch(interaction.user.id);

    if (member.roles.cache.has(MEMBER_ROLE_ID)) {
      await interaction.reply({
        content: 'Kamu sudah memiliki role Member. 🎉',
        flags: 64,
      });
      return;
    }

    const trustedGuilds = (process.env.TRUSTED_GUILDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    for (const trustedGuildId of trustedGuilds) {
      try {
        const tg = await client.guilds.fetch(trustedGuildId);
        const trustedMember = await tg.members.fetch(interaction.user.id);
        if (trustedMember && trustedMember.roles.cache.size > 1) {
          const message = await autoVerifyTrustedMember(interaction, member, trustedGuildId);
          await interaction.reply({
            content: `${message}\nRole Member sudah diberikan secara otomatis.`,
            flags: 64,
          });
          return;
        }
      } catch (error) {
        // Ignore missing membership errors silently.
        if (error?.code !== 10007) {
          console.warn('Trusted guild lookup failed', trustedGuildId, error?.message);
        }
      }
    }

    const token = crypto.randomUUID();
    await createTokenDocument({
      token,
      userId: interaction.user.id,
      username: interaction.user.tag,
      locale: interaction.locale,
      guildId: interaction.guildId,
    });

    const verificationUrl = `${FRONTEND_URL.replace(/\/$/, '')}/verify?token=${token}`;
    const components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Verify Me').setStyle(ButtonStyle.Link).setURL(verificationUrl)
      ),
    ];

    try {
      await interaction.user.send({
        content: [
          `Hai ${interaction.user.username}! Klik tombol di bawah untuk memulai verifikasi akun kamu.`,
          '',
          'Kalau tombol tidak muncul, kamu bisa pakai tautan berikut:',
          verificationUrl,
        ].join('\n'),
        components,
      });
    } catch (error) {
      console.error('Gagal DM user:', error);
      await interaction.reply({
        content: 'Tidak bisa mengirim DM ke kamu. Buka DM kamu lalu coba lagi.',
        flags: 64,
      });
      return;
    }

    const profile = await fetchBannerProfile(interaction.user.id);
    if (profile) {
      await upsertUserProfile({
        ...profile,
        badgeEmoji: null,
        badgeName: null,
        suspicious: false,
      });
    }

    await interaction.reply({
      content: 'Cek DM kamu ya 💌 Kami sudah kirim tombol verifikasi.',
      flags: 64,
    });
  },
};
