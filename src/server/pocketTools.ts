import "server-only";
import { POCKET_TOOLS } from "@/content/pocketPlaybook";
import { TOOL_STATUS, toolHref, type PocketTool } from "@/lib/pocketPlaybook";
import type { PbAudience } from "@/lib/playbook";
import type { Db } from "./db";
import type { User } from "./auth";

/*
  The Pocket Playbook's tools as the server sees them (docs/pocket-playbook.md): the registry in content, plus each
  tool's live status (withdrawn or not) from the database. Kept apart from server/pocketPlaybook so Favourites can
  read a saved tool's standing without a circular import.

  - Who may see a tool is by role, as for Job Aids: someone outside its audience gets nothing, not even its title.
  - An owner can withdraw a tool at once. A withdrawn tool leaves the drawer, the home row and search, and every
    saved or pinned copy shows a safe unavailable state with the route to use instead, never the old content.
*/

const ready = new WeakSet<object>();
export function ensurePocketTables(db: Db) {
  if (ready.has(db)) return;
  db.exec(`CREATE TABLE IF NOT EXISTS pocket_tool_status (
  tool_id TEXT PRIMARY KEY, withdrawn INTEGER NOT NULL DEFAULT 0, reason TEXT NOT NULL DEFAULT '', replacement TEXT NOT NULL DEFAULT '',
  by_user TEXT NOT NULL DEFAULT '', at TEXT NOT NULL
);`);
  ready.add(db);
}

export const isPocketTool = (id: unknown): id is string => typeof id === "string" && POCKET_TOOLS.some((t) => t.id === id);

/** A tool's standing now: draft (the pilot), current, review due, or withdrawn. */
export type ToolState = "draft" | "current" | "review_due" | "withdrawn";
export type ToolView = PocketTool & { state: ToolState; statusLabel: string; withdrawnReason: string; replacement: string };

export function toolState(db: Db, t: PocketTool, now: Date): Pick<ToolView, "state" | "statusLabel" | "withdrawnReason" | "replacement"> {
  ensurePocketTables(db);
  const row = db.prepare("SELECT withdrawn, reason, replacement FROM pocket_tool_status WHERE tool_id = ?").get(t.id) as
    { withdrawn: number; reason: string; replacement: string } | undefined;
  if (row?.withdrawn || t.status === "withdrawn")
    return { state: "withdrawn", statusLabel: TOOL_STATUS.withdrawn, withdrawnReason: row?.reason ?? "", replacement: row?.replacement ?? "" };
  const today = now.toISOString().slice(0, 10);
  if (t.status !== "approved") return { state: "draft", statusLabel: TOOL_STATUS[t.status], withdrawnReason: "", replacement: "" };
  if (t.nextReview && t.nextReview < today) return { state: "review_due", statusLabel: "Review due", withdrawnReason: "", replacement: "" };
  return { state: "current", statusLabel: TOOL_STATUS.approved, withdrawnReason: "", replacement: "" };
}

const allowed = (user: User, t: PocketTool) => t.audiences.includes(user.audience as PbAudience);

/** One tool for this person, or that they may not see it. Someone outside its audience learns nothing about it. */
export function pocketTool(db: Db, user: User, id: unknown, now: Date): { permitted: false } | { permitted: true; tool: ToolView } {
  const t = POCKET_TOOLS.find((x) => x.id === id);
  if (!t || !allowed(user, t)) return { permitted: false };
  return { permitted: true, tool: { ...t, ...toolState(db, t, now) } };
}

/** Every tool this person may see, withdrawn ones included (each surface decides what to show for those). */
export function pocketTools(db: Db, user: User, now: Date): ToolView[] {
  return POCKET_TOOLS.filter((t) => allowed(user, t)).map((t) => ({ ...t, ...toolState(db, t, now) }));
}

/** Pocket tools as site search sees them: only those this person's role may open, and never a withdrawn one. */
export function pocketSearchDocs(db: Db, user: User, now = new Date()) {
  return pocketTools(db, user, now)
    .filter((t) => t.state !== "withdrawn")
    .map((t) => ({
      id: `pocket:${t.id}`,
      href: toolHref(t.id),
      title: t.title,
      meta: `Work tool · ${t.statusLabel}`,
      head: `${t.title} ${t.tags.join(" ")}`,
      summary: `${t.task} ${t.purpose}`,
      body: "",
    }));
}

/**
  A saved Pocket tool as a Favourites item. Its own content is never copied into Favourites: only its title and
  standing, and nothing at all when the person may no longer see it.
*/
export function pocketFavourite(db: Db, user: User, targetId: string, seen: string, now: Date) {
  const r = pocketTool(db, user, targetId, now);
  if (!r.permitted)
    return {
      title: "A tool you can no longer open",
      detail: "",
      label: "Work tool",
      state: "unavailable" as const,
      note: "It isn’t shared with your role any more. Look in Work Tools for what applies to you now.",
      href: "/tools",
    };
  const t = r.tool;
  if (t.state === "withdrawn")
    return {
      title: t.title,
      detail: "",
      label: "Work tool",
      state: "unavailable" as const,
      note: `Withdrawn${t.withdrawnReason ? `: ${t.withdrawnReason}` : ""}. Open it for the route to use instead.`,
      href: `${toolHref(t.id)}?from=favourites`,
    };
  const updated = Number(seen || 0) < t.version;
  return {
    title: t.title,
    detail: `Use when: ${t.task}`,
    label: "Work tool",
    state: updated ? ("updated" as const) : ("current" as const),
    note: updated
      ? `Updated since you pinned this: version ${t.version} is the current one.`
      : `${t.state === "draft" ? "Draft: awaiting approval" : `Version ${t.version}`} · ${t.owner}`,
    href: `${toolHref(t.id)}?from=favourites`,
  };
}
