const express = require('express');
const { aggregateTotals, aggregateDaily, aggregateIpHashes } = require('../models/VerificationLog');

const router = express.Router();

router.get('/dashboard/metrics', async (req, res) => {
  const auth = req.header('authorization') || '';
  const expected = process.env.ADMIN_KEY ? `Bearer ${process.env.ADMIN_KEY}` : '';
  if (!process.env.ADMIN_KEY || auth !== expected) {
    return res.status(403).json({ ok: false, error: 'unauthorized' });
  }

  try {
    const totals = await aggregateTotals();
    const graphData = await aggregateDaily();
    const ipHashLogs = await aggregateIpHashes();

    res.json({
      ok: true,
      totalVerified: totals.VERIFIED || 0,
      totalFailed: totals.FAILED || 0,
      totalBanned: totals.BANNED || 0,
      graphData,
      ipHashLogs,
    });
  } catch (error) {
    console.error('dashboard metrics error', error);
    res.status(500).json({ ok: false, error: 'metrics-failed' });
  }
});

module.exports = router;
