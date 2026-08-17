import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
} from 'discord.js';
import cron from 'node-cron';
import { generateSarcasticReply, geminiEnabled } from './gemini.js';
import { isRoastWorthy } from './roastWorthy.js';
import { runDailyDigest, resolveGuild } from './dailyJob.js';
import { detectTone } from './tone.js';
import { handleOwnerCommand } from './ownerRules.js';
import { handleGameCommand } from './games.js';
import {
  getRecentReplies,
  rememberReply,
  isUserOnCooldown,
  markUserReplied,
  isTooSimilarToRecent,
  isBoringInput,
} from './replyMemory.js';

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

if (!process.env.GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY missing — using canned sarcasm fallbacks only.');
}

const COOLDOWN_SECONDS = Number(process.env.COOLDOWN_SECONDS ?? 45);
const USER_COOLDOWN_SECONDS = Number(process.env.USER_COOLDOWN_SECONDS ?? 120);
const DAILY_CRON = (process.env.DAILY_CRON || '0 12 * * *').trim();
const DAILY_TZ = process.env.DAILY_TZ || 'America/New_York';
const RUNDAILY_COOLDOWN_SECONDS = Number(
  process.env.RUNDAILY_COOLDOWN_SECONDS ?? 1800
);

const lastUnsolicitedReplyAt = new Map();
let lastDailyKey = null;
let lastManualDailyAt = 0;

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
        const guild = await resolveGuild(client);
        await runDailyDigest(client, { guild });
      } catch (err) {
        console.error('Scheduled daily digest failed:', err.message || err);
      }
    },
    { timezone: DAILY_TZ }
  );

  console.log(`Daily in-channel roasts scheduled: "${DAILY_CRON}" (${DAILY_TZ})`);
  if (!process.env.DAILY_CHANNEL_ID) {
    console.log('DAILY_CHANNEL_ID not set — QOTD poll disabled (roasts still run).');
  }
}

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  console.log(
    geminiEnabled()
      ? 'Gemini on — SKIP boring, anti-repeat, per-user cooldown, mini-games.'
      : 'Canned sarcasm only (add GEMINI_API_KEY for Gemini).'
  );
  if (process.env.OWNER_USER_ID) {
    console.log('Owner rules enabled for configured OWNER_USER_ID.');
  } else {
    console.log('OWNER_USER_ID not set — standing owner instructions disabled.');
  }
  scheduleDailyJob();
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.content?.trim()) return;

    const mentioned =
      message.mentions.has(client.user) || message.channel.isDMBased();

    if (mentioned && /\brundaily\b/i.test(message.content)) {
      const now = Date.now();
      const waitMs = RUNDAILY_COOLDOWN_SECONDS * 1000 - (now - lastManualDailyAt);
      if (waitMs > 0) {
        const mins = Math.ceil(waitMs / 60000);
        await message.reply({
          content: `Easy tiger — rundaily is on cooldown (${mins} min left).`,
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      await message.reply({
        content:
          'On it — hunting roast-worthy messages and replying in those channels…',
        allowedMentions: { repliedUser: false },
      });

      try {
        lastManualDailyAt = Date.now();
        const guild = await resolveGuild(client, message.guild);
        const result = await runDailyDigest(client, { guild, force: true });
        await message.reply({
          content:
            `Done. Roasted ${result.roasted} message(s)` +
            (result.qotdPosted ? ' and dropped a QOTD poll.' : '.'),
          allowedMentions: { repliedUser: false },
        });
      } catch (err) {
        await message.reply({
          content: `Daily job failed: ${err.message}`,
          allowedMentions: { repliedUser: false },
        });
      }
      return;
    }

    if (mentioned) {
      const ownerReply = handleOwnerCommand(message.author.id, message.content);
      if (ownerReply) {
        await message.reply({
          content: ownerReply,
          allowedMentions: { repliedUser: false },
        });
        return;
      }

      const game = await handleGameCommand(message, client.user.id);
      if (game) {
        await message.channel.sendTyping();
        await message.reply({
          content: game.content,
          poll: game.poll,
          allowedMentions: { repliedUser: false, users: [] },
        });
        if (game.content) rememberReply(game.content);
        return;
      }
    }

    if (!mentioned) {
      if (isBoringInput(message.content)) return;
      if (!isRoastWorthy(message.content)) return;
      if (isUserOnCooldown(message.author.id, USER_COOLDOWN_SECONDS)) return;

      const key = message.channelId;
      const now = Date.now();
      const last = lastUnsolicitedReplyAt.get(key) ?? 0;
      if (now - last < COOLDOWN_SECONDS * 1000) return;
      lastUnsolicitedReplyAt.set(key, now);
    }

    let textForModel = message.content;
    if (client.user) {
      textForModel = textForModel
        .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
        .trim();
    }

    const tone = mentioned ? detectTone(textForModel) : 'sarcastic';
    const recent = getRecentReplies(3);

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

    let reply = await generateSarcasticReply(textForModel, {
      mentioned,
      displayName: message.member?.displayName || message.author.username,
      referencedText,
      referencedAuthor,
      tone,
      recentReplies: recent,
      allowSkip: !mentioned,
    });

    // Mentions always get something; unsolicited can stay quiet
    if (!reply) {
      if (!mentioned) return;
      reply = await generateSarcasticReply(textForModel, {
        mentioned: true,
        displayName: message.member?.displayName || message.author.username,
        referencedText,
        referencedAuthor,
        tone,
        recentReplies: recent,
        allowSkip: false,
      });
    }

    if (reply && isTooSimilarToRecent(reply, recent)) {
      if (!mentioned) return;
      reply = await generateSarcasticReply(
        `${textForModel}\n(Please make a clearly different joke than before.)`,
        {
          mentioned: true,
          displayName: message.member?.displayName || message.author.username,
          referencedText,
          referencedAuthor,
          tone,
          recentReplies: recent,
          allowSkip: false,
        }
      );
      if (reply && isTooSimilarToRecent(reply, recent)) {
        // last resort: still send for mentions
      } else if (!reply) {
        return;
      }
    }

    if (!reply) return;

    await message.reply({
      content: reply,
      allowedMentions: { repliedUser: false },
    });
    rememberReply(reply);
    if (!mentioned) markUserReplied(message.author.id);
  } catch (err) {
    console.error('Failed to reply:', err);
  }
});

client.login(token);
