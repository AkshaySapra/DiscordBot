import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { generateSarcasticReply, generateQuestionOfTheDay } from './gemini.js';
import { isRoastWorthy } from './roastWorthy.js';

const roastedMessageIds = new Set();

function excludedChannelIds() {
  return new Set(
    String(process.env.DAILY_EXCLUDE_CHANNELS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pull recent human messages that look roast-worthy (actual Message objects).
 */
async function collectRoastTargets(guild, botUserId) {
  const perChannel = Number(process.env.DAILY_MESSAGES_PER_CHANNEL ?? 15);
  const maxScan = Number(process.env.DAILY_MAX_MESSAGES ?? 80);
  const exclude = excludedChannelIds();
  const dailyChannelId = process.env.DAILY_CHANNEL_ID;
  if (dailyChannelId) exclude.add(dailyChannelId);

  const targets = [];
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
    if (!perms?.has(PermissionFlagsBits.SendMessages)) continue;

    try {
      const messages = await channel.messages.fetch({ limit: perChannel });
      for (const msg of messages.values()) {
        if (msg.author.id === botUserId || msg.author.bot) continue;
        if (!msg.content?.trim()) continue;
        if (roastedMessageIds.has(msg.id)) continue;
        if (!isRoastWorthy(msg.content)) continue;
        targets.push(msg);
        if (targets.length >= maxScan) return targets;
      }
    } catch {
      // Missing access — skip channel
    }
  }

  // Prefer fresher messages
  targets.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
  return targets;
}

async function postQuestionOfTheDay(client) {
  const channelId = process.env.DAILY_CHANNEL_ID;
  if (!channelId) return false;

  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased()) return false;

  const qotd = await generateQuestionOfTheDay();
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
  return true;
}

/**
 * Roast roast-worthy messages in their own channels (not one dump post).
 * Optionally posts QOTD poll in DAILY_CHANNEL_ID.
 */
export async function runDailyDigest(client, { guild, force = false } = {}) {
  if (!guild) {
    throw new Error('No server found to scan.');
  }

  const limit = Number(process.env.DAILY_ROAST_LIMIT ?? 5);
  console.log(`Running in-channel daily roasts for ${guild.name}...`);

  const targets = await collectRoastTargets(guild, client.user.id);
  const picked = targets.slice(0, limit);
  let roasted = 0;

  for (const msg of picked) {
    try {
      const who = msg.member?.displayName || msg.author.username;
      const roast = await generateSarcasticReply(msg.content, {
        mentioned: false,
        displayName: who,
      });
      await msg.reply({
        content: roast,
        allowedMentions: { repliedUser: false },
      });
      roastedMessageIds.add(msg.id);
      roasted += 1;
      await sleep(1200);
    } catch (err) {
      console.warn(
        `Failed to roast message ${msg.id} in #${msg.channel?.name}:`,
        err.message || err
      );
    }
  }

  let qotdPosted = false;
  try {
    qotdPosted = await postQuestionOfTheDay(client);
  } catch (err) {
    console.warn('QOTD poll failed:', err.message || err);
  }

  console.log(
    `${force ? 'Manual' : 'Scheduled'} daily run: roasted ${roasted}/${picked.length} messages` +
      (qotdPosted ? ', QOTD posted' : '')
  );

  return { roasted, candidates: targets.length, qotdPosted };
}

export async function resolveGuild(client, preferredGuild = null) {
  if (preferredGuild) return preferredGuild;

  if (process.env.GUILD_ID) {
    return client.guilds.fetch(process.env.GUILD_ID);
  }

  if (process.env.DAILY_CHANNEL_ID) {
    const channel = await client.channels.fetch(process.env.DAILY_CHANNEL_ID);
    if (channel?.guild) return channel.guild;
  }

  const first = client.guilds.cache.first();
  if (first) return first;

  throw new Error('Bot is not in any servers.');
}
