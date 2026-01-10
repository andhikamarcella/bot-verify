const { connectMongo } = require('../lib/db');

const COLLECTION_NAME = 'verificationHistory';

async function getCollection() {
  const db = await connectMongo();
  return db.collection(COLLECTION_NAME);
}

async function insertHistoryEntry(entry) {
  const collection = await getCollection();
  await collection.insertOne({
    userId: entry.userId,
    guildId: entry.guildId,
    status: entry.status,
    riskScore: entry.riskScore ?? null,
    country: entry.country || null,
    reason: entry.reason || null,
    metadata: entry.metadata || {},
    createdAt: entry.createdAt || new Date(),
  });
}

async function getHistoryForUser(userId, guildId, limit = 10) {
  const collection = await getCollection();
  return collection
    .find({ userId, guildId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

async function clearHistoryForUser(userId, guildId) {
  const collection = await getCollection();
  await collection.deleteMany({ userId, guildId });
}

module.exports = {
  insertHistoryEntry,
  getHistoryForUser,
  clearHistoryForUser,
};
