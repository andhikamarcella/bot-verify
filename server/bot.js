/**
 * Modul bot Discord yang menangani slash command /verify.
 */
const client = require('./discordClient');
const verifyStore = require('./verifyStore');

async function startBot() {
  const token = process.env.DISCORD_TOKEN;
  const frontendBase = process.env.PUBLIC_FRONTEND_URL;

  if (!token) {
    throw new Error('DISCORD_TOKEN belum diisi. Periksa konfigurasi .env Anda.');
  }
  if (!frontendBase) {
    throw new Error('PUBLIC_FRONTEND_URL diperlukan untuk mengirimkan tautan verifikasi.');
  }

  client.once('ready', () => {
    const tag = client.user?.tag || client.user?.id || 'Bot';
    console.log(`Bot masuk sebagai ${tag}`);
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (interaction.commandName !== 'verify') {
      return;
    }

    const user = interaction.user;

    try {
      const tokenValue = verifyStore.createToken(user);
      const verificationLink = `${frontendBase.replace(/\/$/, '')}/verify?token=${tokenValue}`;

      try {
        await user.send({
          content: `Hai ${user.globalName || user.username}! Selesaikan verifikasi di sini: ${verificationLink}`,
        });
        await interaction.reply({
          content: 'Cek DM kamu ya 💌. Kalau belum masuk, pastikan DM tidak terkunci.',
          ephemeral: true,
        });
      } catch (dmError) {
        console.error('Gagal mengirim DM ke pengguna:', dmError);
        verifyStore.deleteToken(tokenValue);
        await interaction.reply({
          content:
            'Tidak bisa mengirim DM. Tolong buka DM kamu terlebih dahulu lalu jalankan /verify lagi.',
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error('Terjadi kesalahan saat memproses /verify:', error);
      if (!interaction.replied) {
        await interaction.reply({
          content: 'Terjadi kesalahan internal saat membuat token verifikasi.',
          ephemeral: true,
        });
      }
    }
  });

  await client.login(token);
}

module.exports = {
  startBot,
};
