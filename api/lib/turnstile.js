async function verifyTurnstile(token, secret, ip) {
  if (!token) {
    console.error('[Turnstile] Missing response token');
    return false;
  }

  if (!secret) {
    console.error('[Turnstile] Missing secret key');
    return false;
  }

  try {
    const body = new URLSearchParams({
      secret: secret,
      response: token,
    });

    if (ip) {
      body.append('remoteip', ip);
    }

    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      }
    );

    if (!res.ok) {
      console.error('[Turnstile] HTTP error:', res.status);
      return false;
    }

    const data = await res.json();

    if (!data.success) {
      console.warn('[Turnstile] Verification failed', {
        errors: data['error-codes'],
        hostname: data.hostname,
        action: data.action,
        cdata: data.cdata,
      });
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Turnstile] Exception:', err);
    return false;
  }
}

module.exports = { verifyTurnstile };
