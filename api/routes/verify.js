const express = require('express');
const crypto = require('crypto');
const client = require('../../bot/discordClient');
const { createTokenDocument, findToken, setTokenStatus } = require('../models/Tokens');
const { upsertUserProfile } = require('../models/Users');
const { insertLog } = require('../models/VerificationLog');
const { hashIp } = require('../lib/hashIp');
const { verifyRecaptcha } = require('../lib/recaptcha');
const { getExtraRolesForUser } = require('../lib/roleSync');
const { connectMongo } = require('../lib/db');

const router = express.Router();

const GUILD_ID = process.env.GUILD_ID;
const MEMBER_ROLE_ID = process.env.MEMBER_ROLE_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const FRONTEND_URL = process.env.PUBLIC_FRONTEND_URL || '';
const DISCORD_BROWSER_URL = process.env.DISCORD_BROWSER_URL || null;

async function ensureReady() {
  await connectMongo();
  if (!client.isReady()) {
    await new Promise((resolve) => client.once('ready', resolve));
  }
}

router.post('/create-token', async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'missing-userId' });
    }

    await ensureReady();

    const extraRoles = await getExtraRolesForUser(client, userId);
    const token = crypto.randomUUID();
    await createTokenDocument({
      token,
      userId,
      guildId: GUILD_ID,
      roleId: MEMBER_ROLE_ID,
      status: 'PENDING',
      extraRolesEligible: extraRoles,
      createdAt: new Date(),
    });

    const verificationUrl = `${FRONTEND_URL.replace(/\/$/, '')}/verify?token=${token}`;
    res.json({ ok: true, token, verificationUrl });
  } catch (error) {
    console.error('create-token error', error);
    res.status(500).json({ ok: false, error: 'create-token-failed' });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const { token, captchaResult, ip: bodyIp } = req.body || {};
    if (!token) {
      return res.status(400).json({ ok: false, error: 'missing-token' });
    }

    await ensureReady();

    const record = await findToken(token);
    if (!record || record.status !== 'PENDING') {
      return res.status(400).json({ ok: false, error: 'invalid-token' });
    }

    const createdAt = record.createdAt ? new Date(record.createdAt) : new Date();
    if (Date.now() - createdAt.getTime() > 15 * 60 * 1000) {
      await setTokenStatus(token, 'FAILED', { failureReason: 'expired' });
      await insertLog({
        userId: record.userId,
        guildId: record.guildId,
        ipHash: hashIp(bodyIp || req.ip),
        result: 'FAILED',
        reason: 'expired',
      });
      return res.status(400).json({ ok: false, error: 'token-expired' });
    }

    let captchaOk = false;
    if (captchaResult?.type === 'recaptcha') {
      captchaOk = await verifyRecaptcha(captchaResult.value, process.env.RECAPTCHA_SECRET_KEY);
    } else if (captchaResult?.type === 'fallbackEmoji') {
      captchaOk = captchaResult.value === 'ok';
    }

    if (!captchaOk) {
      await setTokenStatus(token, 'FAILED', { failureReason: 'captcha' });
      await insertLog({
        userId: record.userId,
        guildId: record.guildId,
        ipHash: hashIp(bodyIp || req.ip),
        result: 'FAILED',
        reason: 'captcha-invalid',
      });
      return res.status(400).json({ ok: false, error: 'captcha-invalid' });
    }

    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(record.userId);

    const rolesToApply = new Set();
    if (MEMBER_ROLE_ID) {
      rolesToApply.add(MEMBER_ROLE_ID);
    }
    for (const roleId of record.extraRolesEligible || []) {
      if (roleId) {
        rolesToApply.add(roleId);
      }
    }

    for (const roleId of rolesToApply) {
      if (!member.roles.cache.has(roleId)) {
        try {
          await member.roles.add(roleId, 'Verification success');
        } catch (roleError) {
          console.error('Failed to assign role', roleId, roleError);
        }
      }
    }

    if (WELCOME_CHANNEL_ID) {
      try {
        const channel = await guild.channels.fetch(WELCOME_CHANNEL_ID);
        await channel.send({
          content: `Welcome <@${record.userId}> 🎉 kamu sekarang sudah jadi Member!`,
        });
      } catch (welcomeError) {
        console.error('Failed to send welcome message', welcomeError);
      }
    }

    const user = await client.users.fetch(record.userId);
    const now = new Date();
    await setTokenStatus(token, 'VERIFIED', { verifiedAt: now });
    await insertLog({
      userId: record.userId,
      guildId: record.guildId,
      ipHash: hashIp(bodyIp || req.ip),
      result: 'VERIFIED',
    });
    await upsertUserProfile({
      userId: record.userId,
      guildId: record.guildId,
      badgeEmoji: '🛡️',
      badgeName: 'Verified Member',
      suspicious: false,
      avatarUrl: user.displayAvatarURL({ size: 256, extension: 'png' }),
      bannerUrl: user.bannerURL({ size: 512, extension: 'png' }) || null,
      accentColor: user.accentColor ?? null,
      usernameSnapshot: user.username,
      globalNameSnapshot: user.globalName || null,
      verifiedAt: now,
    });

    try {
      const { registerRecentVerification } = require('../../bot/bot');
      if (typeof registerRecentVerification === 'function') {
        registerRecentVerification(record.userId);
      }
    } catch (regErr) {
      console.warn('Failed to flag recent verification', regErr?.message);
    }

    res.json({
      ok: true,
      badgeEmoji: '🛡️',
      userId: record.userId,
      mobileDeepLink: DISCORD_BROWSER_URL,
    });
  } catch (error) {
    console.error('verify error', error);
    res.status(500).json({ ok: false, error: 'verification-failed' });
  }
});

module.exports = router;
