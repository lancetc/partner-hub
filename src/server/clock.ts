import "server-only";
import type { Db } from "./db";

/*
  Injectable clock. Tests pass explicit instants. The demo build can move the clock forward
  from the admin screen so a 30 day path can be walked through; this setting is labelled
  as a prototype control and would not exist in production.
*/

export function demoOffsetMs(db: Db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'demo_clock_offset_ms'").get() as { value: string } | undefined;
  return row ? Number(row.value) : 0;
}

export function now(db: Db) {
  return new Date(Date.now() + demoOffsetMs(db));
}

export function setDemoOffset(db: Db, ms: number) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('demo_clock_offset_ms', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(ms));
}
