const { getGuildConfig, updateGuildConfig } = require('../../api/models/GuildConfig');

const cache = new Map();
const CACHE_TTL = 60 * 1000;

function setCache(guildId, config) {
  cache.set(guildId, { config, expires: Date.now() + CACHE_TTL });
}

async function fetchConfig(guildId) {
  const cached = cache.get(guildId);
  if (cached && cached.expires > Date.now()) {
    return cached.config;
  }
  const config = await getGuildConfig(guildId);
  setCache(guildId, config);
  return config;
}

async function updateConfig(guildId, updates) {
  const config = await updateGuildConfig(guildId, updates);
  setCache(guildId, config);
  return config;
}

module.exports = {
  fetchConfig,
  updateConfig,
};
