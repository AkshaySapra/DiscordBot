import { GoogleGenAI } from '@google/genai';
import { getSarcasticReply } from './sarcasm.js';
import { toneInstruction } from './tone.js';
import { getOwnerRules } from './ownerRules.js';

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

const BASE_RULES = `You are a Discord bot. Reply in 1-2 short sentences.
If a referenced/older message is provided, respond to THAT content (as directed by the user).
Owner standing instructions (if any) override default tone when they conflict.
If you cannot make a funny/interesting reply (too boring, nothing to riff on, or you'd just repeat yourself), reply with exactly: SKIP
Do not reuse the same joke structure or opening as the recent bot replies listed below.
Reply with only the response text — no quotes or prefixes.`;

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

function buildSystemPrompt(tone = 'sarcastic', recentReplies = []) {
  const rules = getOwnerRules();
  const ownerBlock = rules.length
    ? `Owner standing instructions (always follow):\n${rules.map((r) => `- ${r}`).join('\n')}`
    : 'Owner standing instructions: none.';

  const recentBlock = recentReplies.length
    ? `Recent bot replies to avoid repeating:\n${recentReplies.map((r) => `- ${r}`).join('\n')}`
    : 'Recent bot replies to avoid repeating: none yet.';

  return `${BASE_RULES}\n${toneInstruction(tone)}\n${ownerBlock}\n${recentBlock}`;
}

function isSkip(text) {
  return /^skip\.?$/i.test(String(text || '').trim());
}

/**
 * Generate a reply. Returns null when the model (or filters) say SKIP.
 */
export async function generateSarcasticReply(
  messageText,
  {
    mentioned = false,
    displayName = 'someone',
    referencedText = null,
    referencedAuthor = null,
    tone = 'sarcastic',
    recentReplies = [],
    allowSkip = true,
  } = {}
) {
  const cleaned = cleanText(messageText);

  if (!ai) {
    if (allowSkip && !mentioned) return null;
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
      contents: `${buildSystemPrompt(tone, recentReplies)}\n\n${context}`,
    });

    const text = (response.text || '').trim();
    if (!text || isSkip(text)) {
      if (allowSkip) return null;
      return getSarcasticReply({ mentioned });
    }
    return text.slice(0, 400);
  } catch (err) {
    console.error('Gemini error, using fallback line:', err.message || err);
    if (allowSkip && !mentioned) return null;
    return getSarcasticReply({ mentioned });
  }
}

export async function generateGameContent(game, payload = {}) {
  if (!ai) {
    if (game === 'wyr') {
      return {
        question: 'Would you rather?',
        optionA: 'Infinite pizza',
        optionB: 'Infinite good Wi‑Fi',
        setup: 'Classic dilemmas only.',
      };
    }
    if (game === 'duel') {
      return `${payload.fighterA} wins by default — my roast engine is offline.`;
    }
    return 'Court is closed (no GEMINI_API_KEY).';
  }

  try {
    if (game === 'duel') {
      const prompt = `You are a sarcastic fight announcer for a Discord roast duel.
Fighter A: ${payload.fighterA}
Fighter B: ${payload.fighterB}
Write 3 short lines: one jab at A, one jab at B, then declare a winner with a punchy reason.
Keep it playful, not cruel. Reply with only those lines.`;
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
      });
      return (response.text || '').trim().slice(0, 500) || 'Draw. Both mid.';
    }

    if (game === 'wyr') {
      const prompt = `Create a fun Discord "Would You Rather" for friends.
Return ONLY JSON:
{"question":"Would you rather...?","optionA":"short","optionB":"short","setup":"optional one-liner"}
Options under 50 chars. Playful, SFW.`;
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
      });
      const raw = (response.text || '').trim();
      const jsonText = raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/, '');
      return JSON.parse(jsonText);
    }

    if (game === 'court') {
      const prompt = `You are a sarcastic judge in "Hot-Take Court".
Defendant: ${payload.author}
Hot take: "${cleanText(payload.take)}"
Give a short ruling (2-4 sentences): verdict (sustained / overruled / mistrial), one joke, one sentence of "reasoning".
Reply with only the ruling.`;
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
      });
      return (response.text || '').trim().slice(0, 700) || 'Mistrial. Take too slippery.';
    }
  } catch (err) {
    console.error('Gemini game error:', err.message || err);
  }

  return 'Game engine hiccuped. Try again.';
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
Be witty, not cruel. Don't invent messages that aren't listed.
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
Options must be short (under 50 chars each), 3 to 4 options.`;

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
