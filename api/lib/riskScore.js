function computeRiskScore({
  accountAgeDays = 0,
  blacklisted = false,
  suspectReasons = [],
  failedAttempts = 0,
}) {
  let score = 0;
  if (blacklisted) {
    score += 80;
  }
  if (accountAgeDays < 7) {
    score += 30;
  } else if (accountAgeDays < 14) {
    score += 15;
  }
  if (suspectReasons.length > 0) {
    score += Math.min(30, suspectReasons.length * 10);
  }
  if (failedAttempts > 2) {
    score += 10;
  }
  return Math.min(score, 100);
}

function describeRisk(score) {
  if (score >= 61) {
    return { label: 'HIGH', emoji: '🔴', text: 'High Risk' };
  }
  if (score >= 31) {
    return { label: 'MEDIUM', emoji: '🟡', text: 'Medium Risk' };
  }
  return { label: 'LOW', emoji: '🟢', text: 'Trusted' };
}

module.exports = {
  computeRiskScore,
  describeRisk,
};
