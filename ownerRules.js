import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_PATH = path.join(__dirname, 'owner-rules.json');

function ownerIds() {
  return new Set(
    String(process.env.OWNER_USER_ID || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function isOwner(userId) {
  const ids = ownerIds();
  if (!ids.size) return false;
  return ids.has(String(userId));
}

function readStore() {
  try {
    if (!fs.existsSync(RULES_PATH)) return { rules: [] };
    const raw = fs.readFileSync(RULES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      rules: Array.isArray(parsed.rules)
        ? parsed.rules.map((r) => String(r).trim()).filter(Boolean)
        : [],
    };
  } catch {
    return { rules: [] };
  }
}

function writeStore(store) {
  fs.writeFileSync(RULES_PATH, JSON.stringify(store, null, 2), 'utf8');
}

export function getOwnerRules() {
  return readStore().rules;
}

export function addOwnerRule(rule) {
  const cleaned = String(rule || '').trim().slice(0, 300);
  if (!cleaned) return { ok: false, message: 'Empty rule.' };
  const store = readStore();
  if (store.rules.some((r) => r.toLowerCase() === cleaned.toLowerCase())) {
    return { ok: false, message: 'That rule is already saved.' };
  }
  if (store.rules.length >= 25) {
    return { ok: false, message: 'Rule limit hit (25). Forget some first.' };
  }
  store.rules.push(cleaned);
  writeStore(store);
  return { ok: true, message: `Saved: ${cleaned}`, rules: store.rules };
}

export function clearOwnerRules() {
  writeStore({ rules: [] });
  return { ok: true, message: 'Cleared all owner rules.' };
}

export function removeOwnerRule(matchText) {
  const needle = String(matchText || '').trim().toLowerCase();
  if (!needle) return { ok: false, message: 'Say what to forget.' };
  const store = readStore();
  const next = store.rules.filter((r) => !r.toLowerCase().includes(needle));
  if (next.length === store.rules.length) {
    return { ok: false, message: `No rule matched “${matchText.trim()}”.` };
  }
  const removed = store.rules.length - next.length;
  store.rules = next;
  writeStore(store);
  return {
    ok: true,
    message: `Removed ${removed} rule(s) matching “${matchText.trim()}”.`,
    rules: store.rules,
  };
}

/**
 * Handle owner-only management commands inside an @bot message.
 * Returns a reply string if handled, otherwise null.
 */
export function handleOwnerCommand(userId, messageText) {
  if (!isOwner(userId)) return null;

  const text = String(messageText || '')
    .replace(/<@!?\d+>/g, '')
    .trim();

  if (/^(list\s+rules|show\s+rules|rules)\s*$/i.test(text)) {
    const rules = getOwnerRules();
    if (!rules.length) return 'No owner rules saved yet.';
    return `Owner rules:\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
  }

  if (/^(clear\s+rules|forget\s+all|forget\s+rules)\s*$/i.test(text)) {
    return clearOwnerRules().message;
  }

  const remember = text.match(/^remember(?:\s*:|\s+)\s*(.+)$/i);
  if (remember) {
    return addOwnerRule(remember[1]).message;
  }

  const forget = text.match(/^forget(?:\s*:|\s+)\s*(.+)$/i);
  if (forget) {
    return removeOwnerRule(forget[1]).message;
  }

  return null;
}
