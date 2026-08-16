import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  PermissionFlagsBits,
} from 'discord.js';
import cron from 'node-cron';
import { generateSarcasticReply, geminiEnabled } from './gemini.js';
import { isRoastWorthy } from './roastWorthy.js';
import { runDailyDigest } from './dailyJob.js';

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
const DAILY_CRON = process.env.DAILY_CRON || '0 12 * * *'; // noon daily
const DAILY_TZ = process.env.DAILY_TZ || 'America/New_York';

const lastUnsolicitedReplyAt = new Map();
let lastDailyKey = null;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

function scheduleDailyJob() {
  if (!process.env.DAILY_CHANNEL_ID) {
    console.log('DAILY_CHANNEL_ID not set — daily roast/QOTD disabled.');
    return;
  }

  if (!cron.validate(DAILY_CRON)) {
    console.error(`Invalid DAILY_CRON "${DAILY_CRON}" — daily job not scheduled.`);
    return;
  }

  cron.schedule(
    DAILY_CRON,
    async () => {
      const key = new Date().toLocaleDateString('en-CA', { timeZone: DAILY_TZ });
      if (lastDailyKey === key) return;
      lastDailyKey = key;
      try {
        await runDailyDigest(client);
      } catch (err) {
        console.error('Scheduled daily digest failed:', err.message || err);
      }
    },
    { timezone: DAILY_TZ }
  );

  console.log(`Daily roast/QOTD scheduled: "${DAILY_CRON}" (${DAILY_TZ})`);
}

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  console.log(
    geminiEnabled()
      ? 'Gemini sarcasm on (mention-first; roast-worthy messages may get unsolicited replies).'
      : 'Canned sarcasm only (add GEMINI_API_KEY for Gemini).'
  );
  scheduleDailyJob();
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.content?.trim()) return;

    const mentioned =
      message.mentions.has(client.user) || message.channel.isDMBased();

    // Manual test: @bot rundaily (Manage Server / Admin only)
    if (mentioned && /\brundaily\b/i.test(message.content)) {
      const member = message.member;
      const allowed =
        message.channel.isDMBased() ||
        member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
        member?.permissions?.has(PermissionFlagsBits.Administrator);
      if (!allowed) {
        await message.reply({
          content: 'Nice try. Only server managers can run the daily job.',
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      await message.reply({
        content: 'On it — scanning recent chat…',
        allowedMentions: { repliedUser: false },
      });
      try {
        await runDailyDigest(client, { force: true });
      } catch (err) {
        await message.reply({
          content: `Daily job failed: ${err.message}`,
          allowedMentions: { repliedUser: false },
        });
      }
      return;
    }

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

    // If the user Discord-replied to another message, include that message as context
    let referencedText = null;
    let referencedAuthor = null;
    if (message.reference?.messageId) {
      try {
        const ref = await message.fetchReference();
        referencedText = ref.content || null;
        referencedAuthor =
          ref.member?.displayName || ref.author?.username || null;
      } catch (err) {
        console.warn('Could not fetch replied-to message:', err.message || err);
      }
    }

    await message.channel.sendTyping();

    const reply = await generateSarcasticReply(textForModel, {
      mentioned,
      displayName: message.member?.displayName || message.author.username,
      referencedText,
      referencedAuthor,
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
