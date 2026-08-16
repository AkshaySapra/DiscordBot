/**
 * Infer reply tone from the triggering message.
 * Default stays sarcastic unless the user asks otherwise.
 */
export function detectTone(text) {
  const t = String(text || '').toLowerCase();

  if (
    /\b(be\s+mean|be\s+harsh|be\s+ruthless|go\s+harder|roast\s+harder|more\s+savage|no\s+mercy)\b/.test(
      t
    )
  ) {
    return 'mean';
  }

  if (
    /\b(be\s+nice|be\s+kind|be\s+sweet|be\s+supportive|be\s+wholesome|be\s+gentle|cheer\s+(me|them)\s+up|say\s+something\s+nice)\b/.test(
      t
    )
  ) {
    return 'nice';
  }

  if (/\b(be\s+neutral|just\s+answer|seriously|no\s+sarcasm|straight\s+answer)\b/.test(t)) {
    return 'neutral';
  }

  return 'sarcastic';
}

export function toneInstruction(tone) {
  switch (tone) {
    case 'nice':
      return 'Tone for THIS reply: warm, kind, and supportive. No roasting.';
    case 'mean':
      return 'Tone for THIS reply: sharper sarcasm and harsher roast, still no slurs/hate.';
    case 'neutral':
      return 'Tone for THIS reply: helpful and plain. Minimal sarcasm.';
    default:
      return 'Tone for THIS reply: default dry sarcasm.';
  }
}
