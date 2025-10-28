const express = require('express');
const bodyParser = require('body-parser');
const { client } = require('./discordClient');
const {
  getByToken,
  markVerified,
  deleteToken,
} = require('./verifyStore');

const fetch = (...args) => import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args));

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

function renderPage(title, content) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/milligram/1.4.1/milligram.min.css" integrity="sha512-2FvCkXbkqVKgf/mBlC9ZwTe74MkRUYw35vj0IadB1iKsFcfoTmyaKOA1NVuMcZV8K4D4ew3Efr2E1VlzLGfUug==" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <style>
    body { max-width: 640px; margin: 40px auto; }
    .card { padding: 2rem; border: 1px solid #e1e1e1; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
    .center { text-align: center; }
    .error { color: #c0392b; }
    .success { color: #27ae60; }
  </style>
</head>
<body>
  <main class="card">
    ${content}
  </main>
</body>
</html>`;
}

function renderError(message) {
  return renderPage('Verifikasi Gagal', `<h2 class="error">Terjadi Kesalahan</h2><p>${message}</p>`);
}

app.get('/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    res.status(400).send(renderError('Token tidak ditemukan.')); 
    return;
  }

  const record = getByToken(token);
  if (!record) {
    res.status(400).send(renderError('Token tidak valid.')); 
    return;
  }

  if (record.verified) {
    res.status(400).send(renderError('Token sudah digunakan atau kadaluarsa.'));
    return;
  }

  let usernameLabel = 'Pengguna Discord';
  try {
    if (client.isReady()) {
      const user = await client.users.fetch(record.discordUserId);
      if (user) {
        usernameLabel = user.username;
      }
    }
  } catch (error) {
    console.warn('Tidak dapat mengambil data pengguna untuk halaman verifikasi:', error);
  }

  const siteKey = process.env.RECAPTCHA_SITE_KEY;
  if (!siteKey) {
    res.status(500).send(renderError('Konfigurasi reCAPTCHA belum lengkap.'));
    return;
  }

  const formHtml = `
    <h1 class="center">Server Verification</h1>
    <p>Halo ${usernameLabel}! Silakan selesaikan verifikasi di bawah ini.</p>
    <form method="POST" action="/verify">
      <input type="hidden" name="token" value="${token}" />
      <!-- RECAPTCHA_SITE_KEY bersifat publik dan boleh dimasukkan di halaman ini. -->
      <div class="g-recaptcha" data-sitekey="${siteKey}"></div>
      <button type="submit" class="button">Submit / Verify Me</button>
    </form>
    <p class="center"><small><!-- RECAPTCHA_SECRET_KEY harus disimpan di server dan tidak diungkap ke klien. --></small></p>
    <script src="https://www.google.com/recaptcha/api.js" async defer></script>
  `;

  res.send(renderPage('Server Verification', formHtml));
});

app.post('/verify', async (req, res) => {
  const { token, 'g-recaptcha-response': captchaResponse } = req.body;

  if (!token) {
    res.status(400).send(renderError('Token tidak ditemukan.'));
    return;
  }

  const record = getByToken(token);
  if (!record) {
    res.status(400).send(renderError('Token tidak valid.'));
    return;
  }

  if (record.verified) {
    res.status(400).send(renderError('Token sudah digunakan atau kadaluarsa.'));
    return;
  }

  if (!captchaResponse) {
    res.status(400).send(renderError('Captcha harus diisi.'));
    return;
  }

  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  if (!secretKey) {
    res.status(500).send(renderError('Konfigurasi reCAPTCHA belum lengkap.'));
    return;
  }

  try {
    const remoteIp = req.headers['x-forwarded-for']
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : req.socket.remoteAddress;

    const params = new URLSearchParams();
    params.append('secret', secretKey);
    params.append('response', captchaResponse);
    if (remoteIp) {
      params.append('remoteip', remoteIp);
    }

    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await response.json();
    if (!data.success) {
      console.warn('Verifikasi reCAPTCHA gagal:', data);
      res.status(400).send(renderError('Verifikasi reCAPTCHA gagal. Silakan coba lagi.'));
      return;
    }

    if (!client.isReady()) {
      res.status(503).send(renderError('Bot sedang tidak siap. Silakan coba lagi nanti.'));
      return;
    }

    const guildId = process.env.GUILD_ID;
    const memberRoleId = process.env.MEMBER_ROLE_ID;

    if (!guildId || !memberRoleId) {
      res.status(500).send(renderError('Konfigurasi server belum lengkap.'));
      return;
    }

    const guild = await client.guilds.fetch(guildId).catch((err) => {
      console.error('Gagal mengambil guild:', err);
      return null;
    });

    if (!guild) {
      res.status(500).send(renderError('Server Discord tidak ditemukan.'));
      return;
    }

    const member = await guild.members.fetch(record.discordUserId).catch((err) => {
      console.error('Gagal mengambil member:', err);
      return null;
    });

    if (!member) {
      res.status(404).send(renderError('Pengguna tidak ditemukan di server.'));
      return;
    }

    const role = guild.roles.cache.get(memberRoleId)
      || await guild.roles.fetch(memberRoleId).catch((err) => {
        console.error('Gagal mengambil role:', err);
        return null;
      });

    if (!role) {
      res.status(500).send(renderError('Role Member tidak ditemukan. Hubungi administrator.'));
      return;
    }

    if (!member.roles.cache.has(role.id)) {
      try {
        await member.roles.add(role);
      } catch (roleError) {
        console.error('Gagal menambahkan role:', roleError);
        res.status(500).send(renderError('Gagal menambahkan role. Pastikan bot memiliki izin yang cukup.'));
        return;
      }
    }

    markVerified(token);
    deleteToken(token);

    const successHtml = `
      <p class="success">Verifikasi berhasil ✅ kamu sekarang sudah menjadi Member.</p>
    `;
    res.send(renderPage('Verifikasi Berhasil', successHtml));
  } catch (error) {
    console.error('Kesalahan saat memproses verifikasi:', error);
    res.status(500).send(renderError('Terjadi kesalahan internal. Silakan coba lagi.'));
  }
});

function startWebServer() {
  const port = process.env.PORT || 3000;
  return new Promise((resolve, reject) => {
    const server = app
      .listen(port, () => {
        console.log(`Web server verifikasi berjalan di http://localhost:${port}`);
        resolve(server);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

module.exports = { startWebServer };
