async function verifyTurnstile(token, secret, ip) {
  if (!token || !secret) {
    console.error('[Turnstile] Missing token or secret');
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secret);
    formData.append('response', token);
    if (ip) {
      formData.append('remoteip', ip);
    }

    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });
    
    const data = await result.json();

    if (!data.success) {
      console.warn('[Turnstile] Verification failed:', data['error-codes']);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Turnstile] Verification error:', error.message);
    return false;
  }
}

module.exports = {
  verifyTurnstile,
};
