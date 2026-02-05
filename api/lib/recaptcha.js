async function verifyRecaptcha(token, secret, ip) {
  if (!token) {
    return { ok: false, reason: 'missing-token' };
  }
  if (!secret || String(secret).trim() === '') {
    return { ok: false, reason: 'missing-secret' };
  }

  const body = new URLSearchParams({
    secret: String(secret).trim(),
    response: String(token).trim(),
  });
  if (ip && ip !== '0.0.0.0') {
    body.append('remoteip', String(ip));
  }

  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, reason: `http-${res.status}` };
  }
  if (!json || typeof json !== 'object') {
    return { ok: false, reason: 'invalid-response' };
  }
  if (json.success !== true) {
    const codes = Array.isArray(json['error-codes']) ? json['error-codes'].join(',') : '';
    return { ok: false, reason: codes ? `failed:${codes}` : 'failed' };
  }

  return { ok: true };
}

module.exports = {
  verifyRecaptcha,
};
