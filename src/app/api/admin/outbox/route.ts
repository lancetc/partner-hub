import { body, handle } from "@/server/http";
import { HttpError, requireAuthor } from "@/server/auth";
import { audit } from "@/server/db";
import { outboxFor } from "@/server/reports";
import { adapterFor } from "@/server/notify";

export async function GET() {
  return handle(({ db, user }) => ({
    messages: outboxFor(db, user),
    adapters: (["email", "sms"] as const).map((c) => {
      const a = adapterFor(c);
      return { channel: c, name: a.name, configured: a.configured };
    }),
  }));
}

/** Reconciles an "unknown" outcome after checking with the provider. Never resends blindly. */
export async function POST(req: Request) {
  return handle(async ({ db, user, now }) => {
    requireAuthor(user);
    const { id, outcome } = await body<{ id: number; outcome: "accepted" | "requeue" }>(req);
    const row = db.prepare("SELECT status FROM outbox WHERE id = ?").get(id) as { status: string } | undefined;
    if (!row) throw new HttpError(404, "Message not found.");
    if (!["unknown", "failed", "not_configured"].includes(row.status)) throw new HttpError(409, "Only unknown, failed or unsent messages can be reconciled.");
    const next = outcome === "accepted" ? "accepted" : "queued";
    db.prepare("UPDATE outbox SET status = ?, updated_at = ? WHERE id = ?").run(next, now.toISOString(), id);
    audit(db, { actor: user.id, event: "outbox.reconciled", entity: `outbox:${id}`, previous: row.status, next, at: now });
    return { ok: true };
  });
}
