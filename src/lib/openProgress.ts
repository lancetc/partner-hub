/*
  Progress on a public learning path, kept only on the visitor's device: which topics they've
  finished, and which of the hub's anonymous counts this device has already sent. Sending each
  count once per device stops one phone being counted twice; nothing identifies the person.
*/

type Saved = { done: string[]; counted: string[]; opened: boolean; finished: boolean };

const key = (token: string) => `tc-open:${token}`;
const EMPTY: Saved = { done: [], counted: [], opened: false, finished: false };

export function readOpen(token: string): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(key(token)) ?? "null") as Partial<Saved> | null;
    if (!s) return EMPTY;
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    return { done: list(s.done), counted: list(s.counted), opened: Boolean(s.opened), finished: Boolean(s.finished) };
  } catch {
    // Private browsing or storage switched off: the path still works, it just won't remember.
    return EMPTY;
  }
}

function write(token: string, s: Saved) {
  try {
    localStorage.setItem(key(token), JSON.stringify(s));
  } catch {
    // As above: nothing to keep it in.
  }
}

async function count(token: string, kind: "opened" | "topic" | "path", slug?: string) {
  try {
    const r = await fetch(`/api/open/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, slug }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
  Sends any counts this device hasn't sent yet: that it opened the path, each finished topic, and
  the whole path once every topic is done. Safe to call often; a count that fails is tried next time.
*/
export function syncOpen(token: string, topics: string[]) {
  // One at a time per link, so two calls close together can't both send the same count.
  const next = (running.get(token) ?? Promise.resolve()).then(() => sync(token, topics));
  running.set(
    token,
    next.catch(() => {}),
  );
  return next;
}

const running = new Map<string, Promise<unknown>>();

async function sync(token: string, topics: string[]) {
  const s = readOpen(token);
  if (!s.opened && (await count(token, "opened"))) s.opened = true;
  for (const slug of s.done.filter((d) => topics.includes(d) && !s.counted.includes(d))) {
    if (await count(token, "topic", slug)) s.counted.push(slug);
  }
  const all = topics.length > 0 && topics.every((t) => s.done.includes(t));
  if (all && !s.finished && (await count(token, "path"))) s.finished = true;
  write(token, s);
  return s;
}

/** A topic finished on this device: remember it, then send the counts. */
export async function finishOpenTopic(token: string, slug: string, topics: string[]) {
  const s = readOpen(token);
  if (!s.done.includes(slug)) write(token, { ...s, done: [...s.done, slug] });
  return syncOpen(token, topics);
}
