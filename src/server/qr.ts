import "server-only";
import QRCode from "qrcode";
import { lessons } from "@/content/lessons";
import type { Db } from "./db";
import { audit } from "./db";
import { HttpError, requireReporter, type User } from "./auth";
import { baseUrl } from "./campaigns";
import { adapterFor, type NotificationAdapter } from "./notify";
import { getRow, learningPathDetail } from "./learningPaths";
import { networkOrigins } from "./pathReviews";
import { publicToken } from "./publicPaths";
import { publicTopicToken } from "./publicTopics";

/*
  QR codes that open a learning path or a lesson on a phone. They only ever encode this hub's own
  addresses (never free text), so the image endpoint can be public, which email clients need.
*/

/** "open" is a path's public link: anyone can open it without signing in. */
export type QrTarget = { kind: "path" | "lesson" | "open" | "openTopic"; id: string };

/** The address a QR code opens, and what it's for. Throws if the path or lesson doesn't exist. */
/** `host`: the address the request came in on, which a public link's code uses while the hub only runs on this computer. */
export function qrTarget(db: Db, t: QrTarget, host?: string | null) {
  if (t.kind === "open") {
    const p = getRow(db, t.id);
    return { url: `${publicOrigin(host)}/open/${publicToken(db, p.id)}`, title: p.name, kind: "Learning path · open to everyone" };
  }
  if (t.kind === "openTopic") {
    const l = lessons.find((x) => x.slug === t.id && x.track !== "reinforcement");
    if (!l) throw new HttpError(404, "Topic not found.");
    return { url: `${publicOrigin(host)}/open/topic/${publicTopicToken(db, l.slug)}`, title: l.title, kind: "Topic · open to everyone" };
  }
  if (t.kind === "path") {
    const p = getRow(db, t.id);
    return { url: `${baseUrl()}/paths/${encodeURIComponent(p.id)}`, title: p.name, kind: "Learning path" };
  }
  const l = lessons.find((x) => x.slug === t.id && x.track !== "reinforcement");
  if (!l) throw new HttpError(404, "Topic not found.");
  return { url: `${baseUrl()}/learning/${encodeURIComponent(l.slug)}`, title: l.title, kind: "Topic" };
}

// Navy on white with a quiet zone, and enough error correction to survive a little glare or a crease.
const OPTIONS = { errorCorrectionLevel: "M" as const, margin: 2, color: { dark: "#102a43", light: "#ffffff" } };

export const qrPng = (url: string, size = 512) => QRCode.toBuffer(url, { ...OPTIONS, width: Math.min(Math.max(size, 128), 1024), type: "png" });
export const qrSvg = (url: string) => QRCode.toString(url, { ...OPTIONS, type: "svg" });

/** True when the hub's public address is this computer, so phones can't open the codes yet. */
export const localOnly = (url = baseUrl()) => /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url);

/**
  Where public links point. Once the hub has its web address (HUB_PUBLIC_URL), that. While it only
  runs on this computer, a network address phones on the same Wi-Fi can open: the one the author is
  using if they opened the hub by it (this Mac can have several), otherwise the first.
*/
export function publicOrigin(host?: string | null) {
  const base = baseUrl();
  if (!localOnly(base)) return base;
  if (host && /^[\d.]+(:\d+)?$/.test(host) && !localOnly(`http://${host}`)) return `http://${host}`;
  return networkOrigins(new URL(base).host)[0] ?? base;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
  Emails each person assigned to a path its link and QR code, so they can scan it with their phone.
  One email per person per day (the idempotency key), however often the button is pressed.
*/
export async function emailPathQr(db: Db, actor: User, pathId: string, now: Date, adapter: NotificationAdapter = adapterFor("email")) {
  requireReporter(actor);
  const detail = learningPathDetail(db, actor, pathId);
  if (!detail.assignments.length) throw new HttpError(409, "Assign the path to people first.");
  const { url, title } = qrTarget(db, { kind: "path", id: pathId });
  const img = `${baseUrl()}/api/qr?path=${encodeURIComponent(pathId)}&size=360`;
  const day = now.toISOString().slice(0, 10);
  const outcomes: Record<string, number> = {};
  for (const a of detail.assignments) {
    const user = db.prepare("SELECT id, name, email FROM users WHERE id = ?").get(a.userId) as { id: string; name: string; email: string };
    const first = user.name.split(" ")[0];
    const due = a.dueDate ? ` Please finish it by ${new Date(`${a.dueDate}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "long" })}.` : "";
    const body = `Hi ${first},\n\nYou've been given the learning path "${title}".${due}\n\nScan the QR code with your phone's camera, or open this link:\n${url}\n\nTrilogy Care Partner Hub`;
    const html = `<div style="font-family:Arial,sans-serif;color:#102a43;max-width:480px">
<p>Hi ${esc(first)},</p>
<p>You've been given the learning path <strong>${esc(title)}</strong>.${esc(due)}</p>
<p>Scan the code with your phone's camera to start:</p>
<p><img src="${esc(img)}" width="180" height="180" alt="QR code for ${esc(title)}" style="display:block"></p>
<p><a href="${esc(url)}" style="display:inline-block;background:#0e7c7b;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">Open the learning path</a></p>
<p style="color:#5b6b7f;font-size:13px">Or copy this link: ${esc(url)}</p>
</div>`;
    const r = await adapter.send({
      idempotencyKey: `path-qr:${pathId}:${user.id}:${day}`,
      to: { name: user.name, email: user.email },
      subject: `Your learning path: ${title}`,
      body,
      html,
    });
    outcomes[r.status] = (outcomes[r.status] ?? 0) + 1;
  }
  audit(db, { actor: actor.id, event: "learning_path.qr_emailed", entity: `learning_path:${pathId}`, next: outcomes, at: now });
  return {
    sent: outcomes.accepted ?? 0,
    notConfigured: outcomes.not_configured ?? 0,
    failed: (outcomes.failed ?? 0) + (outcomes.unknown ?? 0),
    people: detail.assignments.length,
  };
}
