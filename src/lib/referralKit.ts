import { EVENTS, STAGES, type Stage } from "./referralJourney";
import {
  CLAIM_STATE_LABELS,
  claimFlagsOf,
  claimState,
  detailsProblem,
  REFERRER_ROLES,
  STAGE_NEXT,
  type ApprovedClaim,
  type ReferrerRole,
} from "./referralStudio";

/*
  The Local Referral Studio's approved outreach kit (docs/local-referral-studio.md, PRD section 9): a co-branded
  one-pager, a pitch card and three follow-up email drafts, all from one centrally reviewed template.

  - Locked text comes from the template and the claim register (`{{claim:id}}`), never from the user or a model. Only
    the restricted fields in KitFields can change, and cleanKitFields drops anything else, so a programme claim can't be
    edited through a text box.
  - The free fields (a one-sentence introduction, and the email placeholders) are checked by rule: no real personal
    details, no unapproved claim from the register, no endorsement or logo, no link. A placeholder stays a placeholder
    until the Care Partner fills it in.
  - The kit is a draft ("Draft — review required") until the template and every claim it depends on are approved and
    current. A withdrawn or expired claim blocks an approved export, and a saved asset that depends on it is marked for
    review with a replacement offered.
  - Nothing is sent. Copying an email or printing the one-pager is recorded as that, never as "sent", an introduction
    or a referral. There's no AI personalisation in v1.
*/

export const KIT_VERSION = "referral-kit-1";
export const DRAFT_MARK = "Draft — review required";
export const NOT_SENT = "Not sent. Copying or downloading a draft doesn’t send it, and the Hub never marks it sent.";

export type KitAudience = ReferrerRole;
export type KitFields = {
  audience: KitAudience;
  stage: Stage;
  serviceArea: string;
  contactRoute: string;
  introduction: string;
  example: string;
  recipient: string;
  meeting: string;
  commitment: string;
};
export const FREE_FIELDS = {
  introduction: { label: "Your one-sentence local introduction", max: 180 },
  recipient: { label: "Recipient (their role or name, typed by you)", max: 80 },
  meeting: { label: "What you discussed", max: 140 },
  commitment: { label: "What you agreed to do", max: 140 },
} as const;
type FreeField = keyof typeof FREE_FIELDS;

/** A template's section: locked text with `{{claim:id}}` and `[field]` tokens, and stage-specific text where it differs. */
export type KitSection = { id: string; heading: string; text: string; byStage: Partial<Record<Stage, string>>; audiences: string[] };
export type KitEmail = { id: string; label: string; subject: string; body: string };
export type KitTemplate = {
  id: string;
  version: string;
  status: "draft" | "approved" | "withdrawn";
  /** Who must approve the template itself (separate from each claim's owner). */
  approval: { brand: string; partnerships: string; pathway: string; quality: string; privacy: string; approvedOn: string; reviewBy: string };
  title: string;
  relationship: string;
  sections: KitSection[];
  /** The call to action, by stage: never a provider-ready one for an unknown stage. */
  cta: Record<Stage, string>;
  handoff: string[];
  pitch: { script: string; answer: string };
  emails: KitEmail[];
  checklist: string[];
  serviceAreas: { id: string; label: string }[];
  contactRoutes: { id: string; label: string }[];
  examples: { id: string; text: string }[];
};

/** The provider-ready close, which only an allocated or changing stage may carry. Tested. */
export const PROVIDER_READY = /\b(choose trilogy care|start with us|sign up|introduce them to us|introduction to our business)\b/i;

const s = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Only the approved fields, and nothing else: unknown keys are dropped here, so locked text can't be overwritten. */
export function cleanKitFields(v: unknown): KitFields {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const stage = typeof o.stage === "string" && o.stage in STAGES ? (o.stage as Stage) : "unknown";
  const audience = typeof o.audience === "string" && o.audience in REFERRER_ROLES ? (o.audience as KitAudience) : "gp";
  return {
    audience,
    stage,
    serviceArea: s(o.serviceArea, 60),
    contactRoute: s(o.contactRoute, 60),
    introduction: s(o.introduction, FREE_FIELDS.introduction.max + 40),
    example: s(o.example, 60),
    recipient: s(o.recipient, FREE_FIELDS.recipient.max + 40),
    meeting: s(o.meeting, FREE_FIELDS.meeting.max + 40),
    commitment: s(o.commitment, FREE_FIELDS.commitment.max + 40),
  };
}

