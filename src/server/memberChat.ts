import "server-only";
import { randomUUID } from "node:crypto";
import {
  chatBrief,
  cleanMemberChat,
  FOLLOWUP_MARK,
  FOLLOWUP_TOKENS,
  MEMBER_CHAT_VERSION,
  REPLY_LENGTHS,
  splitFollowUps,
  type ChatProfile,
  type MemberChatSettings,
} from "@/lib/memberChat";
import { DIGITAL_MEMBERS } from "@/content/digitalMembers";
import { audit, type Db } from "./db";
import { canAuthor, HttpError, requireAuthor, type User } from "./auth";
import { digitalMember } from "./digitalMembers";
import { openaiReady, openaiTextModel } from "./openaiText";
import { relayText, type RelayProvider } from "./relayModel";

/*
  Chatting with a Digital Member (lib/memberChat for the rules, docs/digital-members.md). OpenAI plays the person from
  their approved introduction, under the fixed house rules and the Hub's extra instructions. Replies stream back.

  Nothing anyone writes is stored: the conversation lives in the learner's browser and is sent with each message.
  The server keeps only that a message was sent to a member, when, and by whom, for the hourly limit and the counts
  authors see.
*/

const SETTINGS_KEY = "member_chat";
const MAX_MESSAGE = 600;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS member_chat_events (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, member_id TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('message', 'started')),
  version TEXT NOT NULL, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS member_chat_events_user ON member_chat_events (user_id, at);
