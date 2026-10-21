// "My progress" diary. Everything stays in this browser (localStorage): nothing here is ever sent to a server.
const KEY = "revive-progress-v1";

export function loadEntries() {
  try {
    const a = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(a) ? a.filter((e) => e && e.problem && e.ts) : [];
  } catch {
    return [];
  }
}

function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage full or blocked */ }
  return list;
}

const clampScore = (n) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)));

export function addEntry(list, { problem, before, after, note }) {
  const entry = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    problem, before: clampScore(before), after: clampScore(after), note: String(note || "").slice(0, 200),
  };
  return save([...list, entry].slice(-500));
}

export const removeEntry = (list, id) => save(list.filter((e) => e.id !== id));
export const clearEntries = () => save([]);

// local calendar day, e.g. "2026-10-21"
export const dayKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Days in a row with at least one check-in, counting back from today (or yesterday, so it isn't lost before today's check-in).
export function streakDays(list) {
  const days = new Set(list.map((e) => dayKey(e.ts)));
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) { n += 1; d.setDate(d.getDate() - 1); }
  return n;
}

export const activeDays = (list) => new Set(list.map((e) => dayKey(e.ts))).size;
