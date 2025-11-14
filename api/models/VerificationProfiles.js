const { connectMongo } = require('../lib/db');

const COLLECTION_NAME = 'verificationProfiles';

async function getCollection() {
  const db = await connectMongo();
  return db.collection(COLLECTION_NAME);
}

async function getVerificationProfile(userId, guildId) {
  const collection = await getCollection();
  return collection.findOne({ userId, guildId });
}

async function upsertVerificationProfile(data) {
  const collection = await getCollection();
  const filter = { userId: data.userId, guildId: data.guildId };
  const update = {
    $set: {
      userId: data.userId,
      guildId: data.guildId,
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
  return getVerificationProfile(data.userId, data.guildId);
}

async function setRiskScore(userId, guildId, riskScore) {
  const collection = await getCollection();
  await collection.updateOne(
    { userId, guildId },
    {
      $set: {
        riskScore,
        lastUpdatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

async function appendSuspectReason(userId, guildId, reason) {
  const collection = await getCollection();
  await collection.updateOne(
    { userId, guildId },
    {
      $setOnInsert: {
        userId,
        guildId,
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
