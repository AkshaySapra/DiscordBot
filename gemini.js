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

/**
 * One sarcastic digest from a batch of recent channel messages.
 */
export async function generateDailyRoast(messageLines) {
  if (!ai) {
    return "I'd roast today's chat, but my brain is offline. Check GEMINI_API_KEY.";
  }

  const transcript = messageLines.slice(0, 80).join('\n').slice(0, 8000);
  const prompt = `You are a sarcastic Discord bot writing a once-a-day roast of recent server chat.
Write 1 short paragraph (3-6 sentences) calling out funny patterns, hot takes, or chaos.
Be witty, not cruel. No slurs or hate. Don't invent messages that aren't listed.
Don't name-drop in a bullying way — keep it light.
Reply with only the roast paragraph.

Recent messages:
${transcript || '(no messages found)'}`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
    });
    const text = (response.text || '').trim();
    return text.slice(0, 1800) || "Today's chat was so boring I got nothing. Impressive.";
  } catch (err) {
    console.error('Gemini daily roast error:', err.message || err);
    return "Daily roast failed. The chat wins today.";
  }
}

/**
 * Question of the day + poll options as JSON.
 */
export async function generateQuestionOfTheDay() {
  const fallback = {
    question: 'What energy is the server on today?',
    options: ['Chaotic', 'Sleepy', 'Petty', 'Surprisingly normal'],
  };

  if (!ai) return fallback;

  const prompt = `Create one fun Discord "question of the day" for a friend group server.
Return ONLY valid JSON with this shape:
{"question":"string under 120 chars","options":["opt1","opt2","opt3","opt4"]}
Options must be short (under 50 chars each), 3 to 4 options.
Keep it playful and SFW. No politics, no NSFW.`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
    });
    const raw = (response.text || '').trim();
    const jsonText = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(jsonText);
    if (!parsed.question || !Array.isArray(parsed.options) || parsed.options.length < 2) {
      return fallback;
    }
    return {
      question: String(parsed.question).slice(0, 300),
      options: parsed.options.map((o) => String(o).slice(0, 55)).slice(0, 4),
    };
  } catch (err) {
    console.error('Gemini QOTD error:', err.message || err);
    return fallback;
  }
}
