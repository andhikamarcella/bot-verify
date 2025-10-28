const crypto = require('crypto');

function hashIp(ip) {
  if (!ip) return null;
  const salt = process.env.ADMIN_KEY || '';
  return crypto.createHash('sha256').update(`${ip}${salt}`).digest('hex');
}

module.exports = {
  hashIp,
};
