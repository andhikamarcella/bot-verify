function sanitizeEnvString(value) {
  return String(value || '')
    .trim()
    .replace(/^[`"']+/, '')
    .replace(/[`"']+$/, '')
    .trim();
}

function parseScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

async function verifyRecaptchaEnterprise({ token, expectedAction, siteKey, ip, userAgent }) {
  const projectId = sanitizeEnvString(process.env.RECAPTCHA_ENTERPRISE_PROJECT_ID);
  const apiKey = sanitizeEnvString(process.env.RECAPTCHA_ENTERPRISE_API_KEY);
  const configuredSiteKey = sanitizeEnvString(process.env.RECAPTCHA_ENTERPRISE_SITE_KEY);

  if (!token) {
    return { ok: false, reason: 'missing-token' };
  }
  if (!projectId || !apiKey) {
    return { ok: false, reason: 'recaptcha-enterprise-not-configured' };
  }

  const action = sanitizeEnvString(expectedAction) || 'LOGIN';
  const effectiveSiteKey = sanitizeEnvString(siteKey) || configuredSiteKey;
  if (!effectiveSiteKey) {
    return { ok: false, reason: 'missing-site-key' };
  }

  const minScore = parseScore(process.env.RECAPTCHA_ENTERPRISE_MIN_SCORE) ?? 0.5;
  const url = `https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/assessments?key=${encodeURIComponent(apiKey)}`;

  const body = {
    event: {
      token,
      expectedAction: action,
      siteKey: effectiveSiteKey,
    },
  };
  if (ip && ip !== '0.0.0.0') {
    body.event.userIpAddress = String(ip);
  }
  if (userAgent) {
    body.event.userAgent = String(userAgent).slice(0, 256);
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error?.message || `http-${res.status}`;
    return { ok: false, reason: `recaptcha-enterprise-http:${msg}` };
  }

  const tokenProps = json?.tokenProperties;
  const risk = json?.riskAnalysis;
  const valid = Boolean(tokenProps?.valid);
  const actionMatched = String(tokenProps?.action || '') === action;
  const score = Number(risk?.score);

  if (!valid) {
    const reason = tokenProps?.invalidReason ? `invalid:${tokenProps.invalidReason}` : 'invalid';
    return { ok: false, reason };
  }
  if (!actionMatched) {
    return { ok: false, reason: 'action-mismatch' };
  }
  if (!Number.isFinite(score)) {
    return { ok: false, reason: 'missing-score' };
  }
  if (score < minScore) {
    return { ok: false, reason: `low-score:${score}` };
  }

  return { ok: true, score, action };
}

module.exports = {
  verifyRecaptchaEnterprise,
};

