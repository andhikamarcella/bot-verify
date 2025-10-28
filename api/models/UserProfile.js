// Store user profile snapshots for admin insights.
const { getCollection } = require('../lib/db');

const COLLECTION = 'user_profiles';

async function upsertUserProfile(profile) {
  const col = await getCollection(COLLECTION);
  const { userId, ...rest } = profile;
  if (!userId) throw new Error('userId is required for profile upsert');
  await col.updateOne(
    { userId },
    {
      $set: {
        ...rest,
        userId,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
}

async function listProfiles(limit = 100) {
  const col = await getCollection(COLLECTION);
  return col
    .find()
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();
}

module.exports = {
  upsertUserProfile,
  listProfiles,
};
