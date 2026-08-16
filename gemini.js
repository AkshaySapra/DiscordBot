import { GoogleGenAI } from '@google/genai';
import { getSarcasticReply } from './sarcasm.js';

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

const SYSTEM_PROMPT = `You are a sarcastic Discord bot. Reply in 1-2 short sentences.
Be witty and dry, not cruel. No slurs, hate, or sexual content involving minors.
Do not claim to know personal facts about the user.
Do not mention being an AI unless they ask.
If a referenced/older message is provided, respond to THAT content (as directed by the user).
Reply with only the roast text — no quotes or prefixes.`;

let ai = null;
if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

export function geminiEnabled() {
  return Boolean(ai);
}

function cleanText(text) {
  return String(text || '')
    .replace(/<@!?\d+>/g, '')
    .trim()
    .slice(0, 500);
}

/**
 * Generate a sarcastic reply for a Discord message.
 * Sends only: current message text, optional replied-to message, display name.
 * Does not use personal Gemini memory or full channel history.
 */
export async function generateSarcasticReply(
  messageText,
  {
    mentioned = false,
    displayName = 'someone',
    referencedText = null,
    referencedAuthor = null,
  } = {}
) {
  const cleaned = cleanText(messageText);

  if (!ai) {
    return getSarcasticReply({ mentioned });
  }

  let context = mentioned
    ? `${displayName} mentioned you and said: "${cleaned || '(just a ping)'}"`
    : `${displayName} said: "${cleaned}"`;

  if (referencedText) {
    const refClean = cleanText(referencedText);
    const who = referencedAuthor || 'someone';
    context += `\nThey used Discord reply on this earlier message from ${who}: "${refClean}"`;
    context += `\nFocus your response on that earlier message, following their instruction.`;
  }

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
