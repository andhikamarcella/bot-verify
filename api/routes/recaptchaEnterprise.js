const express = require('express');
const { verifyRecaptchaEnterprise } = require('../lib/recaptchaEnterprise');

const router = express.Router();

function getAuthKey(req) {
  const raw = req.get('authorization') || '';
  const match = raw.match(/^bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

router.post('/recaptcha-enterprise/assess', async (req, res) => {
  try {
    const adminKey = String(process.env.ADMIN_KEY || '').trim();
    const authKey = getAuthKey(req);
    if (!adminKey || authKey !== adminKey) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const { token, action } = req.body || {};
    const result = await verifyRecaptchaEnterprise({
      token: String(token || ''),
      expectedAction: String(action || ''),
      siteKey: String(process.env.RECAPTCHA_ENTERPRISE_SITE_KEY || ''),
      ip: req.ip,
      userAgent: req.get('user-agent') || '',
    });

    res.json({ ok: Boolean(result.ok), score: result.score ?? null, action: result.action ?? null, reason: result.reason ?? null });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'internal-error' });
  }
});

module.exports = router;

