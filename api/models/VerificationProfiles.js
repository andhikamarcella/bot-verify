const { connectMongo } = require('../lib/db');

const COLLECTION_NAME = 'verificationProfiles';

function resolveIds(data) {
  const guildRaw = data.guildId || data.guildID;
  const userRaw = data.userId || data.userID;
  const guildID = guildRaw ? String(guildRaw) : null;
  const userID = userRaw ? String(userRaw) : null;
  if (!guildID || !userID) {
    throw new Error('Missing guildId or userId for verification profile operation');
  }
  return { guildID, userID };
}

async function getCollection() {
  const db = await connectMongo();
  return db.collection(COLLECTION_NAME);
}

async function getVerificationProfile(userId, guildId) {
  const collection = await getCollection();
  const userKey = userId ? String(userId) : null;
  const guildKey = guildId ? String(guildId) : null;
  if (!userKey || !guildKey) {
    return null;
  }
  return collection.findOne({
    $or: [
      { userId: userKey, guildId: guildKey },
      { userID: userKey, guildID: guildKey },
    ],
  });
}

async function upsertVerificationProfile(data) {
  const collection = await getCollection();
  const { guildID, userID } = resolveIds(data);
  const filter = { guildID, userID };
  const update = {
    $set: {
      guildID,
      userID,
      userId: userID,
      guildId: guildID,
      accountCreatedAt: data.accountCreatedAt || null,
      isSuspect: Boolean(data.isSuspect),
      suspectReasons: data.suspectReasons || [],
      riskScore: data.riskScore ?? null,
      lastSeenAt: new Date(),
      country: data.country || null,
    },
    $inc: {
      attempts: data.incrementAttempts ? 1 : 0,
    },
  };
  if (!data.incrementAttempts) {
    delete update.$inc;
  }
  await collection.updateOne(filter, update, { upsert: true });
  return getVerificationProfile(userID, guildID);
}

async function setRiskScore(userId, guildId, riskScore) {
  const collection = await getCollection();
  const { guildID, userID } = resolveIds({ guildId, userId });
  await collection.updateOne(
    { guildID, userID },
    {
      $set: {
        guildID,
        userID,
        userId: userID,
        guildId: guildID,
        riskScore,
        lastUpdatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

async function appendSuspectReason(userId, guildId, reason) {
  const collection = await getCollection();
  const { guildID, userID } = resolveIds({ guildId, userId });
  await collection.updateOne(
    { guildID, userID },
    {
      $setOnInsert: {
        guildID,
        userID,
        userId: userID,
        guildId: guildID,
      },
      $addToSet: {
        suspectReasons: reason,
      },
      $set: {
        isSuspect: true,
        lastUpdatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

module.exports = {
  getVerificationProfile,
  upsertVerificationProfile,
  setRiskScore,
  appendSuspectReason,
};
