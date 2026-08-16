import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { generateDailyRoast, generateQuestionOfTheDay } from './gemini.js';

function excludedChannelIds() {
  return new Set(
    String(process.env.DAILY_EXCLUDE_CHANNELS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

async function collectRecentMessages(guild, botUserId) {
  const perChannel = Number(process.env.DAILY_MESSAGES_PER_CHANNEL ?? 12);
  const maxTotal = Number(process.env.DAILY_MAX_MESSAGES ?? 60);
  const exclude = excludedChannelIds();
  const dailyChannelId = process.env.DAILY_CHANNEL_ID;
  if (dailyChannelId) exclude.add(dailyChannelId);

  const lines = [];
  const channels = [...guild.channels.cache.values()].filter(
    (ch) =>
      ch.type === ChannelType.GuildText &&
      ch.viewable &&
      !exclude.has(ch.id)
  );

  for (const channel of channels) {
    const perms = channel.permissionsFor(guild.members.me);
    if (!perms?.has(PermissionFlagsBits.ReadMessageHistory)) continue;
    if (!perms?.has(PermissionFlagsBits.ViewChannel)) continue;

    try {
      const messages = await channel.messages.fetch({ limit: perChannel });
      for (const msg of messages.values()) {
        if (msg.author.id === botUserId || msg.author.bot) continue;
        if (!msg.content?.trim()) continue;
        const who = msg.member?.displayName || msg.author.username;
        lines.push(
          `#${channel.name} | ${who}: ${msg.content.replace(/\s+/g, ' ').slice(0, 180)}`
        );
        if (lines.length >= maxTotal) return lines;
      }
    } catch {
      // Missing access / rate limit on this channel — skip
    }
  }

  return lines;
}

/**
 * Scan recent messages across the guild, post one roast + QOTD poll.
 */
export async function runDailyDigest(client, { force = false } = {}) {
  const channelId = process.env.DAILY_CHANNEL_ID;
  if (!channelId) {
    throw new Error('Set DAILY_CHANNEL_ID in .env to enable the daily digest.');
  }

  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error('DAILY_CHANNEL_ID is not a text channel.');
  }

  const guild = channel.guild;
  if (!guild) throw new Error('Daily channel must be in a server.');

  console.log(`Running daily digest for guild ${guild.name}...`);

  const lines = await collectRecentMessages(guild, client.user.id);
  const roast = await generateDailyRoast(lines);
  const qotd = await generateQuestionOfTheDay();

  await channel.send({
    content: `🔥 **Daily roast** (${lines.length} recent messages scanned)\n${roast}`,
    allowedMentions: { parse: [] },
  });

  await channel.send({
    content: '📊 **Question of the Day**',
    poll: {
      question: { text: qotd.question },
      answers: qotd.options.map((text) => ({ text })),
      duration: 24,
      allowMultiselect: false,
    },
    allowedMentions: { parse: [] },
  });

  console.log(
    force
      ? 'Daily digest posted (manual).'
      : 'Daily digest posted (scheduled).'
  );
}
