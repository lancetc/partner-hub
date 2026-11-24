"use client";

import { api } from "@/lib/api";

/*
  The Pocket Playbook's page helpers (docs/pocket-playbook.md): opening the Companion Drawer from anywhere, and use
  events that hold ids and counts only. Call these from event handlers and effects, never while rendering.
*/

/** A key so a resend or a double tap counts once. crypto.randomUUID where there is one, then getRandomValues, then the clock. */
export function newKey(prefix: string) {
  let id = "";
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  try {
    if (c && typeof c.randomUUID === "function") id = c.randomUUID();
  } catch {}
  if (!id && c && typeof c.getRandomValues === "function") {
    const a = new Uint32Array(4);
    c.getRandomValues(a);
    id = Array.from(a, (n) => n.toString(36)).join("");
  }
  if (!id) id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${id.replace(/[^A-Za-z0-9]/g, "").slice(0, 32)}`;
}

/**
  A use event. Only ids, a version and where from: `toolId`, `scriptId`, `snippetId`, `ruleSet`, `place`, `issue`.
  Never a figure, a search phrase or anything typed. Never holds up what the person is doing, and never fails loudly.
*/
export function pocketEvent(body: {
  event: string;
  toolId?: string;
  scriptId?: string;
  snippetId?: string;
  ruleSet?: number;
  place?: string;
  issue?: string;
  key?: string;
}) {
  void api("/api/pocket", { body: { action: "event", key: body.key ?? newKey("ev"), ...body } }).catch(() => undefined);
}

export const OPEN_EVENT = "tc-companion-open";
export type OpenDetail = { trigger: HTMLElement | null; tool?: string };

/** Opens the Companion Drawer, remembering what opened it so focus goes back there on close. Optionally straight to a tool. */
export function openCompanion(trigger: HTMLElement | null, tool?: string) {
  window.dispatchEvent(new CustomEvent<OpenDetail>(OPEN_EVENT, { detail: { trigger, tool } }));
}

/** Where a tool was opened from, read from `?from=` once the page has loaded. */
export function placeFromUrl() {
  const from = new URLSearchParams(window.location.search).get("from") ?? "";
  return ["home", "search", "favourites", "drawer", "placement"].includes(from) ? from : "page";
}
