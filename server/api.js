/**
 * Server Express yang menyediakan endpoint verifikasi untuk frontend Next.js.
 */
const express = require('express');
const client = require('./discordClient');
const verifyStore = require('./verifyStore');

const fetch = (...args) => import('node-fetch').then((module) => module.default(...args));

let serverInstance;

function buildApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/api/verify/info', async (req, res) => {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ ok: false, reason: 'missing_token' });
    }

    const record = verifyStore.getByToken(token);
    if (!record) {
      if (verifyStore.isTokenUsed(token)) {
        return res.json({ ok: false, reason: 'used' });
      }
      return res.json({ ok: false, reason: 'invalid' });
    }

    return res.json({
      ok: true,
      data: {
        discordUserId: record.discordUserId,
        username: record.username,
        createdAt: record.createdAt,
      },
    });
  });

  app.post('/api/verify/submit', async (req, res) => {
    const token = req.body.token;
    const captchaResponse = req.body.captcha || req.body['g-recaptcha-response'];

    if (!token) {
      return res.status(400).json({ ok: false, error: 'missing_token' });
    }

    const record = verifyStore.getByToken(token);
    if (!record) {
      if (verifyStore.isTokenUsed(token)) {
        return res.status(409).json({ ok: false, error: 'already_verified' });
      }
      return res.status(404).json({ ok: false, error: 'invalid_token' });
    }

    if (record.verified) {
      return res.status(409).json({ ok: false, error: 'already_verified' });
    }

    if (!captchaResponse) {
      return res.status(400).json({ ok: false, error: 'captcha_required' });
    }

    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!secretKey) {
      console.error('RECAPTCHA_SECRET_KEY belum diatur.');
      return res.status(500).json({ ok: false, error: 'server_not_configured' });
    }

    try {
      const verificationParams = new URLSearchParams({
        secret: secretKey,
        response: captchaResponse,
      });

      if (req.ip) {
        verificationParams.append('remoteip', req.ip);
      }

      const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: verificationParams,
      });

      const captchaResult = await response.json();
      if (!captchaResult.success) {
        console.warn('Verifikasi reCAPTCHA gagal:', captchaResult);
        return res.status(400).json({ ok: false, error: 'captcha_failed' });
      }
    } catch (error) {
      console.error('Gagal menghubungi reCAPTCHA:', error);
      return res.status(500).json({ ok: false, error: 'captcha_verification_failed' });
    }

    const guildId = process.env.GUILD_ID;
    const memberRoleId = process.env.MEMBER_ROLE_ID;
    const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;

    if (!guildId || !memberRoleId) {
      console.error('GUILD_ID atau MEMBER_ROLE_ID belum dikonfigurasi.');
      return res.status(500).json({ ok: false, error: 'server_not_configured' });
    }

    try {
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(record.discordUserId).catch(() => null);
      if (!member) {
        console.error('Member tidak ditemukan di guild saat verifikasi.', record.discordUserId);
        return res.status(404).json({ ok: false, error: 'member_not_found' });
      }

      const role =
        guild.roles.cache.get(memberRoleId) || (await guild.roles.fetch(memberRoleId).catch(() => null));
      if (!role) {
        console.error('Role verifikasi tidak ditemukan di guild.', memberRoleId);
        return res.status(500).json({ ok: false, error: 'role_not_found' });
      }

      if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role);
      }

      const logEntry = verifyStore.setVerified(token);
      if (!logEntry) {
        console.error('Token tidak ditemukan saat penandaan verified.');
        return res.status(500).json({ ok: false, error: 'verification_state_error' });
      }

      if (welcomeChannelId) {
        try {
          const channel = await client.channels.fetch(welcomeChannelId);
          if (channel && channel.isTextBased()) {
            await channel.send(`Welcome <@${record.discordUserId}> 🎉 kamu sekarang sudah jadi Member!`);
          }
        } catch (channelError) {
          console.error('Gagal mengirim pesan welcome:', channelError);
        }
      }

      return res.json({ ok: true, data: logEntry });
    } catch (error) {
      console.error('Gagal memberikan role verifikasi:', error);
      return res.status(500).json({ ok: false, error: 'role_assignment_failed' });
    }
  });

  app.get('/api/admin/list', (req, res) => {
    const { key } = req.query;
    const entries = verifyStore.getVerifiedLog(key);

    if (!entries) {
      return res.status(403).json({ ok: false, error: 'unauthorized' });
    }

    return res.json({ ok: true, data: entries });
  });

  return app;
}

async function startApiServer() {
  if (serverInstance) {
    return serverInstance;
  }

  const app = buildApp();
  const port = Number(process.env.PORT) || 3001;

  serverInstance = app.listen(port, () => {
    console.log(`API verifikasi berjalan di port ${port}`);
  });

  return serverInstance;
}

module.exports = {
  startApiServer,
};
