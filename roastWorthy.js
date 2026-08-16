/**
 * Local filter so we only call Gemini for non-mentions when a message
 * looks opinionated / roast-worthy. Boring chatter stays private + free.
 */

const OPINION_MARKERS =
  /\b(actually|literally|honestly|basically|obviously|clearly|everyone knows|nobody|hate|love|best|worst|mid|trash|goat|overrated|underrated|i think|i feel|in my opinion|imo|imho|trust me|hot take|unpopular opinion|no cap|fr\b|lowkey|highkey)\b/i;

const FLEX_OR_DRAMA =
  /\b(i'?m better|you'?re wrong|deal with it|cope|seethe|skill issue|ez|lmao gottem|ratio)\b/i;

export function isRoastWorthy(content) {
  const text = String(content || '').trim();
  if (text.length < 12) return false;
  if (text.length > 280) return true; // long monologue → fair game

  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length >= 8 && letters === letters.toUpperCase()) return true; // ALL CAPS

  if (OPINION_MARKERS.test(text)) return true;
  if (FLEX_OR_DRAMA.test(text)) return true;
  if (/[!?]{2,}/.test(text)) return true;
  if ((text.match(/!/g) || []).length >= 2) return true;

  // Strong take ending with a period and some length
  if (text.length >= 40 && /[.!]$/.test(text) && /\b(is|are|was|were|should|need to|have to)\b/i.test(text)) {
    return true;
  }

  return false;
}
