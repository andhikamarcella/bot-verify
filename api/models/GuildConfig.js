const { connectMongo } = require('../lib/db');

const COLLECTION_NAME = 'guild_configs';

const DEFAULT_CONFIG = {
  guildId: null,
  logsChannelId: null,
  reminderEnabled: true,
  reminderDelayMinutes: 10,
  minAccountAgeDays: 7,
  autoNickname: false,
  nicknameTemplate: '{{username}}',
  mediaRestrictionEnabled: false,
  allowedChannels: [],
  forbiddenNamePatterns: [],
  trustedGuilds: [],
  panelMessageId: null,
  panelChannelId: null,
  settingsUpdatedAt: null,
};

async function getCollection() {
  const db = await connectMongo();
  return db.collection(COLLECTION_NAME);
}

function mergeConfig(doc, guildId) {
  const base = { ...DEFAULT_CONFIG, guildId };
  if (!doc) {
    return base;
  }
  return {
    ...base,
    ...doc,
    guildId,
  };
}

async function getGuildConfig(guildId) {
  const collection = await getCollection();
  const doc = await collection.findOne({ guildId });
  if (!doc) {
    await collection.updateOne(
      { guildId },
      { $setOnInsert: { ...DEFAULT_CONFIG, guildId, settingsUpdatedAt: new Date() } },
      { upsert: true }
    );
    return mergeConfig(DEFAULT_CONFIG, guildId);
  }
  return mergeConfig(doc, guildId);
}

async function updateGuildConfig(guildId, updates) {
  const collection = await getCollection();
  const payload = {
    ...updates,
    settingsUpdatedAt: new Date(),
  };
  await collection.updateOne(
    { guildId },
    {
      $set: payload,
      $setOnInsert: { ...DEFAULT_CONFIG, guildId },
    },
    { upsert: true }
  );
  const doc = await collection.findOne({ guildId });
  return mergeConfig(doc, guildId);
}

module.exports = {
  getGuildConfig,
  updateGuildConfig,
  DEFAULT_CONFIG,
};