const ENDORSE =
  /\b(endors\w*|recommended by|preferred provider|approved by (?:the )?(?:gp|hospital|practice)|official partner of|on behalf of (?:the )?(?:hospital|practice)|logo|testimonial)\b/i;
const LINK = /https?:\/\/|www\./i;

/** What stops the fields being used, in words. Empty when they're fine. */
export function kitFieldProblems(t: KitTemplate, f: KitFields, register: ApprovedClaim[]): string[] {
  const out: string[] = [];
  if (!t.serviceAreas.some((a) => a.id === f.serviceArea)) out.push("Choose your service area from the verified list.");
  if (!t.contactRoutes.some((r) => r.id === f.contactRoute)) out.push("Choose an approved contact route.");
  if (f.example && !t.examples.some((x) => x.id === f.example)) out.push("Choose a practical example from the reviewed list, or none.");
  for (const k of Object.keys(FREE_FIELDS) as FreeField[]) {
    const v = f[k];
    if (!v) continue;
    const { label, max } = FREE_FIELDS[k];
    if (v.length > max) out.push(`“${label}” is longer than ${max} characters.`);
    const details = detailsProblem(v);
    if (details) out.push(`“${label}”: ${details}`);
    if (LINK.test(v)) out.push(`“${label}”: take out the link. Contact routes come from the approved list.`);
    if (ENDORSE.test(v)) out.push(`“${label}”: take out the endorsement, logo or testimonial. Nobody has approved that use.`);
    for (const c of claimFlagsOf(register, f.audience, v, 0)) {
      const claim = register.find((x) => x.id === c.claim);
      out.push(
        `“${label}”: “${c.quote}” is a claim about ${claim?.topic.toLowerCase() ?? "a locked topic"} the register doesn’t allow. ${claim?.doNot ?? ""}`.trim(),
      );
    }
  }
  if (f.introduction && f.introduction.split(/(?<=[.!?])\s+/).filter(Boolean).length > 1) out.push("Keep the introduction to one sentence.");
  return out;
}

/** The claims a template depends on: every `{{claim:id}}` in it. */
export function templateClaims(t: KitTemplate): string[] {
  const all = JSON.stringify([t.sections, t.cta, t.handoff, t.pitch, t.emails, t.relationship]);
  return [...new Set([...all.matchAll(/\{\{claim:([\w-]+)\}\}/g)].map((m) => m[1]))];
}

/** Whether the kit can be exported as approved today, and if not, why. */
export function kitStatus(t: KitTemplate, register: ApprovedClaim[], today: string): { approved: boolean; reasons: string[]; blocked: string[] } {
  const reasons: string[] = [];
  const blocked: string[] = [];
  const a = t.approval;
  if (t.status === "withdrawn") blocked.push("This template has been withdrawn.");
  else if (t.status !== "approved" || !(a.brand && a.partnerships && a.pathway && a.quality && a.privacy && a.approvedOn))
    reasons.push("The template is waiting for brand/marketing, Partnerships, the referral pathway owner, Quality and Privacy to approve it.");
  if (a.reviewBy && today > a.reviewBy) blocked.push(`The template was due for review on ${a.reviewBy}.`);
  for (const id of templateClaims(t)) {
    const c = register.find((x) => x.id === id);
    if (!c) {
      blocked.push(`A claim it uses (“${id}”) isn’t in the register.`);
      continue;
    }
    const st = claimState(c, today);
    if (st === "withdrawn" || st === "expired")
      blocked.push(`“${c.topic}” is ${CLAIM_STATE_LABELS[st].toLowerCase()}: no approved export until it’s replaced.`);
    else if (st === "draft") reasons.push(`“${c.topic}” is a draft awaiting ${c.owner || "its owner"}.`);
  }
  return { approved: !reasons.length && !blocked.length, reasons, blocked };
}

