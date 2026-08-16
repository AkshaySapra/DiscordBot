import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
} from 'discord.js';
import { getSarcasticReply } from './sarcasm.js';

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

// Chance to auto-reply when not @mentioned (0.0–1.0)
const AUTO_REPLY_CHANCE = Number(process.env.AUTO_REPLY_CHANCE ?? 0.25);
// Minimum seconds between auto-replies in the same channel
const COOLDOWN_SECONDS = Number(process.env.COOLDOWN_SECONDS ?? 20);

const lastReplyAt = new Map();

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
  console.log('Sarcastic auto-replies are on. No ngrok needed for this mode.');
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.content?.trim()) return;

    const mentioned =
      message.mentions.has(client.user) || message.channel.isDMBased();

    if (!mentioned) {
      if (Math.random() > AUTO_REPLY_CHANCE) return;

      const key = message.channelId;
      const now = Date.now();
      const last = lastReplyAt.get(key) ?? 0;
      if (now - last < COOLDOWN_SECONDS * 1000) return;
      lastReplyAt.set(key, now);
    }

    const reply = getSarcasticReply({ mentioned });
    await message.reply({
      content: reply,
      allowedMentions: { repliedUser: false },
    });
  } catch (err) {
    console.error('Failed to reply:', err);
  }
});

client.login(token);
