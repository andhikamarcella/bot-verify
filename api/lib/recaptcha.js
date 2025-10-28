// Google reCAPTCHA v2 verification helper using dynamic import of node-fetch.
const RECAPTCHA_ENDPOINT = 'https://www.google.com/recaptcha/api/siteverify';

async function verifyRecaptcha(responseToken, remoteIp) {
  if (!responseToken) {
    return { success: false, reason: 'missing-response' };
  }
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    console.warn('RECAPTCHA_SECRET_KEY missing. Treating captcha as failed.');
    return { success: false, reason: 'missing-secret' };
  }
  const fetch = (await import('node-fetch')).default;
  const params = new URLSearchParams();
  params.append('secret', secret);
  params.append('response', responseToken);
  if (remoteIp) params.append('remoteip', remoteIp);

  try {
    const res = await fetch(RECAPTCHA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const data = await res.json();
    if (data.success) {
      return { success: true };
    }
    return {
      success: false,
      reason: data['error-codes']?.[0] || 'verification-failed',
      raw: data,
    };
  } catch (error) {
    console.error('Failed to verify reCAPTCHA', error);
    return { success: false, reason: 'network-error' };
  }
}

module.exports = { verifyRecaptcha };
