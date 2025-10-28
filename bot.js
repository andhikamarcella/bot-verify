const { PermissionFlagsBits } = require('discord.js');
const { client } = require('./discordClient');
const {
  createToken,
  deleteToken,
} = require('./verifyStore');

async function startBot() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error('DISCORD_TOKEN belum diatur di environment.');
  }

  client.once('ready', () => {
    console.log(`Bot siap sebagai ${client.user.tag}`);
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'verify') return;

    const publicBaseUrl = process.env.PUBLIC_BASE_URL;
    const guildId = process.env.GUILD_ID;
    const memberRoleId = process.env.MEMBER_ROLE_ID;

    if (!publicBaseUrl || !guildId || !memberRoleId) {
      await interaction.reply({
        content: 'Konfigurasi bot belum lengkap. Hubungi administrator.',
        ephemeral: true,
      });
      return;
    }

    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(interaction.user.id).catch(() => null);

      if (!member) {
        await interaction.reply({
          content: 'Kamu tidak terdaftar di server yang ditentukan.',
          ephemeral: true,
        });
        return;
      }

      const role = guild.roles.cache.get(memberRoleId)
        || await guild.roles.fetch(memberRoleId).catch(() => null);

      if (!role) {
        console.error('Role Member tidak ditemukan. Periksa MEMBER_ROLE_ID.');
        await interaction.reply({
          content: 'Role Member tidak ditemukan. Hubungi administrator.',
          ephemeral: true,
        });
        return;
      }

      if (member.roles.cache.has(role.id)) {
        await interaction.reply({
          content: 'Kamu sudah diverifikasi dan memiliki role Member.',
          ephemeral: true,
        });
        return;
      }

      const botMember = await guild.members.fetchMe();
      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({
          content: 'Bot tidak memiliki izin Manage Roles. Hubungi administrator.',
          ephemeral: true,
        });
        return;
      }

      const tokenValue = createToken(interaction.user.id);
      const baseUrl = publicBaseUrl.endsWith('/') ? publicBaseUrl.slice(0, -1) : publicBaseUrl;
      const verifyLink = `${baseUrl}/verify?token=${tokenValue}`;

      try {
        await interaction.user.send(
          `Hai ${interaction.user.username}, selesaikan verifikasi di link berikut: ${verifyLink}`,
        );
      } catch (dmError) {
        console.error('Gagal mengirim DM:', dmError);
        deleteToken(tokenValue);
        await interaction.reply({
          content: 'Tidak bisa mengirim DM. Tolong buka DM kamu dan jalankan /verify lagi.',
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content: 'Link verifikasi telah dikirimkan ke DM kamu. Silakan cek pesan pribadi.',
        ephemeral: true,
      });
    } catch (error) {
      console.error('Terjadi kesalahan saat memproses /verify:', error);
      if (!interaction.replied) {
        await interaction.reply({
          content: 'Terjadi kesalahan saat memproses verifikasi. Coba lagi nanti.',
          ephemeral: true,
        });
      }
    }
  });

  await client.login(token);
}

module.exports = { startBot };
