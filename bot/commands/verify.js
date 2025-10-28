const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const crypto = require('crypto');
const { connectMongo } = require('../../api/lib/db');
const { createTokenDocument } = require('../../api/models/Tokens');
const { getExtraRolesForUser } = require('../../api/lib/roleSync');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Get your verification link'),

  async execute(interaction) {
    const userId = interaction.user.id;
    const guildId = process.env.GUILD_ID;
    const roleId = process.env.MEMBER_ROLE_ID;
    const frontendBase = process.env.PUBLIC_FRONTEND_URL;

    if (!frontendBase) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'Konfigurasi frontend belum siap. Hubungi admin.',
          flags: 64,
        });
      }
      return;
    }

    try {
      await connectMongo();
      const extraRoles = await getExtraRolesForUser(interaction.client, userId);
      const token = crypto.randomUUID();
      await createTokenDocument({
        token,
        userId,
        guildId,
        roleId,
        status: 'PENDING',
        extraRolesEligible: extraRoles,
        createdAt: new Date(),
      });

      const verifyUrl = `${frontendBase.replace(/\/$/, '')}/verify?token=${token}`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Verify Me').setStyle(ButtonStyle.Link).setURL(verifyUrl)
      );

      try {
        await interaction.user.send({
          content: [
            'Halo! Klik tombol di bawah untuk verifikasi akun kamu.',
            '',
            'Kalau tombol tidak muncul / tidak bisa diklik, gunakan link ini:',
            verifyUrl,
          ].join('\n'),
          components: [row],
        });
      } catch (err) {
        console.error('Gagal DM user:', err);
      }

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'Link verifikasi sudah kukirim ke DM kamu. Cek DM ya! ✅',
          flags: 64,
        });
      }
    } catch (error) {
      console.error('verify command error:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'Terjadi kesalahan saat membuat link verifikasi.',
          flags: 64,
        });
      }
    }
  },
};
