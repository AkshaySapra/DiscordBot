const recentReplies = [];
const lastUserReplyAt = new Map();

const MAX_RECENT = Number(process.env.RECENT_REPLY_MEMORY ?? 5);

export function getRecentReplies(limit = 3) {
  return recentReplies.slice(-limit);
}

export function rememberReply(text) {
  const cleaned = String(text || '').trim();
  if (!cleaned) return;
  recentReplies.push(cleaned);
  while (recentReplies.length > MAX_RECENT) recentReplies.shift();
}

export function isUserOnCooldown(userId, cooldownSeconds) {
  const last = lastUserReplyAt.get(String(userId)) ?? 0;
  return Date.now() - last < cooldownSeconds * 1000;
}

export function markUserReplied(userId) {
  lastUserReplyAt.set(String(userId), Date.now());
}

/** Rough overlap check — true if too similar to a recent bot line. */
export function isTooSimilarToRecent(text, recent = getRecentReplies(3)) {
  const words = tokenize(text);
  if (words.size < 3 || !recent.length) return false;

  for (const prev of recent) {
    const prevWords = tokenize(prev);
    if (prevWords.size < 3) continue;
    let overlap = 0;
    for (const w of words) {
      if (prevWords.has(w)) overlap += 1;
    }
    const ratio = overlap / Math.min(words.size, prevWords.size);
    if (ratio >= 0.65) return true;
  }
  return false;
}

function tokenize(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

export function isBoringInput(text) {
  const t = String(text || '').trim().toLowerCase();
  if (t.length < 3) return true;
  if (
    /^(ok+|k+|lol+|lmao+|haha+|nice+|cool+|same|true|real|fr+|yea+|yeah+|yep+|nah+|nope+|omg+|bruh+|bet+|facts?)$/i.test(
      t
    )
  ) {
    return true;
  }
  // emoji / punctuation only
  if (/^[\p{Extended_Pictographic}\p{Emoji_Component}\s!.?]+$/u.test(t)) return true;
  return false;
}
