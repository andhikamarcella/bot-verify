const express = require('express');
const crypto = require('crypto');
const { Events } = require('discord.js');
const client = require('../../bot/discordClient');
const { createTokenDocument, findToken, setTokenStatus, bindIpToToken, listDmMessagesForUser } = require('../models/Tokens');
const { upsertUserProfile } = require('../models/Users');
const { insertLog } = require('../models/VerificationLog');
const { hashIp } = require('../lib/hashIp');
const { verifyTurnstile } = require('../lib/turnstile');
const { getExtraRolesForUser } = require('../lib/roleSync');
const { connectMongo } = require('../lib/db');
const { getGuildConfig } = require('../models/GuildConfig');
const { getBlacklistEntry } = require('../models/BlacklistedUsers');
const {
  getVerificationProfile,
  upsertVerificationProfile,
  setRiskScore,
} = require('../models/VerificationProfiles');
const { insertHistoryEntry, clearHistoryForUser } = require('../models/VerificationHistory');
const { computeRiskScore } = require('../lib/riskScore');
const { sendVerificationLog } = require('../../bot/utils/logging');

const router = express.Router();

const GUILD_ID = process.env.GUILD_ID;
const MEMBER_ROLE_ID = process.env.MEMBER_ROLE_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const FRONTEND_URL = process.env.PUBLIC_FRONTEND_URL || '';
const DISCORD_BROWSER_URL = process.env.DISCORD_BROWSER_URL || null;
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '';

function renderNicknameTemplate(template, context) {
  if (!template) {
    return '';
  }
  return template.replace(/{{\s*([^}]+)\s*}}/g, (_match, key) => {
    const normalized = String(key || '').trim();
    if (!normalized) return '';
    const value = context[normalized];
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number') {
      return String(value);
    }
    return '';
  });
}

async function ensureReady() {
  await connectMongo();
  if (!client.isReady()) {
    await new Promise((resolve) => client.once(Events.ClientReady, resolve));
  }
}

// Pre-verification Check & Environment Check
router.get('/pre-check', async (req, res) => {
  try {
    const { token } = req.query;
    const ip = req.ip;
    const currentIpHash = hashIp(ip);

    await ensureReady();

    // 1. Environment Check
    const envStatus = {
      botOnline: client.isReady(),
      apiLatency: client.ws.ping,
      guildId: GUILD_ID,
      maintenanceMode: false,
    };

    if (token) {
        const record = await findToken(token);
        if (!record) {
            return res.json({ ok: false, error: 'invalid-token', envStatus });
        }
        
        const config = await getGuildConfig(record.guildId);
        envStatus.maintenanceMode = config.maintenanceMode;

        if (config.maintenanceMode) {
            return res.json({ 
                ok: false, 
                error: 'maintenance-mode', 
                reason: config.maintenanceReason || 'System maintenance',
                envStatus 
            });
        }

        // Token Expiration Check
        const createdAt = record.createdAt ? new Date(record.createdAt) : new Date();
        const diffMinutes = (Date.now() - createdAt.getTime()) / (1000 * 60);
        if (diffMinutes > 15) {
             return res.json({ ok: false, error: 'token-expired', envStatus });
        }

        // One-Time URL Protection (Bind IP)
        if (record.boundIp && record.boundIp !== currentIpHash) {
             return res.json({ ok: false, error: 'link-used-on-other-device', envStatus });
        }
        
        if (!record.boundIp) {
            await bindIpToToken(token, currentIpHash);
        }

        let nicknameSuggestions = [];
        try {
          const guild = await client.guilds.fetch(record.guildId);
          const member = await guild.members.fetch(record.userId).catch(() => null);
          const user = member?.user || (await client.users.fetch(record.userId).catch(() => null));
          const candidates = [
            member?.displayName,
            user?.globalName,
            user?.username,
          ]
            .map((v) => (typeof v === 'string' ? v.trim() : ''))
            .filter(Boolean)
            .map((v) => v.replace(/\s+/g, ' ').trim().slice(0, 32));
          nicknameSuggestions = Array.from(new Set(candidates));
        } catch (_) {
          nicknameSuggestions = [];
        }

        return res.json({ 
            ok: true, 
            tokenValid: true, 
            expiresIn: Math.max(0, 15 * 60 * 1000 - (Date.now() - createdAt.getTime())),
            envStatus,
            nicknameSuggestions,
        });
    }

    return res.json({ ok: true, envStatus });

  } catch (error) {
    console.error('pre-check error', error);
    res.status(500).json({ ok: false, error: 'pre-check-failed' });
  }
});


