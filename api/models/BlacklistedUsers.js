const { connectMongo } = require('../lib/db');

const COLLECTION_NAME = 'blacklistedUsers';

async function getCollection() {
  const db = await connectMongo();
  return db.collection(COLLECTION_NAME);
}

async function getBlacklistEntry(userId, guildId) {
  const collection = await getCollection();
  return collection.findOne({ userId, guildId });
}

async function isBlacklisted(userId, guildId) {
  const collection = await getCollection();
  const doc = await collection.findOne({ userId, guildId });
  return Boolean(doc);
}

async function addToBlacklist({ userId, guildId, reason, addedBy }) {
  const collection = await getCollection();
  await collection.updateOne(
    { userId, guildId },
    {
      $set: {
        userId,
        guildId,
        reason: reason || 'unspecified',
        addedBy: addedBy || null,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
  return getBlacklistEntry(userId, guildId);
}

async function removeFromBlacklist(userId, guildId) {
  const collection = await getCollection();
  await collection.deleteOne({ userId, guildId });
}

async function listBlacklisted(guildId, page = 1, pageSize = 20) {
  const collection = await getCollection();
  const skip = Math.max(page - 1, 0) * pageSize;
  const cursor = collection
    .find({ guildId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageSize);
  const items = await cursor.toArray();
  const total = await collection.countDocuments({ guildId });
  return { items, total, page, pageSize };
}

module.exports = {
  getBlacklistEntry,
  isBlacklisted,
  addToBlacklist,
  removeFromBlacklist,
  listBlacklisted,
};
