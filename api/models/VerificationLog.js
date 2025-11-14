const { connectMongo } = require('../lib/db');

const COLLECTION_NAME = 'verification_logs';

async function getCollection() {
  const db = await connectMongo();
  return db.collection(COLLECTION_NAME);
}

async function insertLog(entry) {
  const collection = await getCollection();
  await collection.insertOne({
    userId: entry.userId,
    guildId: entry.guildId,
    ipHash: entry.ipHash || null,
    result: entry.result,
    reason: entry.reason || null,
    createdAt: entry.createdAt || new Date(),
  });
}

async function aggregateTotals() {
  const collection = await getCollection();
  const docs = await collection
    .aggregate([
      {
        $group: {
          _id: '$result',
          count: { $sum: 1 },
        },
      },
    ])
    .toArray();
  const totals = { VERIFIED: 0, FAILED: 0, BANNED: 0 };
  for (const doc of docs) {
    totals[doc._id] = doc.count;
  }
  return totals;
}

async function aggregateDaily(days = 14) {
  const collection = await getCollection();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const pipeline = [
    {
      $match: {
        createdAt: { $gte: start },
      },
    },
    {
      $project: {
        day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        result: 1,
      },
    },
    {
      $group: {
        _id: '$day',
        verifiedCount: {
          $sum: { $cond: [{ $eq: ['$result', 'VERIFIED'] }, 1, 0] },
        },
        failedCount: {
          $sum: { $cond: [{ $eq: ['$result', 'FAILED'] }, 1, 0] },
        },
        bannedCount: {
          $sum: { $cond: [{ $eq: ['$result', 'BANNED'] }, 1, 0] },
        },
      },
    },
    { $sort: { _id: 1 } },
  ];
  return collection.aggregate(pipeline).toArray();
}

async function aggregateIpHashes() {
  const collection = await getCollection();
  const pipeline = [
    { $match: { ipHash: { $ne: null } } },
    {
      $group: {
        _id: '$ipHash',
        userIds: { $addToSet: '$userId' },
        count: { $sum: 1 },
        lastAt: { $max: '$createdAt' },
      },
    },
    {
      $project: {
        ipHash: '$_id',
        userIds: 1,
        count: 1,
        lastAt: 1,
        _id: 0,
      },
    },
    { $sort: { count: -1 } },
  ];
  return collection.aggregate(pipeline).toArray();
}

module.exports = {
  insertLog,
  aggregateTotals,
  aggregateDaily,
  aggregateIpHashes,
};
