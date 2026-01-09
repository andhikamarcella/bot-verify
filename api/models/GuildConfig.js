const { connectMongo } = require('../lib/db');

// Keep the collection name aligned with the legacy schema (`verifybot.guildConfigs`).
const COLLECTION_NAME = 'guildConfigs';

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
  maintenanceMode: false,
  maintenanceReason: "System upgrade in progress",
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

function normalizeGuildId(guildId) {
  if (!guildId) {
    throw new Error('guildId is required for guild config operations');
  }
  return String(guildId);
}

async function getGuildConfig(guildId) {
  const guildKey = normalizeGuildId(guildId);
  const collection = await getCollection();
  const doc = await collection.findOne({ guildId: guildKey });
  if (!doc) {
    await collection.updateOne(
      { guildId: guildKey },
      { $setOnInsert: { ...DEFAULT_CONFIG, guildId: guildKey, settingsUpdatedAt: new Date() } },
      { upsert: true }
    );
    return mergeConfig(DEFAULT_CONFIG, guildKey);
  }
  return mergeConfig(doc, guildKey);
}

async function updateGuildConfig(guildId, updates) {
  const guildKey = normalizeGuildId(guildId);
  const collection = await getCollection();

  const sanitized = {};
  for (const [key, value] of Object.entries(updates || {})) {
    if (typeof key !== 'string' || key.includes('.')) {
      throw new Error(`Invalid guild config path: ${key}`);
    }
    if (typeof value === 'undefined') {
      continue;
    }

    if (key === 'allowedChannels' && Array.isArray(value)) {
      sanitized[key] = value.map((channelId) => String(channelId));
      continue;
    }

    if (key === 'forbiddenNamePatterns' && Array.isArray(value)) {
      sanitized[key] = value.map((pattern) => String(pattern));
      continue;
    }

    sanitized[key] = value;
  }

  const existing = (await collection.findOne({ guildId: guildKey })) || {};
  const base = { ...DEFAULT_CONFIG, ...existing, guildId: guildKey };
  const merged = { ...base, ...sanitized };

  if (Object.prototype.hasOwnProperty.call(sanitized, 'dmReminderEnabled')) {
    merged.reminderEnabled = sanitized.dmReminderEnabled;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'dmReminderDelayMinutes')) {
    merged.reminderDelayMinutes = sanitized.dmReminderDelayMinutes;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'reminderEnabled')) {
    merged.dmReminderEnabled = sanitized.reminderEnabled;
  }
  if (Object.prototype.hasOwnProperty.call(sanitized, 'reminderDelayMinutes')) {
    merged.dmReminderDelayMinutes = sanitized.reminderDelayMinutes;
  }

  merged.settingsUpdatedAt = new Date();

  await collection.replaceOne(
    { guildId: guildKey },
    merged,
    { upsert: true }
  );

  return mergeConfig(merged, guildKey);
}

module.exports = {
  getGuildConfig,
  updateGuildConfig,
  DEFAULT_CONFIG,
};
