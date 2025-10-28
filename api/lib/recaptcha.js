async function verifyRecaptcha(token, secret) {
  if (!token || !secret) {
    return false;
  }
  // TODO: Implement actual verification call to Google reCAPTCHA API.
  return true;
}

module.exports = {
  verifyRecaptcha,
};
