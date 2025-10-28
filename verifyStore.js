const crypto = require('crypto');

// Penyimpanan sederhana di memori. Untuk production, gunakan database persisten.
const pendingVerifications = new Map();
const userTokenIndex = new Map();

function createToken(discordUserId) {
  if (!discordUserId) {
    throw new Error('discordUserId diperlukan untuk membuat token.');
  }

  const existingToken = userTokenIndex.get(discordUserId);
  if (existingToken) {
    pendingVerifications.delete(existingToken);
    userTokenIndex.delete(discordUserId);
  }

  const token = crypto.randomBytes(32).toString('hex');
  const record = {
    token,
    discordUserId,
    verified: false,
    createdAt: new Date().toISOString(),
  };

  pendingVerifications.set(token, record);
  userTokenIndex.set(discordUserId, token);
  return token;
}

function getByToken(token) {
  if (!token) return undefined;
  return pendingVerifications.get(token);
}

function markVerified(token) {
  const record = pendingVerifications.get(token);
  if (record) {
    record.verified = true;
  }
}

function deleteToken(token) {
  const record = pendingVerifications.get(token);
  if (record) {
    userTokenIndex.delete(record.discordUserId);
    pendingVerifications.delete(token);
  }
}

function getTokenForUser(discordUserId) {
  return userTokenIndex.get(discordUserId);
}

module.exports = {
  createToken,
  getByToken,
  markVerified,
  deleteToken,
  getTokenForUser,
  pendingVerifications,
};
