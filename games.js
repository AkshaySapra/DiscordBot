import { generateGameContent } from './gemini.js';

/**
 * Mini-games triggered by @bot …
 * Returns { content, poll? } or null if not a game command.
 */
export async function handleGameCommand(message, botUserId) {
  const raw = String(message.content || '')
    .replace(new RegExp(`<@!?${botUserId}>`, 'g'), '')
    .trim();

  if (/^(games|help games|game help)\b/i.test(raw) || /^help$/i.test(raw)) {
    return {
      content:
        '**Mini games**\n' +
        '• `@bot duel @user` — roast battle, I pick a winner\n' +
        '• `@bot wyr` — Would You Rather (poll)\n' +
        '• `@bot court` — hot-take court (reply to a take, or type it)\n' +
        '• `@bot rundaily` — scan & roast\n' +
        '• `@bot be nice` / `be mean` — tone for that reply',
    };
  }

  const duel = raw.match(/^(duel|roastbattle|battle)\b/i);
  if (duel) {
    const opponent = message.mentions.users.find((u) => u.id !== botUserId);
    if (!opponent) {
      return { content: 'Tag someone to duel. Example: `@bot duel @friend`' };
    }
    if (opponent.bot) {
      return { content: 'I don’t duel bots. Pick a human.' };
    }
    const a = message.member?.displayName || message.author.username;
    const b = message.guild?.members?.cache?.get(opponent.id)?.displayName || opponent.username;
    const verdict = await generateGameContent('duel', {
      fighterA: a,
      fighterB: b,
    });
    return { content: `⚔️ **Roast duel:** ${a} vs ${b}\n${verdict}` };
  }

  if (/^(wyr|would\s+you\s+rather)\b/i.test(raw)) {
    const wyr = await generateGameContent('wyr', {});
    if (wyr?.optionA && wyr?.optionB) {
      return {
        content: `🎲 **Would You Rather**\n${wyr.setup || ''}`.trim(),
        poll: {
          question: { text: (wyr.question || 'Would you rather?').slice(0, 300) },
          answers: [
            { text: String(wyr.optionA).slice(0, 55) },
            { text: String(wyr.optionB).slice(0, 55) },
          ],
          duration: 24,
          allowMultiselect: false,
        },
      };
    }
    return { content: wyr?.text || 'Would-you-rather machine broke. Try again.' };
  }

  if (/^(court|hottake|hot\s*take|judge)\b/i.test(raw)) {
    let take = raw.replace(/^(court|hottake|hot\s*take|judge)\b/i, '').trim();
    let author = message.member?.displayName || message.author.username;

    if (message.reference?.messageId) {
      try {
        const ref = await message.fetchReference();
        take = ref.content || take;
        author = ref.member?.displayName || ref.author?.username || author;
      } catch {
        // ignore
      }
    }

    if (!take) {
      return {
        content:
          'Bring a hot take to court. Reply to a message with `@bot court`, or `@bot court pineapple belongs on pizza`.',
      };
    }

    const ruling = await generateGameContent('court', { take, author });
    return { content: `⚖️ **Hot-Take Court**\n${ruling}` };
  }

  return null;
}
