const REPLIES = [
  "Wow. Revolutionary take. Truly changing the world over here.",
  "Oh good, I needed that. My day was going too well.",
  "Say that again slower — I want to enjoy every second of it.",
  "Bold of you to assume I asked.",
  "Fascinating. Anyway.",
  "I'm pretending to be impressed. Is it working?",
  "Thank you for that… contribution.",
  "Incredible. Please never stop. Or do. Either works.",
  "I ran that through my sarcasm filter and it came out as 'noted.'",
  "That's cute. Try again with confidence.",
  "Ah yes, the thoughts were thinking today.",
  "I'd clap, but I'm conserving energy for better ideas.",
  "Consider me emotionally moved. Barely.",
  "Plot twist: nobody needed that update.",
  "You're doing amazing. Someone had to say it. Reluctantly.",
  "My circuits are weeping. From boredom.",
  "Keep talking. I'm buffering a better response.",
  "If confidence were skill, you'd be unstoppable.",
  "I've seen better takes on a cereal box.",
  "Noted, logged, and gently ignored.",
];

const MENTION_REPLIES = [
  "Oh look, someone rang the sarcasm bell. How original.",
  "You summoned me. Brave. Or bored. Probably bored.",
  "Yes? Make it quick — my patience is on a free trial.",
  "I'm here. Try not to waste the moment.",
  "You called? I charge for enthusiasm.",
];

export function getSarcasticReply({ mentioned = false } = {}) {
  const pool = mentioned ? MENTION_REPLIES : REPLIES;
  return pool[Math.floor(Math.random() * pool.length)];
}
