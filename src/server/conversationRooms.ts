import "server-only";
import { randomInt } from "node:crypto";
import { deckFor, shuffled, themes, type ThemeId } from "@/content/conversations";
import type { Db } from "./db";
import { HttpError, userById, type User } from "./auth";

/*
  Care Conversations team sessions. A facilitator hosts a session and gets a short room code; everyone
  who opens the code sees the same card, and the host moves the group through the deck (next, back,
  flip). People talk it over out loud: nothing they say is collected or scored. Sessions end when the
  host ends them, or after 12 hours.
*/

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0 or 1: easy to read out
const CODE_LENGTH = 6;
const LIFETIME_MS = 12 * 3600_000;

type Row = {
  code: string;
  host_id: string;
  theme: ThemeId | "all";
  seed: number;
  position: number;
  flipped: number;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
};

const validTheme = (t: unknown): t is ThemeId | "all" => t === "all" || themes.some((x) => x.id === t);

export function cleanCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
}

function newCode(db: Db) {
  for (let tries = 0; tries < 20; tries++) {
    const code = Array.from({ length: CODE_LENGTH }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join("");
    if (!db.prepare("SELECT 1 FROM conversation_rooms WHERE code = ?").get(code)) return code;
  }
  throw new HttpError(503, "Couldn’t make a room code. Try again.");
}

function rowOf(db: Db, code: string, now: Date) {
  const r = db.prepare("SELECT * FROM conversation_rooms WHERE code = ?").get(cleanCode(code)) as Row | undefined;
  if (!r) throw new HttpError(404, "There’s no session with that code. Check it with the person hosting.");
  if (r.ended_at || now.getTime() - Date.parse(r.created_at) > LIFETIME_MS) throw new HttpError(410, "That session has finished.");
  return r;
}

/** What everyone in the room sees: the current card, whether it's flipped, and where they are in the deck. */
function view(db: Db, r: Row, viewer: User) {
  const order = shuffled(deckFor(r.theme), r.seed);
  const card = order[Math.min(r.position, order.length - 1)];
  return {
    code: r.code,
    theme: r.theme,
    host: userById(db, r.host_id)?.name ?? "The host",
    youHost: r.host_id === viewer.id,
    cardId: card.id,
    position: r.position,
    total: order.length,
    flipped: r.flipped === 1,
    updatedAt: r.updated_at,
  };
}

export type RoomView = ReturnType<typeof view>;

export function hostRoom(db: Db, actor: User, input: { theme?: unknown }, now: Date) {
  const theme = validTheme(input.theme) ? input.theme : "all";
  const code = newCode(db);
  const at = now.toISOString();
  db.prepare("INSERT INTO conversation_rooms (code, host_id, theme, seed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    code,
    actor.id,
    theme,
    randomInt(1, 2 ** 31 - 1),
    at,
    at,
  );
  return view(db, rowOf(db, code, now), actor);
}

export function roomView(db: Db, viewer: User, code: string, now: Date) {
  return view(db, rowOf(db, code, now), viewer);
}

/** The host moves the group on: next card, back one, flip, or end the session. */
export function moveRoom(db: Db, actor: User, code: string, action: unknown, now: Date) {
  const r = rowOf(db, code, now);
  if (r.host_id !== actor.id) throw new HttpError(403, "Only the person hosting can change the card.");
  const total = deckFor(r.theme).length;
  const at = now.toISOString();
  if (action === "next" || action === "back") {
    const position = Math.max(0, Math.min(total - 1, r.position + (action === "next" ? 1 : -1)));
    db.prepare("UPDATE conversation_rooms SET position = ?, flipped = 0, updated_at = ? WHERE code = ?").run(position, at, r.code);
  } else if (action === "flip") {
    db.prepare("UPDATE conversation_rooms SET flipped = 1 - flipped, updated_at = ? WHERE code = ?").run(at, r.code);
  } else if (action === "end") {
    db.prepare("UPDATE conversation_rooms SET ended_at = ?, updated_at = ? WHERE code = ?").run(at, at, r.code);
    return { ended: true as const };
  } else throw new HttpError(400, "Unknown action.");
  return view(db, rowOf(db, r.code, now), actor);
}
