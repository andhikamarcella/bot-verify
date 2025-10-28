// Simple heuristics to mark first-time messages that look suspicious.
const SUSPECT_PATTERNS = [/http(s?):\/\//i, /discord\.gg/i];

function analyzeMessage(content) {
  if (!content) return { suspicious: false, reasons: [] };
  const trimmed = content.trim();
  const reasons = [];
  const mentionCount = (trimmed.match(/<@/g) || []).length;
  const uppercaseRatio = trimmed.replace(/[^A-Z]/g, '').length / Math.max(trimmed.length, 1);

  if (mentionCount >= 3) {
    reasons.push('too-many-mentions');
  }

  if (uppercaseRatio > 0.7 && trimmed.length > 12) {
    reasons.push('shouting');
  }

  if (SUSPECT_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    reasons.push('link-detected');
  }

  if (trimmed.length < 4) {
    reasons.push('too-short');
  }

  return {
    suspicious: reasons.length > 0,
    reasons,
  };
}

module.exports = {
  analyzeMessage,
};
