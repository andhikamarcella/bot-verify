async function verifyTurnstile(token, secret, ip) {
  if (!token) {
    console.error('[Turnstile] Missing response token');
    return false;
  }

  if (!secret) {
    console.error('[Turnstile] Missing secret key');
    return false;
  }

  if (!secret || secret.trim() === '') {
    console.error('[Turnstile] Secret key is empty');
    return false;
  }

  console.log('[Turnstile] Verifying token', {
    tokenLength: token.length,
    tokenPrefix: token.substring(0, 20) + '...',
    hasSecret: !!secret,
    secretPrefix: secret.substring(0, 10) + '...',
    ip: ip || 'not provided'
  });

  try {
    const body = new URLSearchParams({
      secret: secret,
      response: token,
    });

    // Only add IP if it's valid (not 0.0.0.0 or empty)
    if (ip && ip !== '0.0.0.0' && ip.trim() !== '') {
      body.append('remoteip', ip);
      console.log('[Turnstile] Adding IP to verification', ip);
    } else {
      console.log('[Turnstile] Skipping IP (invalid or not provided)');
    }

    console.log('[Turnstile] Sending verification request to Cloudflare');

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
      console.error('[Turnstile] HTTP error:', res.status, res.statusText);
      const errorText = await res.text();
      console.error('[Turnstile] Error response:', errorText);
      return false;
    }

    const data = await res.json();

    console.log('[Turnstile] Cloudflare response:', {
      success: data.success,
      errors: data['error-codes'],
      hostname: data.hostname,
      action: data.action,
    });

    if (!data.success) {
      console.warn('[Turnstile] Verification failed', {
        errors: data['error-codes'],
        hostname: data.hostname,
        action: data.action,
        cdata: data.cdata,
      });
      return false;
    }

    console.log('[Turnstile] Verification successful');
    return true;
  } catch (err) {
    console.error('[Turnstile] Exception:', err);
    console.error('[Turnstile] Error stack:', err.stack);
    return false;
  }
}

module.exports = { verifyTurnstile };
