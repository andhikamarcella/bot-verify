const express = require('express');
const crypto = require('crypto');
const { Events } = require('discord.js');

// Dynamic require with fallback for deployment environment
let discordClient;
try {
  discordClient = require('../../bot/discordClient');
} catch (error) {
  console.error('[API] Failed to load Discord client from relative path, trying absolute path...');
  try {
    discordClient = require('/app/bot/discordClient');
  } catch (absError) {
    console.error('[API] Failed to load Discord client from absolute path, trying alternative...');
    try {
      discordClient = require('../bot/discordClient');
    } catch (altError) {
      console.error('[API] All attempts to load Discord client failed:', altError);
      throw new Error('Cannot load Discord client');
    }
  }
}

const client = discordClient;

// Dynamic require for models
let tokensModel, usersModel, verificationLogModel, guildConfigModel, blacklistedUsersModel, verificationProfilesModel, verificationHistoryModel, loggingUtil;

try {
  tokensModel = require('../models/Tokens');
  usersModel = require('../models/Users');
  verificationLogModel = require('../models/VerificationLog');
  guildConfigModel = require('../models/GuildConfig');
  blacklistedUsersModel = require('../models/BlacklistedUsers');
  verificationProfilesModel = require('../models/VerificationProfiles');
  verificationHistoryModel = require('../models/VerificationHistory');
  loggingUtil = require('../../bot/utils/logging');
} catch (error) {
  console.error('[API] Failed to load models from relative paths, trying absolute paths...');
  try {
    tokensModel = require('/app/api/models/Tokens');
    usersModel = require('/app/api/models/Users');
    verificationLogModel = require('/app/api/models/VerificationLog');
    guildConfigModel = require('/app/api/models/GuildConfig');
    blacklistedUsersModel = require('/app/api/models/BlacklistedUsers');
    verificationProfilesModel = require('/app/api/models/VerificationProfiles');
    verificationHistoryModel = require('/app/api/models/VerificationHistory');
    loggingUtil = require('/app/bot/utils/logging');
  } catch (absError) {
    console.error('[API] Failed to load models from absolute paths:', absError);
    throw new Error('Cannot load API models');
  }
}

const {
  createTokenDocument,
  findToken,
  setTokenStatus,
  bindIpToToken,
  listDmMessagesForUser,
  clearTokenDmFields,
} = tokensModel;
const { upsertUserProfile } = usersModel;
const { insertLog } = verificationLogModel;
const { hashIp } = require('../lib/hashIp');
const { verifyTurnstile } = require('../lib/turnstile');
const { getExtraRolesForUser } = require('../lib/roleSync');
const { connectMongo } = require('../lib/db');
const { getGuildConfig } = guildConfigModel;
const { getBlacklistEntry } = blacklistedUsersModel;
const {
  getVerificationProfile,
  upsertVerificationProfile,
  setRiskScore,
} = verificationProfilesModel;
const { insertHistoryEntry, clearHistoryForUser } = verificationHistoryModel;
const { computeRiskScore } = require('../lib/riskScore');
const { sendVerificationLog } = loggingUtil;

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

