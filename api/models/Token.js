// Token persistence helpers for verification flow.
const { connectMongo } = require('../lib/db');

const COLLECTION = 'verification_tokens';

async function collection() {
  const db = await connectMongo();
  return db.collection(COLLECTION);
}

async function createTokenDocument({ token, userId, username, locale, guildId, trustedSource }) {
  const col = await collection();
  const doc = {
    token,
    userId,
    username,
    locale,
    guildId,
    trustedSource: trustedSource || null,
    status: trustedSource ? 'trusted' : 'pending',
    attempts: 0,
    createdAt: new Date(),
    verifiedAt: null,
    failureReason: null,
    ipHashes: [],
    badgeEmoji: null,
    badgeName: null,
  };
  await col.insertOne(doc);
  return doc;
}

async function findToken(token) {
  const col = await collection();
  return col.findOne({ token });
}

async function findLatestByUser(userId) {
  const col = await collection();
  return col
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();
}

async function updateToken(token, update) {
  const col = await collection();
  await col.updateOne({ token }, { $set: update });
  return findToken(token);
}

async function markVerified(token, { badgeEmoji, badgeName, ipHash, status }) {
  const col = await collection();
  const now = new Date();
  const update = {
    status: status || 'verified',
    verifiedAt: now,
    badgeEmoji: badgeEmoji || '🛡️',
    badgeName: badgeName || 'Verified Member',
  };
  const modifier = {
    $set: update,
  };
  if (ipHash) {
    modifier.$addToSet = { ipHashes: ipHash };
  }
  await col.updateOne({ token }, modifier);
  return { ...update, verifiedAt: now };
}

async function incrementFailure(token, reason, ipHash) {
  const col = await collection();
  const modifier = {
    $inc: { attempts: 1 },
    $set: { failureReason: reason, status: 'failed' },
  };
  if (ipHash) {
    modifier.$addToSet = { ipHashes: ipHash };
  }
  await col.updateOne({ token }, modifier);
}

async function getMetrics() {
  const col = await collection();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14);
  const pipeline = [
    {
      $match: {
        createdAt: { $gte: start },
      },
    },
    {
      $project: {
        day: {
          $dateToString: { date: '$createdAt', format: '%Y-%m-%d' },
        },
        status: 1,
      },
    },
    {
      $group: {
        _id: '$day',
        verified: {
          $sum: {
            $cond: [{ $eq: ['$status', 'verified'] }, 1, 0],
          },
        },
        failed: {
          $sum: {
            $cond: [{ $eq: ['$status', 'failed'] }, 1, 0],
          },
        },
        trusted: {
          $sum: {
            $cond: [{ $eq: ['$status', 'trusted'] }, 1, 0],
          },
        },
        banned: {
          $sum: {
            $cond: [{ $eq: ['$status', 'banned'] }, 1, 0],
          },
        },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ];
  const dailyStats = await col.aggregate(pipeline).toArray();
  const totalsPipeline = [
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ];
  const totalsDocs = await col.aggregate(totalsPipeline).toArray();
  const totals = totalsDocs.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});
  return {
    totals,
    dailyStats,
  };
}

async function getLeaderboard(limit = 25) {
  const col = await collection();
  const docs = await col
    .find({ status: { $in: ['verified', 'trusted'] } })
    .sort({ verifiedAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map((doc) => ({
    userId: doc.userId,
    username: doc.username,
    badgeEmoji: doc.badgeEmoji || '🛡️',
    badgeName: doc.badgeName || 'Verified Member',
    verifiedAt: doc.verifiedAt,
    trustedSource: doc.trustedSource,
  }));
}

async function listIpHashes() {
  const col = await collection();
  const pipeline = [
    { $unwind: '$ipHashes' },
    {
      $group: {
        _id: '$ipHashes',
        uniqueAccounts: { $addToSet: '$userId' },
        attempts: { $sum: 1 },
      },
    },
    {
      $project: {
        hash: '$_id',
        attempts: 1,
        uniqueUsers: { $size: '$uniqueAccounts' },
        _id: 0,
      },
    },
    { $sort: { attempts: -1 } },
  ];
  return col.aggregate(pipeline).toArray();
}

module.exports = {
  createTokenDocument,
  findToken,
  findLatestByUser,
  updateToken,
  markVerified,
  incrementFailure,
  getMetrics,
  getLeaderboard,
  listIpHashes,
};
