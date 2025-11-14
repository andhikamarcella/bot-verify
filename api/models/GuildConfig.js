const { connectMongo } = require('../lib/db');

const COLLECTION_NAME = 'guild_configs';

const DEFAULT_CONFIG = {
  guildId: null,
  logsChannelId: null,
  reminderEnabled: true,
  reminderDelayMinutes: 10,
  dmReminderEnabled: true,
  dmReminderDelayMinutes: 10,
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
  const merged = {
    ...base,
    ...doc,
    guildId,
  };
  if (typeof merged.dmReminderEnabled === 'undefined') {
    merged.dmReminderEnabled = merged.reminderEnabled;
  }
  if (typeof merged.dmReminderDelayMinutes === 'undefined') {
    merged.dmReminderDelayMinutes = merged.reminderDelayMinutes;
  }
  if (typeof merged.reminderEnabled === 'undefined') {
    merged.reminderEnabled = merged.dmReminderEnabled;
  }
  if (typeof merged.reminderDelayMinutes === 'undefined') {
    merged.reminderDelayMinutes = merged.dmReminderDelayMinutes;
  }
  return merged;
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
  if (Object.prototype.hasOwnProperty.call(updates, 'dmReminderEnabled')) {
    payload.reminderEnabled = updates.dmReminderEnabled;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'dmReminderDelayMinutes')) {
    payload.reminderDelayMinutes = updates.dmReminderDelayMinutes;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'reminderEnabled')) {
    payload.dmReminderEnabled = updates.reminderEnabled;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'reminderDelayMinutes')) {
    payload.dmReminderDelayMinutes = updates.reminderDelayMinutes;
  }
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
