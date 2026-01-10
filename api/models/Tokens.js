const { connectMongo } = require('../lib/db');

const COLLECTION_NAME = 'tokens';

async function getCollection() {
  const db = await connectMongo();
  return db.collection(COLLECTION_NAME);
}

async function createTokenDocument(doc) {
  const collection = await getCollection();
  const payload = {
    token: doc.token,
    userId: doc.userId,
    guildId: doc.guildId,
    roleId: doc.roleId,
    status: doc.status || 'PENDING',
    extraRolesEligible: doc.extraRolesEligible || [],
    createdAt: doc.createdAt || new Date(),
    verifiedAt: doc.verifiedAt || null,
    dmChannelId: doc.dmChannelId || null,
    dmMessageId: doc.dmMessageId || null,
    boundIp: null, // Initial bound IP is null
  };
  await collection.insertOne(payload);
  return payload;
}

async function findToken(token) {
  const collection = await getCollection();
  return collection.findOne({ token });
}

async function findLatestByUser(userId, guildId) {
  const collection = await getCollection();
  const query = { userId };
  if (guildId) {
    query.guildId = guildId;
  }
  return collection.find(query).sort({ createdAt: -1 }).limit(1).next();
}

async function setTokenStatus(token, status, fields = {}) {
  const collection = await getCollection();
  const update = {
    status,
    ...fields,
  };
  if (status === 'VERIFIED' && !update.verifiedAt) {
    update.verifiedAt = new Date();
  }
  await collection.updateOne({ token }, { $set: update });
  return findToken(token);
}

async function bindIpToToken(token, ip) {
  const collection = await getCollection();
  await collection.updateOne({ token }, { $set: { boundIp: ip } });
}

async function listRecentVerified(limit = 50) {
  const collection = await getCollection();
  return collection
    .find({ status: 'VERIFIED' })
    .sort({ verifiedAt: -1 })
    .limit(limit)
    .toArray();
}

async function listDmMessagesForUser(userId, guildId, limit = 25) {
  const collection = await getCollection();
  return collection
    .find({
      userId,
      guildId,
      dmChannelId: { $ne: null },
      dmMessageId: { $ne: null },
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

module.exports = {
  createTokenDocument,
  findToken,
  findLatestByUser,
  setTokenStatus,
  listRecentVerified,
  bindIpToToken,
  listDmMessagesForUser,
};
