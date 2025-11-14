const { connectMongo } = require('../lib/db');

const COLLECTION_NAME = 'blacklistedUsers';

async function getCollection() {
  const db = await connectMongo();
  return db.collection(COLLECTION_NAME);
}

async function getBlacklistEntry(userId, guildId) {
  const collection = await getCollection();
  return collection.findOne({
    userId,
    $or: [
      { scope: 'global' },
      { scope: 'guild', guildId },
      { scope: { $exists: false }, guildId },
    ],
  });
}

async function isBlacklisted(userId, guildId) {
  const collection = await getCollection();
  const doc = await collection.findOne({
    userId,
    $or: [
      { scope: 'global' },
      { scope: 'guild', guildId },
      { scope: { $exists: false }, guildId },
    ],
  });
  return Boolean(doc);
}

async function addToBlacklist({ userId, guildId, reason, addedBy, scope = 'guild' }) {
  const collection = await getCollection();
  const normalizedScope = scope === 'global' ? 'global' : 'guild';
  await collection.updateOne(
    {
      userId,
      scope: normalizedScope,
      guildId: normalizedScope === 'guild' ? guildId : null,
    },
    {
      $set: {
        userId,
        guildId: normalizedScope === 'guild' ? guildId : null,
        reason: reason || 'unspecified',
        addedBy: addedBy || null,
        scope: normalizedScope,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
  return getBlacklistEntry(userId, guildId);
}

async function removeFromBlacklist(userId, guildId, scope = 'guild') {
  const collection = await getCollection();
  if (scope === 'global') {
    await collection.deleteMany({ userId, scope: 'global' });
    return;
  }
  if (scope === 'all') {
    await collection.deleteMany({ userId });
    return;
  }
  await collection.deleteMany({
    userId,
    $or: [
      { scope: 'guild', guildId },
      { scope: { $exists: false }, guildId },
    ],
  });
}

async function listBlacklisted(guildId, page = 1, pageSize = 20) {
  const collection = await getCollection();
  const skip = Math.max(page - 1, 0) * pageSize;
  const cursor = collection
    .find({
      $or: [
        { scope: 'global' },
        { scope: 'guild', guildId },
        { scope: { $exists: false }, guildId },
      ],
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageSize);
  const items = await cursor.toArray();
  const total = await collection.countDocuments({
    $or: [
      { scope: 'global' },
      { scope: 'guild', guildId },
      { scope: { $exists: false }, guildId },
    ],
  });
  return { items, total, page, pageSize };
}

module.exports = {
  getBlacklistEntry,
  isBlacklisted,
  addToBlacklist,
  removeFromBlacklist,
  listBlacklisted,
};
