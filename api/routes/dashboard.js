const express = require('express');
const { getMetrics, listIpHashes } = require('../models/Token');
const { listProfiles } = require('../models/UserProfile');

const router = express.Router();

function ensureAdmin(req, res) {
  const expected = process.env.ADMIN_KEY;
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!expected || token !== expected) {
    res.status(403).json({ ok: false, error: 'forbidden' });
    return false;
  }
  return true;
}

router.get('/dashboard/metrics', async (req, res) => {
  if (!ensureAdmin(req, res)) return;
  try {
    const metrics = await getMetrics();
    const ipHashes = await listIpHashes();
    const profiles = await listProfiles(200);
    res.json({ ok: true, metrics, ipHashes, profiles });
  } catch (error) {
    console.error('Failed to compute metrics', error);
    res.status(500).json({ ok: false, error: 'internal-error' });
  }
});

module.exports = router;