export type KitLine = { text: string; locked: boolean; field?: string };
export type BuiltKit = {
  status: "approved" | "draft" | "blocked";
  mark: string;
  reasons: string[];
  problems: string[];
  templateVersion: string;
  claimVersions: Record<string, string>;
  stage: Stage;
  next: (typeof STAGE_NEXT)[Stage];
  onePager: {
    title: KitLine[];
    sections: { id: string; heading: string; lines: KitLine[] }[];
    cta: KitLine[];
    handoff: string[];
    contact: KitLine[];
    footer: string[];
  };
  pitchCard: { persona: string; objection: string; script: KitLine[]; answer: KitLine[]; next: string; contact: string };
  emails: { id: string; label: string; subject: string; body: KitLine[] }[];
  checklist: string[];
};

/**
  The kit for these fields: locked text from the template and the register, the restricted fields put in their places,
  and placeholders left as placeholders. A withdrawn or expired claim's line is left out and named, so a sheet never
  carries it. Pure, so the browser's live preview and the server's saved asset are the same.
*/
export function buildKit(t: KitTemplate, register: ApprovedClaim[], f0: KitFields, ctx: { businessName: string; today: string }): BuiltKit {
  const f = cleanKitFields(f0);
  const today = ctx.today;
  const status = kitStatus(t, register, today);
  const problems = kitFieldProblems(t, f, register);
  const area = t.serviceAreas.find((a) => a.id === f.serviceArea)?.label ?? "";
  const route = t.contactRoutes.find((r) => r.id === f.contactRoute)?.label ?? "";
  const example = t.examples.find((x) => x.id === f.example)?.text ?? "";
  const values: Record<string, { text: string; label: string }> = {
    serviceArea: { text: area, label: "[your verified service area]" },
    business: { text: ctx.businessName, label: "[your business name]" },
    contactRoute: { text: route, label: "[an approved contact route]" },
    introduction: { text: f.introduction, label: "" },
    example: { text: example, label: "" },
    recipient: { text: f.recipient, label: "[Recipient]" },
    meeting: { text: f.meeting, label: "[what you discussed]" },
    commitment: { text: f.commitment, label: "[what you agreed to do]" },
    referrer: { text: REFERRER_ROLES[f.audience].label.toLowerCase(), label: "" },
  };
  const claimVersions: Record<string, string> = {};
  /** One template string, as lines: claims resolved (a withdrawn one dropped and named), fields filled or left as placeholders. */
  const render = (src: string): KitLine[] => {
    const out: KitLine[] = [];
    for (const part of src.split(/(\{\{claim:[\w-]+\}\}|\[[a-zA-Z]+\])/g).filter(Boolean)) {
      const cm = part.match(/^\{\{claim:([\w-]+)\}\}$/);
      const fm = part.match(/^\[([a-zA-Z]+)\]$/);
      if (cm) {
        const c = register.find((x) => x.id === cm[1]);
        const st = c ? claimState(c, today) : "withdrawn";
        if (c) claimVersions[c.id] = `${c.version}:${st}`;
        out.push(
          c && st !== "withdrawn" && st !== "expired"
            ? { text: [c.wording, c.qualifiers].filter(Boolean).join(" "), locked: true }
            : { text: `[Removed: ${c?.topic ?? cm[1]} is ${st}. Check with ${c?.owner || "its owner"}.]`, locked: true },
        );
      } else if (fm && values[fm[1]]) {
        const v = values[fm[1]];
        out.push({ text: v.text || v.label, locked: false, field: fm[1] });
      } else out.push({ text: part, locked: true });
    }
    return out.filter((l) => l.text);
  };
  const forStage = (sec: KitSection) => sec.byStage[f.stage] ?? sec.text;
  const sections = t.sections
    .filter((sec) => !sec.audiences.length || sec.audiences.includes(f.audience))
    .map((sec) => ({ id: sec.id, heading: sec.heading, lines: render(forStage(sec)) }))
    .filter((sec) => sec.lines.length);
  const final = status.blocked.length ? "blocked" : status.approved && !problems.length ? "approved" : "draft";
  return {
    status: final,
    mark: final === "approved" ? `Approved template ${t.version} · effective ${t.approval.approvedOn}` : DRAFT_MARK,
    reasons: [...status.blocked, ...status.reasons],
    problems,
    templateVersion: `${t.id}@${t.version}`,
    claimVersions,
    stage: f.stage,
    next: STAGE_NEXT[f.stage],
    onePager: {
      title: render(t.title),
      sections,
      cta: render(t.cta[f.stage]),
      // The urgent discharge stage gets the reviewed handoff checklist, not a sales one-pager.
      handoff: f.stage === "urgent" ? t.handoff : [],
      contact: [
        render("[business], a Care Partner business working with Trilogy Care, in [serviceArea]."),
        render("Contact: [contactRoute]."),
        ...(f.introduction ? [render("[introduction]")] : []),
        ...(example ? [render("[example]")] : []),
      ].flatMap((part, k) => (k ? [{ text: " ", locked: true }, ...part] : part)),
      footer: [
        plain(render(t.relationship)),
        `Template ${t.id} ${t.version} · ${final === "approved" ? `effective ${t.approval.approvedOn}` : DRAFT_MARK} · generated ${today}`,
        `Stage: ${STAGES[f.stage]}. Handing over this sheet is relationship activity: it isn’t a referral or an introduction.`,
      ].filter(Boolean),
    },
    pitchCard: {
      persona: REFERRER_ROLES[f.audience].label,
      objection: REFERRER_ROLES[f.audience].objection,
      script: render(t.pitch.script),
      answer: render(t.pitch.answer),
      next: STAGE_NEXT[f.stage].step,
      contact: route || "[an approved contact route]",
    },
    emails: t.emails.map((e) => ({
      id: e.id,
      label: e.label,
      subject: render(e.subject)
        .map((l) => l.text)
        .join(""),
      body: render(e.body),
    })),
    checklist: t.checklist,
  };
}

