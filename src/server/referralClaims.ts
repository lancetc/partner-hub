import "server-only";
import { CLAIM_STATUSES, claimState, withOverrides, type ApprovedClaim, type ClaimOverride, type ClaimStatus } from "@/lib/referralStudio";
import { kitStatus, templateClaims, type KitTemplate } from "@/lib/referralKit";
import { KIT_TEMPLATE, REFERRAL_CLAIMS } from "@/content/referralStudio";
import { audit, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";

/*
  The Local Referral Studio's claim register and kit template as they stand now (docs/local-referral-studio.md): the
  reviewed seed in content/referralStudio, with the status changes owners record in Admin over it. Kept apart from
  server/referralStudio so the Magazine's publishing checks can read the register without a circular import.

  - A status change is the owner's decision, recorded with who approved it and when, and audited. Nothing here
    generates or rewrites wording: a new wording is a new version in content, reviewed like any other change.
  - Withdrawing or expiring a claim takes effect everywhere at once: the simulator's corrections, every new kit, the
    publishing gate, and every saved asset and pitch card that used it (marked for review).
*/

const SCHEMA = `
CREATE TABLE IF NOT EXISTS referral_claim_status (
  claim_id TEXT PRIMARY KEY, status TEXT NOT NULL, approved_by TEXT NOT NULL DEFAULT '', approved_on TEXT NOT NULL DEFAULT '',
  effective_from TEXT NOT NULL DEFAULT '', review_by TEXT NOT NULL DEFAULT '', set_by TEXT NOT NULL, set_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS referral_template_status (
  template_id TEXT PRIMARY KEY, status TEXT NOT NULL, brand TEXT NOT NULL DEFAULT '', partnerships TEXT NOT NULL DEFAULT '', pathway TEXT NOT NULL DEFAULT '',
  quality TEXT NOT NULL DEFAULT '', privacy TEXT NOT NULL DEFAULT '', approved_on TEXT NOT NULL DEFAULT '', review_by TEXT NOT NULL DEFAULT '',
  set_by TEXT NOT NULL, set_at TEXT NOT NULL
);
`;
const ready = new WeakSet<object>();
export function ensureClaimTables(db: Db) {
  if (ready.has(db)) return;
  db.exec(SCHEMA);
  ready.add(db);
}

type ClaimRow = { claim_id: string; status: ClaimStatus; approved_by: string; approved_on: string; effective_from: string; review_by: string };

/** The register now: the seed with every recorded status change over it. */
export function claimRegister(db: Db): ApprovedClaim[] {
  ensureClaimTables(db);
  const rows = db.prepare("SELECT * FROM referral_claim_status").all() as ClaimRow[];
  const over: Record<string, ClaimOverride> = {};
  for (const r of rows)
    over[r.claim_id] = { status: r.status, approvedBy: r.approved_by, approvedOn: r.approved_on, effectiveFrom: r.effective_from, reviewBy: r.review_by };
  return withOverrides(REFERRAL_CLAIMS, over);
}

type TemplateRow = {
  status: KitTemplate["status"];
  brand: string;
  partnerships: string;
  pathway: string;
  quality: string;
  privacy: string;
  approved_on: string;
  review_by: string;
};
/** The kit template now: the reviewed seed with its recorded approval. */
export function kitTemplate(db: Db): KitTemplate {
  ensureClaimTables(db);
  const r = db.prepare("SELECT * FROM referral_template_status WHERE template_id = ?").get(KIT_TEMPLATE.id) as TemplateRow | undefined;
  if (!r) return KIT_TEMPLATE;
  return {
    ...KIT_TEMPLATE,
    status: r.status,
    approval: {
      brand: r.brand,
      partnerships: r.partnerships,
      pathway: r.pathway,
      quality: r.quality,
      privacy: r.privacy,
      approvedOn: r.approved_on,
      reviewBy: r.review_by,
    },
  };
}

const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const name = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 120) : "");