router.post('/regenerate-token', async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ ok: false, error: 'missing-token' });
    }

    await ensureReady();

    const record = await findToken(token);
    if (!record) {
      return res.status(400).json({ ok: false, error: 'invalid-token' });
    }

    const config = await getGuildConfig(record.guildId);
    if (config.maintenanceMode) {
      return res.status(503).json({
        ok: false,
        error: 'maintenance-mode',
        reason: config.maintenanceReason || 'System maintenance',
      });
    }

    const currentIpHash = hashIp(req.ip);
    if (record.boundIp && record.boundIp !== currentIpHash) {
      return res.status(403).json({ ok: false, error: 'link-used-on-other-device' });
    }

    const blacklistEntry = await getBlacklistEntry(record.userId, record.guildId).catch(() => null);
    if (blacklistEntry) {
      return res.status(403).json({ ok: false, error: 'blacklisted' });
    }

    const extraRoles = await getExtraRolesForUser(client, record.userId);
    const newToken = crypto.randomUUID();
    await createTokenDocument({
      token: newToken,
      userId: record.userId,
      guildId: record.guildId,
      roleId: record.roleId || MEMBER_ROLE_ID,
      status: 'PENDING',
      extraRolesEligible: extraRoles,
      createdAt: new Date(),
    });

    await upsertVerificationProfile({
      userId: record.userId,
      guildId: record.guildId,
      incrementAttempts: true,
    }).catch(() => {});

    await setTokenStatus(token, 'EXPIRED', { replacedBy: newToken, replacedAt: new Date() }).catch(() => {});

    const verificationUrl = `${FRONTEND_URL.replace(/\/$/, '')}/verify?token=${newToken}`;
    return res.json({ ok: true, token: newToken, verificationUrl });
  } catch (error) {
    console.error('regenerate-token error', error);
    res.status(500).json({ ok: false, error: 'regenerate-token-failed' });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const { token, captchaResult, ip: bodyIp, country, profile: submittedProfile } = req.body || {};
    if (!token) {
      return res.status(400).json({ ok: false, error: 'missing-token' });
    }
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

    const requestedDisplayName =
      submittedProfile && typeof submittedProfile === 'object' && typeof submittedProfile.displayName === 'string'
        ? submittedProfile.displayName
        : '';
    const nicknameFromUser = String(requestedDisplayName || '')
      .replace(/\s+/g, ' ')
      .replace(/[\r\n\t]/g, ' ')
      .trim()
      .slice(0, 32);

    const requestedReason =
      submittedProfile && typeof submittedProfile === 'object' && typeof submittedProfile.applicationReason === 'string'
        ? submittedProfile.applicationReason
        : '';
    const applicationReason = String(requestedReason || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 500);
    if (applicationReason.length < 10) {
      return res.status(400).json({ ok: false, error: 'application-reason-too-short' });
    }

    const applicationTextLength = applicationReason.length;
    const reviewStatus = applicationTextLength < 100 ? 'INTERVIEW_REQUIRED' : 'PENDING_REVIEW';
    const application = {
      displayName: nicknameFromUser || null,
      applicationReason,
      country: country || null,
    };

    await setTokenStatus(token, reviewStatus, {
      application,
      applicationTextLength,
      reviewDecision: null,
      reviewedAt: null,
      reviewedBy: null,
      reviewNotes: null,
      interviewQuestionSentAt: reviewStatus === 'INTERVIEW_REQUIRED' ? new Date() : null,
    });

    try {
      const oldMessages = await listDmMessagesForUser(record.userId, record.guildId, 50).catch(() => []);
      for (const item of oldMessages) {
        const channelId = item?.dmChannelId;
        const messageId = item?.dmMessageId;
        if (!channelId || !messageId) continue;
        try {
          const dmChannel = await client.channels.fetch(channelId).catch(() => null);
          if (dmChannel?.messages) {
            const msg = await dmChannel.messages.fetch(messageId).catch(() => null);
            if (msg && msg.author?.id === client.user.id) {
              await msg.delete().catch(() => {});
            }
          }
        } catch (_) {
          // ignore
        }
        await clearTokenDmFields(item.token).catch(() => {});
      }
    } catch (_) {
      // ignore
    }

    await sendVerificationLog({
      client,
      guildId: record.guildId,
      config,
      user,
      member,
      type: 'info',
      status: reviewStatus,
      riskScore: profile?.riskScore ?? 0,
      country: country || null,
      suspectReasons,
      reason: `Token: ${token}\nReason(${applicationTextLength}): ${applicationReason}`,
    });

    if (reviewStatus === 'INTERVIEW_REQUIRED') {
      try {
        await user.send(
          [
            'Aplikasimu butuh interview singkat karena jawaban kamu terlalu singkat.',
            'Balas DM ini dengan alasan join yang lebih lengkap (minimal 100 karakter).',
            '',
            'Contoh: tujuan join, minat, pengalaman, dan aturan yang kamu pahami.',
          ].join('\n')
        );
      } catch (_) {
        // ignore
      }
    }

    return res.json({
      ok: true,
      reviewStatus,
      badgeEmoji: '🛡️',
      userId: record.userId,
      mobileDeepLink: DISCORD_BROWSER_URL,
    });
  } catch (error) {
    console.error('verify error', error);
    res.status(500).json({ ok: false, error: 'verification-failed' });
  }
});

