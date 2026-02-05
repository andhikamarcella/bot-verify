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

  // Validate token format (Turnstile tokens are typically long base64 strings)
  if (token.length < 100) {
    console.error('[Turnstile] Token seems too short:', token.length);
    return false;
  }

  console.log('[Turnstile] Verifying token', {
    tokenLength: token.length,
    tokenPrefix: token.substring(0, 20) + '...',
    hasSecret: !!secret,
    ip: ip || 'not provided',
    timestamp: new Date().toISOString()
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
      challenge_ts: data.challenge_ts,
    });

    if (!data.success) {
      const errorCodes = data['error-codes'] || [];
      console.error('[Turnstile] Verification failed with errors:', errorCodes);
      console.error('[Turnstile] Full response:', JSON.stringify(data, null, 2));
      
      // Log specific error messages
      if (errorCodes.includes('invalid-input-secret')) {
        console.error('[Turnstile] ERROR: Secret key is invalid! Please check TURNSTILE_SECRET_KEY in environment variables.');
        console.error('[Turnstile] Expected format: 0x4AAAAAACLgWogcgJIr77XDr6fY5XQR4aQ');
      }
      if (errorCodes.includes('invalid-input-response')) {
        console.error('[Turnstile] ERROR: Token is invalid or expired');
      }
      if (errorCodes.includes('timeout-or-duplicate')) {
        console.error('[Turnstile] ERROR: Token was already used or expired');
      }
      if (errorCodes.includes('internal-error')) {
        console.error('[Turnstile] ERROR: Cloudflare internal error');
      }
      
      return false;
    }

    console.log('[Turnstile] ✅ Verification successful!');
    return true;
  } catch (err) {
    console.error('[Turnstile] Exception:', err);
    console.error('[Turnstile] Error stack:', err.stack);
    return false;
  }
}

module.exports = { verifyTurnstile };
