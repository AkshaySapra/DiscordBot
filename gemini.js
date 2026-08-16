import { GoogleGenAI } from '@google/genai';
import { getSarcasticReply } from './sarcasm.js';

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

const SYSTEM_PROMPT = `You are a sarcastic Discord bot. Reply in 1-2 short sentences.
Be witty and dry, not cruel. No slurs, hate, or sexual content involving minors.
Do not claim to know personal facts about the user.
Do not mention being an AI unless they ask.
Reply with only the roast text — no quotes or prefixes.`;

let ai = null;
if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

export function geminiEnabled() {
  return Boolean(ai);
}

/**
 * Generate a sarcastic reply for a Discord message.
 * Only sends the message text (+ optional display name) — nothing from personal Gemini memory.
 */
export async function generateSarcasticReply(messageText, { mentioned = false, displayName = 'someone' } = {}) {
  const cleaned = String(messageText || '')
    .replace(/<@!?\d+>/g, '')
    .trim()
    .slice(0, 500);

  if (!ai) {
    return getSarcasticReply({ mentioned });
  }

  const context = mentioned
    ? `${displayName} mentioned you and said: "${cleaned || '(just a ping)'}"`
    : `${displayName} said: "${cleaned}"`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: `${SYSTEM_PROMPT}\n\n${context}`,
    });

    const text = (response.text || '').trim();
    if (!text) return getSarcasticReply({ mentioned });
    return text.slice(0, 400);
  } catch (err) {
    console.error('Gemini error, using fallback line:', err.message || err);
    return getSarcasticReply({ mentioned });
  }
}