router.post('/create-token', async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'missing-userId' });
    }

    await ensureReady();

    const blacklistEntry = await getBlacklistEntry(userId, GUILD_ID).catch(() => null);
    if (blacklistEntry) {
      try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
          await member.kick(`Blacklisted: ${blacklistEntry.reason || 'unspecified'}`).catch(() => {});
        }
      } catch (_) {
        // ignore
      }
      return res.status(403).json({ ok: false, error: 'blacklisted' });
    }

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
    await upsertVerificationProfile({
      userId,
      guildId: GUILD_ID,
      incrementAttempts: true,
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
    const { token, captchaResult, ip: bodyIp, country, profile: submittedProfile } = req.body || {};
    if (!token) {
      return res.status(400).json({ ok: false, error: 'missing-token' });
    }

    await ensureReady();

    const record = await findToken(token);
    if (!record || record.status !== 'PENDING') {
      return res.status(400).json({ ok: false, error: 'invalid-token' });
    }

    const config = await getGuildConfig(record.guildId);
    
    // Maintenance Check
    if (config.maintenanceMode) {
        return res.status(503).json({ ok: false, error: 'maintenance-mode', reason: config.maintenanceReason });
    }

    const profile = await getVerificationProfile(record.userId, record.guildId);
    const suspectReasons = profile?.suspectReasons || [];

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
      await insertHistoryEntry({
        userId: record.userId,
        guildId: record.guildId,
        status: 'failed',
        reason: 'token-expired',
      });
      const user = await client.users.fetch(record.userId).catch(() => null);
      await sendVerificationLog({
        client,
        guildId: record.guildId,
        config,
        user,
        type: 'failure',
        status: 'FAILED',
        riskScore: profile?.riskScore ?? 0,
        suspectReasons,
        reason: 'Token expired before completion',
      });
      return res.status(400).json({ ok: false, error: 'token-expired' });
    }

    // Turnstile Verification
    let captchaOk = false;
    let captchaError = null;
    
    console.log('[Verify] Starting captcha validation', {
      type: captchaResult?.type,
      hasValue: !!captchaResult?.value,
      valueLength: captchaResult?.value?.length,
      hasSecretKey: !!TURNSTILE_SECRET_KEY,
      secretKeyLength: TURNSTILE_SECRET_KEY?.length,
      secretKeyPrefix: TURNSTILE_SECRET_KEY ? TURNSTILE_SECRET_KEY.substring(0, 15) + '...' : 'MISSING',
      ip: bodyIp || req.ip,
      userAgent: req.get('user-agent')?.substring(0, 50)
    });

    if (captchaResult?.type === 'turnstile') {
      if (!captchaResult.value || captchaResult.value.trim() === '') {
        console.error('[Verify] Turnstile token is empty');
        captchaError = 'Token is empty';
        captchaOk = false;
      } else if (!TURNSTILE_SECRET_KEY || TURNSTILE_SECRET_KEY.trim() === '') {
        console.error('[Verify] TURNSTILE_SECRET_KEY is not set in environment variables!');
        console.error('[Verify] Please check your Railway/Vercel environment variables');
        captchaError = 'Secret key not configured';
        captchaOk = false;
      } else if (TURNSTILE_SECRET_KEY.length < 20) {
        console.error('[Verify] TURNSTILE_SECRET_KEY seems too short:', TURNSTILE_SECRET_KEY.length);
        captchaError = 'Secret key invalid format';
        captchaOk = false;
      } else {
        console.log('[Verify] Calling verifyTurnstile with token length:', captchaResult.value.length);
        captchaOk = await verifyTurnstile(captchaResult.value, TURNSTILE_SECRET_KEY, bodyIp || req.ip);
        if (!captchaOk) {
          captchaError = 'Cloudflare validation failed';
        }
      }
    } else if (captchaResult?.type === 'fallbackEmoji') {
      // Check if strict mode is enabled
      const TURNSTILE_STRICT = process.env.TURNSTILE_STRICT === 'true';
      if (TURNSTILE_STRICT) {
        console.error('[Verify] TURNSTILE_STRICT is enabled, fallback emoji not allowed');
        captchaError = 'Turnstile required (strict mode)';
        captchaOk = false;
      } else {
        captchaOk = captchaResult.value === 'ok';
        console.log('[Verify] Using fallback emoji captcha', { ok: captchaOk });
      }
    } else {
      console.error('[Verify] Unknown captcha type:', captchaResult?.type);
      captchaError = 'Unknown captcha type';
      captchaOk = false;
    }

    console.log('[Verify] Captcha validation result:', { 
      ok: captchaOk, 
      error: captchaError,
      type: captchaResult?.type 
    });

    if (!captchaOk) {
      const failureReason = captchaError || 'captcha validation failed';
      console.error('[Verify] Captcha validation failed:', failureReason);
      
      await setTokenStatus(token, 'FAILED', { failureReason: 'captcha', details: captchaError });
      await insertLog({
        userId: record.userId,
        guildId: record.guildId,
        ipHash: hashIp(bodyIp || req.ip),
        result: 'FAILED',
        reason: 'captcha-invalid',
      });
      await insertHistoryEntry({
        userId: record.userId,
        guildId: record.guildId,
        status: 'failed',
        reason: 'captcha-invalid',
      });
      const user = await client.users.fetch(record.userId).catch(() => null);
      await sendVerificationLog({
        client,
        guildId: record.guildId,
        config,
        user,
        type: 'failure',
        status: 'FAILED',
        riskScore: profile?.riskScore ?? 0,
        suspectReasons,
        reason: `Captcha validation failed: ${failureReason}`,
      });
      return res.status(400).json({ 
        ok: false, 
        error: 'captcha-invalid',
        reason: captchaError || 'Captcha validation failed'
      });
    }

    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(record.userId);
    const user = member.user;
    const blacklistEntry = await getBlacklistEntry(record.userId, record.guildId);

    if (blacklistEntry) {
      await setTokenStatus(token, 'FAILED', { failureReason: 'blacklisted' }).catch(() => {});
      await insertLog({
        userId: record.userId,
        guildId: record.guildId,
        ipHash: hashIp(bodyIp || req.ip),
        result: 'FAILED',
        reason: 'blacklisted',
      }).catch(() => {});
      await insertHistoryEntry({
        userId: record.userId,
        guildId: record.guildId,
        status: 'failed',
        reason: `blacklisted:${blacklistEntry.reason || 'unspecified'}`,
      }).catch(() => {});
      await sendVerificationLog({
        client,
        guildId: record.guildId,
        config,
        user,
        member,
        type: 'failure',
        status: 'BLACKLISTED',
        riskScore: profile?.riskScore ?? 100,
        suspectReasons,
        reason: `Blacklisted: ${blacklistEntry.reason || 'unspecified'}`,
      }).catch(() => {});
      await member.kick(`Blacklisted: ${blacklistEntry.reason || 'unspecified'}`).catch(() => {});
      return res.status(403).json({ ok: false, error: 'blacklisted' });
    }

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

    const requestedDisplayName =
      submittedProfile && typeof submittedProfile === 'object' && typeof submittedProfile.displayName === 'string'
        ? submittedProfile.displayName
        : '';
    const nicknameFromUser = String(requestedDisplayName || '')
      .replace(/\s+/g, ' ')
      .replace(/[\r\n\t]/g, ' ')
      .trim()
      .slice(0, 32);

    if (nicknameFromUser) {
      try {
        await member.setNickname(nicknameFromUser, 'User provided nickname during verification');
      } catch (nickError) {
        console.warn('Failed to update nickname (user provided)', nickError?.message);
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

    const now = new Date();
    const verifiedToken = await setTokenStatus(token, 'VERIFIED', { verifiedAt: now });
    await insertLog({
      userId: record.userId,
      guildId: record.guildId,
      ipHash: hashIp(bodyIp || req.ip),
      result: 'VERIFIED',
    });

    const accountAgeMs = Date.now() - user.createdTimestamp;
    const accountAgeDays = Math.max(accountAgeMs / (1000 * 60 * 60 * 24), 0);
    const riskScore = computeRiskScore({
      accountAgeDays,
      blacklisted: Boolean(blacklistEntry),
      suspectReasons,
      failedAttempts: profile?.attempts || 0,
    });
    await setRiskScore(record.userId, record.guildId, riskScore);
    await upsertVerificationProfile({
      userId: record.userId,
      guildId: record.guildId,
      accountCreatedAt: user.createdAt,
      isSuspect: Boolean(profile?.isSuspect),
      suspectReasons,
      riskScore,
      country: country || profile?.country || null,
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
      country: country || profile?.country || null,
      riskScore,
    });

    const dmMessages = await listDmMessagesForUser(record.userId, record.guildId, 25).catch(() => []);
    for (const item of dmMessages) {
      const channelId = item?.dmChannelId;
      const messageId = item?.dmMessageId;
      if (!channelId || !messageId) continue;
      try {
        const dmChannel = await client.channels.fetch(channelId);
        if (dmChannel?.messages) {
          const msg = await dmChannel.messages.fetch(messageId).catch(() => null);
          if (msg) {
            await msg.delete().catch(() => {});
          }
        }
      } catch (_) {
        // ignore
      }
    }

    if (verifiedToken?.dmChannelId && verifiedToken?.dmMessageId) {
      try {
        const dmChannel = await client.channels.fetch(verifiedToken.dmChannelId);
        if (dmChannel?.messages) {
          const msg = await dmChannel.messages.fetch(verifiedToken.dmMessageId).catch(() => null);
          if (msg) {
            await msg.delete().catch(() => {});
          }
        }
      } catch (_) {
        // ignore
      }
    }

    await clearHistoryForUser(record.userId, record.guildId).catch(() => {});
    await insertHistoryEntry({
      userId: record.userId,
      guildId: record.guildId,
      status: 'verified',
      riskScore,
      country: country || null,
    });

    if (config.autoNickname && !nicknameFromUser) {
      const template = config.nicknameTemplate || '{{username}}';
      const context = {
        username: user.username,
        globalName: user.globalName || '',
        displayName: submittedProfile?.displayName || member?.displayName || user.username,
      };
      if (submittedProfile && typeof submittedProfile === 'object') {
        for (const [key, value] of Object.entries(submittedProfile)) {
          if (value === null || value === undefined) continue;
          if (typeof value === 'string' && value.trim()) {
            context[key] = value.trim();
          } else if (typeof value === 'number') {
            context[key] = String(value);
          }
        }
      }
      const rendered = renderNicknameTemplate(template, context);
      const nickname = rendered.replace(/\s+/g, ' ').trim().slice(0, 32);
      if (nickname) {
        try {
          await member.setNickname(nickname, 'Auto nickname sync after verification');
        } catch (nickError) {
          console.warn('Failed to update nickname', nickError?.message);
          await insertHistoryEntry({
            userId: record.userId,
            guildId: record.guildId,
            status: 'reset',
            reason: `nickname-failed:${nickError?.code || nickError?.message}`,
          });
          await sendVerificationLog({
            client,
            guildId: record.guildId,
            config,
            user,
            member,
            type: 'failure',
            status: 'RESET',
            riskScore,
            suspectReasons,
            reason: `Nickname update failed: ${nickError?.message || nickError?.code}`,
          });
        }
      }
    }

    await sendVerificationLog({
      client,
      guildId: record.guildId,
      config,
      user,
      member,
      type: 'success',
      status: 'VERIFIED',
      riskScore,
      country: country || null,
      suspectReasons,
    });

    try {
      const { registerRecentVerification } = require('../../bot/bot');
      if (typeof registerRecentVerification === 'function') {
        registerRecentVerification(record.userId, record.guildId);
      }
    } catch (regErr) {
      console.warn('Failed to flag recent verification', regErr?.message);
    }

    res.json({
      ok: true,
      badgeEmoji: '🛡️',
      userId: record.userId,
      mobileDeepLink: DISCORD_BROWSER_URL,
      riskScore,
    });
  } catch (error) {
    console.error('verify error', error);
    res.status(500).json({ ok: false, error: 'verification-failed' });
  }
});

module.exports = router;
