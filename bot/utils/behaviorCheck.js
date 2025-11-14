function analyzeFirstMessageBehavior(content) {
  const tooManyMentions = (content.match(/<@/g) || []).length >= 3;
  const hasSketchyLink = /(bit\.ly|tinyurl\.com|discord\.gift)/i.test(content);
  const isCapsSpam = content.length > 20 && content === content.toUpperCase();

  if (tooManyMentions) {
    return { suspicious: true, reason: 'mass-mention' };
  }
  if (hasSketchyLink) {
    return { suspicious: true, reason: 'suspicious link' };
  }
  if (isCapsSpam) {
    return { suspicious: true, reason: 'caps spam' };
  }
  return { suspicious: false };
}

module.exports = {
  analyzeFirstMessageBehavior,
};
