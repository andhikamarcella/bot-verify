const express = require('express');
const { getVerifiedUsers } = require('../models/Users');

const router = express.Router();

router.get('/leaderboard', async (_req, res) => {
  try {
    const users = await getVerifiedUsers(50);
    res.json({ ok: true, users });
  } catch (error) {
    console.error('leaderboard error', error);
    res.status(500).json({ ok: false, error: 'leaderboard-failed' });
  }
});

module.exports = router;