// Simple test endpoint
router.get('/test', (req, res) => {
  console.log('[API] Test endpoint called');
  res.json({ 
    ok: true, 
    message: 'API is working',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// Health check endpoint
router.get('/health', (req, res) => {
  console.log('[API] Health check requested');
  res.json({ 
    ok: true, 
    status: 'API Server is running',
    timestamp: new Date().toISOString()
  });
});

// GET /api/interview-status?token=xxx
router.get('/interview-status', async (req, res) => {
  const { token } = req.query || {};
  console.log('[API] Interview status request for token:', token);
  
  if (!token) {
    console.log('[API] Missing token parameter');
    return res.status(400).json({ ok: false, error: 'missing-token' });
  }

  try {
    // Find token
    const tokenDoc = await findToken(token);
    if (!tokenDoc) {
      console.log('[API] Token not found:', token);
      return res.status(404).json({ ok: false, error: 'Token tidak ditemukan' });
    }
    
    // Get guild info for icon
    const guild = client.guilds.cache.get(tokenDoc.guildId);
    let guildIcon = null;
    if (guild) {
      guildIcon = guild.iconURL({ size: 128, format: 'png', dynamic: true });
    }
    
    // Check if requester is staff (simplified - you might want to implement proper staff checking)
    const isStaff = false; // This would be based on user authentication/roles
    
    console.log('[API] Found token:', { 
      status: tokenDoc.status, 
      hasAnswers: !!tokenDoc.interviewAnswer,
      guildName: guild?.name,
      isStaff 
    });
    
    const response = {
      ok: true,
      status: tokenDoc.status,
      interviewSubmittedAt: tokenDoc.interviewAnsweredAt,
      reviewStatus: tokenDoc.reviewStatus,
      reason: tokenDoc.reviewNotes,
      guildName: guild?.name || 'Unknown Server',
      guildIcon,
      userId: tokenDoc.userId,
      guildId: tokenDoc.guildId,
      isStaff,
      // Include answers if status is answered or pending review
      answers: (tokenDoc.status === 'INTERVIEW_ANSWERED' || tokenDoc.status === 'PENDING_REVIEW') ? {
        name: tokenDoc.interviewAnswer?.name || '',
        age: tokenDoc.interviewAnswer?.age || '',
        reason: tokenDoc.interviewAnswer?.reason || '',
        experience: tokenDoc.interviewAnswer?.experience || '',
        availability: tokenDoc.interviewAnswer?.availability || '',
        expectations: tokenDoc.interviewAnswer?.expectations || ''
      } : null
    };
    
    console.log('[API] Sending response:', { 
      status: response.status,
      hasAnswers: !!response.answers,
      guildName: response.guildName
    });
    
    res.json(response);
    
  } catch (error) {
    console.error('[API] Interview status error:', error);
    res.status(500).json({ ok: false, error: 'internal-server-error' });
  }
});

// POST /api/interview-submit
router.post('/interview-submit', async (req, res) => {
  const { token, answers } = req.body || {};
  if (!token) {
    return res.status(400).json({ ok: false, error: 'missing-token' });
  }

  try {
    await connectMongo();
    const record = await findToken(token);
    if (!record || record.status !== 'INTERVIEW_REQUIRED') {
      return res.status(400).json({ ok: false, error: 'invalid-token-or-status' });
    }

    // Update token with interview answers
    await setTokenStatus(token, 'INTERVIEW_ANSWERED', {
      interviewAnswer: answers,
      interviewAnsweredAt: new Date(),
    });

    // Log interview submission
    await sendVerificationLog({
      client,
      guildId: record.guildId,
      config: await getGuildConfig(record.guildId),
      user: { id: record.userId, tag: `User ${record.userId}` },
      member: null,
      type: 'info',
      status: 'INTERVIEW_ANSWERED',
      riskScore: 0,
      reason: `Interview submitted via web form`,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[API] Interview submit error:', err);
    res.status(500).json({ ok: false, error: 'internal-error' });
  }
});

// GET /api/interviews-all - Fetch all interviews for dashboard
router.get('/interviews-all', async (req, res) => {
  try {
    console.log('[API] Fetching all interviews for dashboard');
    
    // Get all tokens with interview answers
    const { listAllTokens } = tokensModel;
    const allTokens = await listAllTokens();
    
    // Filter tokens that have interview answers and format them
    const interviews = allTokens
      .filter(token => token.interviewAnswer && Object.keys(token.interviewAnswer).length > 0)
      .map(token => {
        const guild = client.guilds.cache.get(token.guildId);
        
        return {
          token: token.token,
          userId: token.userId,
          guildId: token.guildId,
          guildName: guild?.name || 'Unknown Server',
          guildIcon: guild ? guild.iconURL({ size: 128, format: 'png', dynamic: true }) : null,
          status: token.status,
          answers: token.interviewAnswer,
          interviewSubmittedAt: token.interviewAnsweredAt,
          reviewedAt: token.reviewedAt,
          reviewStatus: token.reviewStatus,
          reviewNotes: token.reviewNotes
        };
      })
      .sort((a, b) => {
        // Sort by submission date (newest first)
        const dateA = new Date(a.interviewSubmittedAt || 0);
        const dateB = new Date(b.interviewSubmittedAt || 0);
        return dateB.getTime() - dateA.getTime();
      });
    
    console.log(`[API] Found ${interviews.length} interviews with answers`);
    
    res.json(interviews);
    
  } catch (error) {
    console.error('[API] Error fetching all interviews:', error);
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// Interview Action Endpoint (Approve/Reject/Hold)
router.post('/interview-action', async (req, res) => {
  try {
    const { token, action } = req.body;
    
    console.log('[Interview Action] Received request:', { token, action });
    
    if (!token || !action) {
      return res.status(400).json({ error: 'Token dan action diperlukan' });
    }
    
    if (!['approve', 'reject', 'hold'].includes(action)) {
      return res.status(400).json({ error: 'Action tidak valid' });
    }
    
    // Find token
    const tokenDoc = await findToken(token);
    if (!tokenDoc) {
      return res.status(404).json({ error: 'Token tidak ditemukan' });
    }
    
    // Get guild and user info
    const guild = client.guilds.cache.get(tokenDoc.guildId);
    if (!guild) {
      return res.status(404).json({ error: 'Guild tidak ditemukan' });
    }
    
    const member = await guild.members.fetch(tokenDoc.userId).catch(() => null);
    if (!member) {
      return res.status(404).json({ error: 'User tidak ada di server' });
    }
    
    const config = await fetchConfig(guild.id);
    
    let newStatus;
    let message;
    
    switch (action) {
      case 'approve':
        // Assign role
        if (tokenDoc.roleId && member.roles.cache.has(tokenDoc.roleId) === false) {
          await member.roles.add(tokenDoc.roleId);
          console.log(`[Interview Action] Assigned role ${tokenDoc.roleId} to user ${member.user.tag}`);
        }
        
        newStatus = 'VERIFIED';
        message = '✅ Aplikasi disetujui! User mendapatkan role dan dapat join Discord.';
        
        // Send verification log
        await sendVerificationLog({
          client,
          guildId: guild.id,
          config,
          user: member.user,
          member,
          type: 'success',
          status: 'VERIFIED',
          riskScore: 0,
          reason: `Interview approved by staff. Token: ${token}`,
        });
        
        // Send DM to user
        try {
          await member.user.send(`
🎉 **Selamat! Interview Kamu Disetujui!**

Terima kasih telah menunggu review dari staff. Kamu telah disetujui dan mendapatkan role di server **${guild.name}**.

🔗 **Join Discord Server:** https://discord.gg/gECYdzVz2j

Jika ada kendala, hubungi staff server ya!
          `).catch(() => {});
        } catch (dmError) {
          console.log('[Interview Action] Failed to send DM to user:', dmError.message);
        }
        break;
        
      case 'reject':
        // Kick from server
        await member.kick('Interview ditolak oleh staff');
        console.log(`[Interview Action] Kicked user ${member.user.tag} from server`);
        
        newStatus = 'REJECTED';
        message = '❌ Aplikasi ditolak. User telah dikeluarkan dari server.';
        
        // Send verification log
        await sendVerificationLog({
          client,
          guildId: guild.id,
          config,
          user: member.user,
          member: null,
          type: 'fail',
          status: 'REJECTED',
          riskScore: 100,
          reason: `Interview rejected by staff. Token: ${token}`,
        });
        
        // Send DM to user (if possible, before kick)
        try {
          await member.user.send(`
❌ **Maaf, Interview Kamu Ditolak**

Setelah review oleh staff, aplikasi kamu tidak disetujui untuk bergabung dengan server **${guild.name}**.

Kamu telah dikeluarkan dari server. Jika kamu merasa ini kesalahan, silakan hubungi staff server.

Terima kasih atas minat kamu.
          `).catch(() => {});
        } catch (dmError) {
          console.log('[Interview Action] Failed to send DM to user:', dmError.message);
        }
        break;
        
      case 'hold':
        newStatus = 'HOLD';
        message = '⏸️ Aplikasi ditahan. User diminta mengisi ulang form.';
        
        // Send verification log
        await sendVerificationLog({
          client,
          guildId: guild.id,
          config,
          user: member.user,
          member,
          type: 'info',
          status: 'HOLD',
          riskScore: 50,
          reason: `Interview held by staff. User requested to re-fill form. Token: ${token}`,
        });
        
        // Send DM to user
        try {
          await member.user.send(`
⏸️ **Aplikasi Kamu Ditahan**

Staff meminta kamu untuk mengisi ulang form interview. Silakan perbarui jawaban kamu di link interview yang sama.

🔗 **Link Interview:** ${process.env.PUBLIC_FRONTEND_URL || 'http://localhost:3000'}/interview?token=${token}&guild=${encodeURIComponent(guild.name)}

Pastikan jawaban kamu lengkap dan jelas ya!
          `).catch(() => {});
        } catch (dmError) {
          console.log('[Interview Action] Failed to send DM to user:', dmError.message);
        }
        break;
    }
    
    // Update token status
    await setTokenStatus(token, newStatus, {
      reviewedAt: new Date(),
      reviewDecision: action.toUpperCase(),
      reviewNotes: `Action performed by staff via web interface`,
    });
    
    console.log(`[Interview Action] Successfully performed ${action} for token ${token}`);
    
    res.json({ 
      success: true, 
      message,
      action,
      newStatus,
      userId: tokenDoc.userId,
      guildId: tokenDoc.guildId
    });
    
  } catch (error) {
    console.error('[Interview Action] Error:', error);
    res.status(500).json({ 
      error: 'Terjadi kesalahan saat melakukan action',
      details: error.message 
    });
  }
});

module.exports = router;
