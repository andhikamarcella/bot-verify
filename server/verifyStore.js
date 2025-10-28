/**
 * In-memory store sederhana untuk token verifikasi dan log pengguna yang sukses.
 * PRODUKSI: gunakan database persisten agar data tidak hilang saat proses restart.
 */
const crypto = require('crypto');

const pendingTokens = new Map();
const verifiedLog = [];
const usedTokens = new Set();

function createToken(user) {
  if (!user || !user.id) {
    throw new Error('User Discord tidak valid untuk membuat token.');
  }

  // Buang token lama milik user agar tidak menumpuk.
  for (const [token, data] of pendingTokens.entries()) {
    if (data.discordUserId === user.id) {
      pendingTokens.delete(token);
    }
  }

  const token = crypto.randomBytes(32).toString('hex');
  const fallbackTag = user.discriminator ? `${user.username}#${user.discriminator}` : user.username;
  pendingTokens.set(token, {
    discordUserId: user.id,
    username: user.globalName || fallbackTag,
    discriminator: user.discriminator,
    createdAt: new Date().toISOString(),
    verified: false,
  });

  return token;
}

function getByToken(token) {
  return pendingTokens.get(token);
}

function setVerified(token) {
  const record = pendingTokens.get(token);
  if (!record) {
    return null;
  }

  record.verified = true;
  const logEntry = {
    discordUserId: record.discordUserId,
    username: record.username,
    verifiedAt: new Date().toISOString(),
  };
  verifiedLog.push(logEntry);
  usedTokens.add(token);
  pendingTokens.delete(token);
  return logEntry;
}

function deleteToken(token) {
  pendingTokens.delete(token);
}

function isTokenUsed(token) {
  return usedTokens.has(token);
}

function getVerifiedLog(adminKey) {
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return null;
  }
  return [...verifiedLog];
}

module.exports = {
  createToken,
  getByToken,
  setVerified,
  deleteToken,
  isTokenUsed,
  getVerifiedLog,
};
