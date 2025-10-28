const { connectMongo } = require('../lib/db');

const COLLECTION_NAME = 'users';

async function getCollection() {
  const db = await connectMongo();
  return db.collection(COLLECTION_NAME);
}

async function upsertUserProfile(user) {
  const collection = await getCollection();
  const filter = { userId: user.userId, guildId: user.guildId };
  const update = {
    $set: {
      userId: user.userId,
      guildId: user.guildId,
      badgeEmoji: user.badgeEmoji || '🛡️',
      badgeName: user.badgeName || 'Verified Member',
      suspicious: Boolean(user.suspicious),
      suspiciousReason: user.suspiciousReason || null,
      avatarUrl: user.avatarUrl || null,
      bannerUrl: user.bannerUrl || null,
      accentColor: user.accentColor ?? null,
      usernameSnapshot: user.usernameSnapshot || null,
      globalNameSnapshot: user.globalNameSnapshot || null,
      verifiedAt: user.verifiedAt || new Date(),
    },
  };
  await collection.updateOne(filter, update, { upsert: true });
}

async function markUserSuspicious(userId, guildId, reason) {
  const collection = await getCollection();
  await collection.updateOne(
    { userId, guildId },
    {
      $set: {
        suspicious: true,
        suspiciousReason: reason,
      },
    },
    { upsert: true }
  );
}

async function getUserProfile(userId, guildId) {
  const collection = await getCollection();
  return collection.findOne({ userId, guildId });
}

async function getVerifiedUsers(limit = 50) {
  const collection = await getCollection();
  return collection
    .find({ badgeEmoji: { $exists: true } })
    .sort({ verifiedAt: -1 })
    .limit(limit)
    .toArray();
}

module.exports = {
  upsertUserProfile,
  markUserSuspicious,
  getUserProfile,
  getVerifiedUsers,
};
