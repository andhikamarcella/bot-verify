const buckets = new Map();

function keyFor(userId, action) {
  return `${userId}:${action}`;
}

function shouldRateLimit(userId, action, cooldownMs) {
  const key = keyFor(userId, action);
  const now = Date.now();
  const expiresAt = buckets.get(key);
  if (expiresAt && expiresAt > now) {
    return true;
  }
  buckets.set(key, now + cooldownMs);
  return false;
}

module.exports = {
  shouldRateLimit,
};
