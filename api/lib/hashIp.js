// Hash IP utility with salted SHA-256 hashing.
const crypto = require('crypto');

function hashIp(ip) {
  if (!ip) return null;
  const salt = process.env.ADMIN_KEY || 'default-admin-salt';
  const hashed = crypto
    .createHash('sha256')
    .update(`${ip}|${salt}`)
    .digest('hex');
  return hashed;
}

module.exports = { hashIp };