`;
const ready = new WeakSet<object>();
function ensure(db: Db) {
  if (ready.has(db)) return;
  db.exec(SCHEMA);
  ready.add(db);
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

export function memberChatSettings(db: Db): MemberChatSettings {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(SETTINGS_KEY) as { value: string } | undefined;
  try {
    return cleanMemberChat(row ? JSON.parse(row.value) : {});
  } catch {
    return cleanMemberChat({});
  }
}

/** The model behind the chat: always OpenAI, with the Hub's own key (OPENAI_TEXT_MODEL picks the model). */
export function memberChatProvider(): RelayProvider | null {
  return openaiReady() ? { id: "openai", model: openaiTextModel() } : null;
}

/** For authors: the settings, what's connected, the members to choose from, and use in the last 30 days. */
export function memberChatAdmin(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  ensure(db);
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const rows = db
    .prepare("SELECT member_id, kind, COUNT(*) AS n, COUNT(DISTINCT user_id) AS people FROM member_chat_events WHERE at >= ? GROUP BY member_id, kind")
    .all(since) as { member_id: string; kind: string; n: number; people: number }[];
  const provider = memberChatProvider();
  return {
    settings: memberChatSettings(db),
    version: MEMBER_CHAT_VERSION,
    provider: provider ? { name: "OpenAI", model: provider.model } : null,
    members: DIGITAL_MEMBERS.map((m) => {
      const p = digitalMember(db, actor, m.id, now);
      return {
        id: m.id,
        name: p?.name ?? m.id,
        portrait: p?.portrait ?? "",
        chats: rows.find((r) => r.member_id === m.id && r.kind === "started")?.n ?? 0,
        messages: rows.find((r) => r.member_id === m.id && r.kind === "message")?.n ?? 0,
      };
    }),
    totals: {
      chats: rows.filter((r) => r.kind === "started").reduce((s, r) => s + r.n, 0),
      messages: rows.filter((r) => r.kind === "message").reduce((s, r) => s + r.n, 0),
      people: (db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM member_chat_events WHERE at >= ?").get(since) as { n: number }).n,
    },
  };
}

export function saveMemberChatSettings(db: Db, actor: User, input: unknown, now: Date) {
  requireAuthor(actor);
  const previous = memberChatSettings(db);
  const next = cleanMemberChat({ ...previous, ...(input && typeof input === "object" ? input : {}) });
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(SETTINGS_KEY, JSON.stringify(next));
  audit(db, { actor: actor.id, event: "member_chat.settings", entity: "settings:member_chat", previous, next, at: now });
  return memberChatAdmin(db, actor, now);
}

/** Exactly what the AI would be told for one member: the brief an author can read before switching it on. */
export function memberChatPreview(db: Db, actor: User, memberId: unknown, now: Date) {
  requireAuthor(actor);
  const p = profileFor(db, actor, String(memberId ?? ""), now);
  return chatBrief(memberChatSettings(db), p);
}

// ---------------------------------------------------------------------------------------------
// Chatting
// ---------------------------------------------------------------------------------------------

function profileFor(db: Db, user: User, id: string, now: Date): ChatProfile & { id: string } {
  const m = digitalMember(db, user, id, now);
  if (!m) throw new HttpError(404, "That digital member isn’t here.");
  return {
    id: m.id,
    name: m.name,
    role: m.role,
    groupLabel: m.groupLabel,
    hello: m.hello,
    approach: m.approach,
    about: m.about,
    matters: m.matters,
    themes: m.themes,
    knows: m.knows.map((k) => ({ name: k.name, relation: k.relation, note: k.note })),
    pronouns: m.pronouns,
  };
}

/** Whether this person can chat now, and with whom: for the page, before anything is sent. */
export function memberChatStatus(db: Db, user: User, now: Date) {
  ensure(db);
  const s = memberChatSettings(db);
  const reason = !s.enabled
    ? "Chatting with digital members is switched off for now."
    : s.who === "authors" && !canAuthor(user)
      ? "Chatting with digital members isn’t open to everyone yet."
      : !memberChatProvider()
        ? "Chat isn’t connected yet. An administrator needs to add the OpenAI key."
        : null;
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const used = (
    db.prepare("SELECT COUNT(*) AS n FROM member_chat_events WHERE user_id = ? AND kind = 'message' AND at >= ?").get(user.id, since) as { n: number }
  ).n;
  return {
    available: !reason,
    reason,
    excluded: s.excluded,
    turnsPerChat: s.turnsPerChat,
    leftThisHour: Math.max(0, s.perHour - used),
    notice: s.notice,
  };
}

type Turn = { role: "user" | "assistant"; text: string };

function cleanTurns(input: unknown, max: number): Turn[] {
  if (!Array.isArray(input) || !input.length) throw new HttpError(400, "Say something first.");
  const turns = input.slice(-(max * 2 + 1)).map((t) => {
    const role = (t as Turn)?.role;
    const text = String((t as Turn)?.text ?? "").trim();
    if ((role !== "user" && role !== "assistant") || !text) throw new HttpError(400, "That conversation couldn’t be read.");
    return { role, text: text.slice(0, role === "user" ? MAX_MESSAGE : 2000) };
  });
  while (turns[0]?.role === "assistant") turns.shift();
  if (turns.at(-1)?.role !== "user") throw new HttpError(400, "Say something first.");
  if (String((input.at(-1) as Turn).text ?? "").trim().length > MAX_MESSAGE) throw new HttpError(400, `Keep each message under ${MAX_MESSAGE} characters.`);
  return turns;
}

/**
  Checks a message can be sent (switched on, allowed, within the limits, a member who can chat) and builds the
  request. Records the message (not its words) so the hourly limit counts it.
*/
export function prepareMemberChat(db: Db, user: User, input: { memberId?: unknown; messages?: unknown }, now: Date, signal?: AbortSignal) {
  const status = memberChatStatus(db, user, now);
  if (!status.available) throw new HttpError(403, status.reason ?? "Chat isn’t available.");
  const s = memberChatSettings(db);
  const memberId = String(input.memberId ?? "");
  if (s.excluded.includes(memberId)) throw new HttpError(403, "This digital member isn’t taking chats.");
  const p = profileFor(db, user, memberId, now);
  const turns = cleanTurns(input.messages, s.turnsPerChat);
  const learnerTurns = turns.filter((t) => t.role === "user").length;
  if (learnerTurns > s.turnsPerChat) throw new HttpError(429, `That’s the end of this chat. Start a new one to keep talking with ${p.name}.`);
  if (status.leftThisHour <= 0) throw new HttpError(429, "That’s a lot of chatting for one hour. Take a break and come back soon.");
  const provider = memberChatProvider()!;
  const brief = chatBrief(s, p);
  const at = now.toISOString();
  const add = db.prepare("INSERT INTO member_chat_events (id, user_id, member_id, kind, version, at) VALUES (?, ?, ?, ?, ?, ?)");
  if (learnerTurns === 1) add.run(randomUUID(), user.id, p.id, "started", MEMBER_CHAT_VERSION, at);
  add.run(randomUUID(), user.id, p.id, "message", MEMBER_CHAT_VERSION, at);
  return {
    provider,
    name: p.name,
    request: {
      // The opening hello is on screen already: the AI is told it said it, so it carries on from there.
      rules: brief.rules,
      context: `${brief.context}\n\nYou opened this chat by saying: "${p.hello}"`,
      messages: turns.map((t) => ({ role: t.role, content: t.text })),
      maxTokens: REPLY_LENGTHS[s.replyLength].tokens + FOLLOWUP_TOKENS,
      signal,
    },
  };
}

export type MemberChatEvent = { type: "text"; text: string } | { type: "followups"; items: string[] } | { type: "done" } | { type: "error"; message: string };

/**
  The reply as it's written, without its follow-up line: text is passed on as it arrives, except the last few
  characters, held back until it's clear they aren't the start of the follow-up marker. Once the marker appears,
  the rest is kept for the follow-up questions, sent at the end as their own event.
*/
export async function* withoutFollowUps(pieces: AsyncIterable<string>): AsyncGenerator<MemberChatEvent> {
  let full = "";
  let sent = 0;
  let marked = -1;
  for await (const piece of pieces) {
    full += piece;
    if (marked < 0) marked = full.toUpperCase().indexOf(FOLLOWUP_MARK);
    const safe = marked >= 0 ? marked : full.length - (FOLLOWUP_MARK.length - 1);
    if (safe > sent) {
      yield { type: "text", text: full.slice(sent, safe) };
      sent = safe;
    }
  }
  if (marked < 0 && full.length > sent) yield { type: "text", text: full.slice(sent) };
  const { followUps } = splitFollowUps(full);
  if (followUps.length) yield { type: "followups", items: followUps };
}

/** The reply as it's written, then done; or an error the page can show. */
export async function* memberChatReply(prepared: ReturnType<typeof prepareMemberChat>): AsyncGenerator<MemberChatEvent> {
  let any = false;
  try {
    for await (const event of withoutFollowUps(relayText(prepared.provider, prepared.request))) {
      if (event.type === "text") any = true;
      yield event;
    }
    if (!any) throw new Error("empty");
    yield { type: "done" };
  } catch {
    yield { type: "error", message: `${prepared.name} couldn’t reply just now. Try again in a moment.` };
  }
}
