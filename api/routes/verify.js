const express = require('express');
const { Routes } = require('discord.js');
const client = require('../../bot/discordClient');
const {
  createTokenDocument,
  findToken,
  updateToken,
  markVerified,
  incrementFailure,
  getLeaderboard,
} = require('../models/Token');
const { upsertUserProfile } = require('../models/UserProfile');
const { verifyRecaptcha } = require('../lib/recaptcha');
const { hashIp } = require('../lib/hashIp');
const { registerRecentVerification } = require('../../bot/bot');

const router = express.Router();

function buildVerificationUrl(token) {
  const base = (process.env.PUBLIC_FRONTEND_URL || '').replace(/\/$/, '');
  return `${base}/verify?token=${token}`;
}

async function fetchProfile(userId) {
  try {
    const data = await client.rest.get(Routes.user(userId));
    return data;
  } catch (error) {
    console.warn('Failed to fetch user profile from Discord REST', error?.message);
    return null;
  }
}

router.post('/create-token', async (req, res) => {
  try {
    const { userId, username, locale, trustedSource } = req.body;
    if (!userId || !username) {
      res.status(400).json({ ok: false, error: 'missing-user' });
      return;
    }
    const { v4: uuidv4 } = require('uuid');
    const token = uuidv4();
    await createTokenDocument({
      token,
      userId,
      username,
      locale,
      guildId: process.env.GUILD_ID,
      trustedSource,
    });
    res.json({ ok: true, token, verificationUrl: buildVerificationUrl(token) });
  } catch (error) {
    console.error('Failed to create token via API', error);
    res.status(500).json({ ok: false, error: 'internal-error' });
  }
});

router.get('/verify/info', async (req, res) => {
  const token = req.query.token;
  if (!token) {
    res.status(400).json({ ok: false, error: 'missing-token' });
    return;
  }
  const tokenDoc = await findToken(token);
  if (!tokenDoc) {
    res.status(404).json({ ok: false, error: 'token-not-found' });
    return;
  }
  res.json({
    ok: true,
    discordUserId: tokenDoc.userId,
    username: tokenDoc.username,
    status: tokenDoc.status,
    verifiedAt: tokenDoc.verifiedAt,
    failureReason: tokenDoc.failureReason,
  });
});

router.get('/guild-info', async (_req, res) => {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    res.json({
      ok: true,
      name: guild.name,
      icon: guild.iconURL({ size: 256 }),
      memberCount: guild.memberCount,
      browserUrl: process.env.DISCORD_BROWSER_URL || null,
    });
  } catch (error) {
    console.error('Failed to load guild info', error);
    res.status(500).json({ ok: false, error: 'guild-unavailable' });
  }
});

router.get('/leaderboard', async (_req, res) => {
  try {
    const leaderboard = await getLeaderboard();
    res.json({ ok: true, leaderboard });
  } catch (error) {
    console.error('Failed to load leaderboard', error);
    res.status(500).json({ ok: false, error: 'internal-error' });
  }
});

async function assignMemberRole(userId) {
  const guildId = process.env.GUILD_ID;
  const roleId = process.env.MEMBER_ROLE_ID;
  if (!guildId || !roleId) throw new Error('Missing guild or role configuration');
  const guild = await client.guilds.fetch(guildId);
  const member = await guild.members.fetch(userId);
  if (!member.roles.cache.has(roleId)) {
    await member.roles.add(roleId, 'Verification success');
  }
  return member;
}

async function sendWelcome(userId) {
  const channelId = process.env.WELCOME_CHANNEL_ID;
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    await channel.send({ content: `Welcome <@${userId}> 🎉 kamu sekarang sudah jadi Member!` });
  } catch (error) {
    console.error('Failed to deliver welcome message', error);
  }
}

router.post('/verify', async (req, res) => {
  const { token, captchaResult, fallbackSolution } = req.body || {};
  if (!token) {
    res.status(400).json({ ok: false, error: 'missing-token' });
    return;
  }
  const tokenDoc = await findToken(token);
  if (!tokenDoc) {
    res.status(404).json({ ok: false, error: 'token-not-found' });
    return;
  }

  if (tokenDoc.status === 'verified' || tokenDoc.status === 'trusted') {
    res.status(200).json({ ok: true, alreadyVerified: true });
    return;
  }

  if (tokenDoc.status === 'banned') {
    res.status(403).json({ ok: false, error: 'account-flagged' });
    return;
  }

  const requesterIp = req.ip || req.headers['x-forwarded-for'];
  const ipHash = hashIp(Array.isArray(requesterIp) ? requesterIp[0] : requesterIp);

  let captchaOk = false;
  if (captchaResult) {
    const captcha = await verifyRecaptcha(captchaResult, req.ip);
    captchaOk = captcha.success;
    if (!captcha.success) {
      await incrementFailure(token, captcha.reason, ipHash);
      res.status(400).json({ ok: false, error: captcha.reason });
      return;
    }
  } else if (fallbackSolution) {
    if (fallbackSolution === 'passed') {
      captchaOk = true;
    } else {
      await incrementFailure(token, 'fallback-captcha-failed', ipHash);
      res.status(400).json({ ok: false, error: 'fallback-captcha-failed' });
      return;
    }
  } else {
    await incrementFailure(token, 'missing-captcha', ipHash);
    res.status(400).json({ ok: false, error: 'missing-captcha' });
    return;
  }

  if (!captchaOk) {
    await incrementFailure(token, 'captcha-not-verified', ipHash);
    res.status(400).json({ ok: false, error: 'captcha-not-verified' });
    return;
  }

  try {
    const member = await assignMemberRole(tokenDoc.userId);
    await markVerified(token, { ipHash, status: 'verified' });
    await sendWelcome(tokenDoc.userId);
    registerRecentVerification(tokenDoc.userId);

    const profile = await fetchProfile(tokenDoc.userId);
    if (profile) {
      await upsertUserProfile({
        userId: tokenDoc.userId,
        username: profile.username,
        globalName: profile.global_name,
        avatar: profile.avatar,
        bannerUrl: profile.banner,
        accentColor: profile.accent_color,
        badgeEmoji: '🛡️',
        badgeName: 'Verified Member',
        suspicious: false,
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Failed to complete verification', error);
    await updateToken(token, { status: 'failed', failureReason: error.message });
    res.status(500).json({ ok: false, error: 'discord-error' });
  }
});

module.exports = router;
