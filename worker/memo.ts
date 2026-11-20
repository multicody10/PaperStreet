// Free-plan hot-isolate cache. D1 remains authoritative across isolates/regions.
// Cache only quote rows, public chart points, and leaderboard output, never auth tokens or balances.
type Entry = { value: unknown; expires: number };
const entries = new Map<string, Entry>();
const pending = new Map<string, Promise<unknown>>();
const generations = new Map<string, number>();
const MAX_ENTRIES = 128;

export async function memoized<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = entries.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const waiting = pending.get(key);
  if (waiting) return waiting as Promise<T>;
  const version = generations.get(key) ?? 0;
  const task = load().then(value => {
    if ((generations.get(key) ?? 0) === version) {
      entries.delete(key);
      entries.set(key, { value, expires: Date.now() + ttlMs });
      if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
    }
    return value;
  }).finally(() => { if (pending.get(key) === task) pending.delete(key); });
  pending.set(key, task);
  return task;
}

export function invalidateMemo(prefix: string): void {
  for (const key of new Set([...entries.keys(), ...pending.keys()])) {
    if (!key.startsWith(prefix)) continue;
    entries.delete(key);
    pending.delete(key);
    generations.set(key, (generations.get(key) ?? 0) + 1);
  }
}