/** An owner records a claim's status. Approving needs who and when; every change is audited. */
export function setClaimStatus(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensureClaimTables(db);
  const c = REFERRAL_CLAIMS.find((x) => x.id === input.claimId);
  if (!c) throw new HttpError(404, "That claim isn’t in the register.");
  const status = CLAIM_STATUSES.includes(input.status as ClaimStatus) ? (input.status as ClaimStatus) : null;
  if (!status) throw new HttpError(400, "Choose draft, approved, expired or withdrawn.");
  const next = {
    status,
    approvedBy: name(input.approvedBy),
    approvedOn: date(input.approvedOn),
    effectiveFrom: date(input.effectiveFrom),
    reviewBy: date(input.reviewBy),
  };
  if (status === "approved" && !(next.approvedBy && next.approvedOn && next.effectiveFrom && next.reviewBy))
    throw new HttpError(400, "An approval needs the approver, the approval date, the effective date and a review date.");
  return tx(db, () => {
    const previous = claimRegister(db).find((x) => x.id === c.id)!;
    db.prepare(
      `INSERT INTO referral_claim_status (claim_id, status, approved_by, approved_on, effective_from, review_by, set_by, set_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (claim_id) DO UPDATE SET status = excluded.status, approved_by = excluded.approved_by, approved_on = excluded.approved_on,
       effective_from = excluded.effective_from, review_by = excluded.review_by, set_by = excluded.set_by, set_at = excluded.set_at`,
    ).run(c.id, status, next.approvedBy, next.approvedOn, next.effectiveFrom, next.reviewBy, actor.id, now.toISOString());
    audit(db, {
      actor: actor.id,
      event: "referral_claim.status_set",
      entity: `referral_claim:${c.id}@${c.version}`,
      previous: { status: previous.status, approvedBy: previous.approvedBy, approvedOn: previous.approvedOn, reviewBy: previous.reviewBy },
      next,
      at: now,
    });
    return { claim: c.id, state: claimState({ ...c, ...next }, now.toISOString().slice(0, 10)) };
  });
}

/** The template's own approval: brand/marketing, Partnerships, the referral pathway owner, Quality and Privacy. Audited. */
export function setTemplateStatus(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensureClaimTables(db);
  const status = ["draft", "approved", "withdrawn"].includes(String(input.status)) ? (String(input.status) as KitTemplate["status"]) : null;
  if (!status) throw new HttpError(400, "Choose draft, approved or withdrawn.");
  const a = {
    brand: name(input.brand),
    partnerships: name(input.partnerships),
    pathway: name(input.pathway),
    quality: name(input.quality),
    privacy: name(input.privacy),
    approvedOn: date(input.approvedOn),
    reviewBy: date(input.reviewBy),
  };
  if (status === "approved" && !(a.brand && a.partnerships && a.pathway && a.quality && a.privacy && a.approvedOn && a.reviewBy))
    throw new HttpError(400, "An approved template needs every reviewer, the date and a review date.");
  db.prepare(
    `INSERT INTO referral_template_status (template_id, status, brand, partnerships, pathway, quality, privacy, approved_on, review_by, set_by, set_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (template_id) DO UPDATE SET status = excluded.status, brand = excluded.brand, partnerships = excluded.partnerships, pathway = excluded.pathway,
     quality = excluded.quality, privacy = excluded.privacy, approved_on = excluded.approved_on, review_by = excluded.review_by, set_by = excluded.set_by, set_at = excluded.set_at`,
  ).run(KIT_TEMPLATE.id, status, a.brand, a.partnerships, a.pathway, a.quality, a.privacy, a.approvedOn, a.reviewBy, actor.id, now.toISOString());
  audit(db, {
    actor: actor.id,
    event: "referral_template.status_set",
    entity: `referral_template:${KIT_TEMPLATE.id}@${KIT_TEMPLATE.version}`,
    next: { status, ...a },
    at: now,
  });
  const t = kitTemplate(db);
  return { template: t.id, ...kitStatus(t, claimRegister(db), now.toISOString().slice(0, 10)), dependsOn: templateClaims(t) };
}