/** Plain text of a kit part, for copying: the words only, never a "sent" state. */
export const plain = (lines: KitLine[]) => lines.map((l) => l.text).join("");

/**
  A saved asset's standing now. It loses "approved" (and is marked for review, with a replacement offered) when a claim
  it used is withdrawn or expired, a claim's version changes, or the template changes.
*/
export function assetStanding(
  saved: { templateVersion: string; claimVersions: Record<string, string>; status: string },
  t: KitTemplate,
  register: ApprovedClaim[],
  today: string,
): { state: "approved" | "draft" | "outdated"; reasons: string[] } {
  const reasons: string[] = [];
  if (saved.templateVersion !== `${t.id}@${t.version}`) reasons.push("The template has changed since this was made.");
  for (const [id, was] of Object.entries(saved.claimVersions)) {
    const c = register.find((x) => x.id === id);
    if (!c) {
      reasons.push(`A claim it used (“${id}”) has gone from the register.`);
      continue;
    }
    const st = claimState(c, today);
    if (st === "withdrawn" || st === "expired") reasons.push(`“${c.topic}” is now ${CLAIM_STATE_LABELS[st].toLowerCase()}.`);
    else if (was.split(":")[0] !== c.version) reasons.push(`“${c.topic}” has a new approved version.`);
  }
  if (reasons.length) return { state: "outdated", reasons };
  return { state: saved.status === "approved" && kitStatus(t, register, today).approved ? "approved" : "draft", reasons };
}

// ---------------------------------------------------------------------------------------------
// Measurement: three layers that are never added together (PRD section 12)
// ---------------------------------------------------------------------------------------------

export const LAYERS = {
  practice: "Practice",
  material: "Approved material use",
  pathway: "Referral pathway",
} as const;
export type Layer = keyof typeof LAYERS;

/** Every Studio event and its layer. A download is material use: never an introduction, an agreement or a service. */
export const STUDIO_EVENTS: Record<string, Layer> = {
  referral_studio_opened: "practice",
  roleplay_started: "practice",
  stage_selected: "practice",
  pitch_submitted: "practice",
  objection_answered: "practice",
  critical_claim_flagged: "practice",
  details_refused: "practice",
  caller_fallback_used: "practice",
  feedback_viewed: "practice",
  roleplay_completed: "practice",
  roleplay_retried: "practice",
  asset_draft_generated: "material",
  asset_approved_for_use: "material",
  asset_downloaded: "material",
  asset_copied: "material",
  pitch_card_saved: "material",
  relationship_activity_recorded: "material",
};

/** The referral pathway's own statuses, kept distinct (lib/referralJourney's events). Not connected in v1: no event here writes them. */
export const PATHWAY_STATUSES = {
  introduced: EVENTS.introduced,
  pathway: EVENTS.pathway,
  agreement: EVENTS.agreed,
  commenced: EVENTS.started,
} as const;
export const layerOf = (event: string): Layer | null => STUDIO_EVENTS[event] ?? null;
