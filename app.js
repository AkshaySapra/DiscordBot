import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
} from 'discord.js';
import { generateSarcasticReply, geminiEnabled } from './gemini.js';
import { isRoastWorthy } from './roastWorthy.js';

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

if (!process.env.GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY missing — using canned sarcasm fallbacks only.');
}

// Cooldown for unsolicited (non-mention) Gemini roasts in a channel
const COOLDOWN_SECONDS = Number(process.env.COOLDOWN_SECONDS ?? 45);

const lastUnsolicitedReplyAt = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  console.log(
    geminiEnabled()
      ? 'Gemini sarcasm on (mention-first; roast-worthy messages may get unsolicited replies).'
      : 'Canned sarcasm only (add GEMINI_API_KEY for Gemini).'
  );
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.content?.trim()) return;

    const mentioned =
      message.mentions.has(client.user) || message.channel.isDMBased();

    // Default: stay quiet unless @mentioned / DM, OR the message looks roast-worthy
    if (!mentioned) {
      if (!isRoastWorthy(message.content)) return;

      const key = message.channelId;
      const now = Date.now();
      const last = lastUnsolicitedReplyAt.get(key) ?? 0;
      if (now - last < COOLDOWN_SECONDS * 1000) return;
      lastUnsolicitedReplyAt.set(key, now);
    }

    // Strip the bot mention from what we send to Gemini
    let textForModel = message.content;
    if (client.user) {
      textForModel = textForModel
        .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
        .trim();
    }

    await message.channel.sendTyping();

    const reply = await generateSarcasticReply(textForModel, {
      mentioned,
      displayName: message.member?.displayName || message.author.username,
    });

    await message.reply({
      content: reply,
      allowedMentions: { repliedUser: false },
    });
  } catch (err) {
    console.error('Failed to reply:', err);
  }
});

client.login(token);
