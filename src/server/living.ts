import "server-only";
import { randomUUID } from "node:crypto";
import { RETURN_PILOT, RETURN_PILOT_DATA, RETURN_PILOT_DOC, RETURN_PILOT_MOMENT, RETURN_PILOT_NOTE } from "@/content/livingPilot";
import { contractFor, EVIDENCE } from "@/lib/blockRegistry";
import {
  addDays,
  BEATS,
  capAllows,
  cleanNote,
  cleanReturn,
  emptyNote,
  emptyReturn,
  LIVING_CLIENT_EVENTS,
  NOTE_DEFAULTS,
  noteProblems,
  noteState,
  reasonText,
  returnProblems,
  type BeatKey,
  type Delivery,
  type LivingEvent,
  type NoteData,
  type NoteStatus,
  type ReturnContext,
  type ReturnData,
  type ReturnStatus,
} from "@/lib/living";
import type { GuideDoc } from "@/lib/magazine";
import { audit, ensureLivingTables, tx, type Db } from "./db";
import { canAuthor, HttpError, requireAuthor, type User } from "./auth";
import {
  blockLabel,
  blocksOf,
  findBlock,
  guideRow,
  monthWindow,
  pagesOf,
  publishedDoc,
  questionOf,
  rubricOf,
  transferEvidence,
  type GuideRow,
} from "./livingEvidence";
import { authorGuide, canRead, createGuide, saveGuideDraft } from "./magazine";
import { notify } from "./notifications";
import { ensureStory, mayApprove, relayChoices } from "./story";

/*
  Living cases (docs/living-cases.md): return links and Ava's Field Notes.

  A return link ties a later episode to an earlier appearance of the same person. Authors edit a draft; learners
  only ever get the approved copy, which pins the character, the episodes and the question as they were approved.

  What this never does: change an episode, a completion or an attempt; let a learner's answer alter the shared
  story; show one learner's earlier answer to anyone else; assign anything; or send anything outside the Hub. A
  Field Note is delivered when its person next uses the Hub after it falls due: there is no scheduler and no email.
*/

type ReturnRow = {
  id: string;
  title: string;
  character_id: string;
  theme_id: string;
  from_episode: string;
  from_guide: string;
  from_page: string;
  from_block: string;
  to_episode: string;
  to_guide: string;
  to_page: string;
  to_block: string;
  data: string;
  status: ReturnStatus;
  approved: string;
  approved_by: string | null;
  approved_at: string | null;
  owner: string;
  review_on: string;
  sample: number;
  created_at: string;
  updated_at: string;
};
type NoteRow = {
  id: string;
  return_id: string;
  data: string;
  status: NoteStatus;
  live: string;
  released_at: string | null;
  withdrawn_at: string | null;
  withdrawn_reason: string;
  sample: number;
  updated_at: string;
};
type DeliveryRow = {
  note_id: string;
  user_id: string;
  eligible_at: string;
  due_at: string;
  delivered_at: string | null;
  opened_at: string | null;
  dismissed_at: string | null;
  snoozed_until: string | null;
  target_revision: string;
};
type EpisodeRow = { id: string; title: string; summary: string; when_label: string; seq: number; people: string; status: string };
/** What learners are given: the return as it stood when it was approved. */
type Approved = {
  data: ReturnData;
  character: { id: string; revision: number } | null;
  link: Pick<ReturnRow, "from_episode" | "from_guide" | "from_page" | "from_block" | "to_episode" | "to_guide" | "to_page" | "to_block">;
  /** The transfer question's fingerprint at approval, to notice when the published page has since changed it. */
  rubric: string;
  at: string;
};

const newId = (p: string) => `${p}-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const idOf = (v: unknown) => (typeof v === "string" && /^[\w-]{1,80}$/.test(v) ? v : "");
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const sourceOf = (noteId: string) => `field-note:${noteId}`;

export function ensureLiving(db: Db, now = new Date()) {
  ensureLivingTables(db);
  ensureStory(db, now);
}

const returnRow = (db: Db, id: unknown) =>
  idOf(id) ? (db.prepare("SELECT * FROM story_returns WHERE id = ?").get(idOf(id)) as ReturnRow | undefined) : undefined;
const noteRow = (db: Db, id: unknown) => (idOf(id) ? (db.prepare("SELECT * FROM field_notes WHERE id = ?").get(idOf(id)) as NoteRow | undefined) : undefined);
const noteFor = (db: Db, returnId: string) =>
  db.prepare("SELECT * FROM field_notes WHERE return_id = ? ORDER BY created_at LIMIT 1").get(returnId) as NoteRow | undefined;
const dataOf = (r: Pick<ReturnRow, "data">): ReturnData => cleanReturn(JSON.parse(r.data));
const approvedOf = (r: Pick<ReturnRow, "approved" | "status">): Approved | null => {
  if (r.status !== "approved") return null;
  const a = JSON.parse(r.approved) as Partial<Approved>;
  return a.data && a.link ? { data: cleanReturn(a.data), character: a.character ?? null, link: a.link, rubric: a.rubric ?? "", at: a.at ?? "" } : null;
};
const episodes = (db: Db) =>
  db.prepare("SELECT id, title, summary, when_label, seq, people, status FROM story_episodes ORDER BY seq, title").all() as EpisodeRow[];
const character = (db: Db, id: string) => {
  if (!id) return null;
  const c = db
    .prepare(
      "SELECT c.id, c.name, c.portrait, c.hidden, p.revision, p.steward, p.audience FROM characters c LEFT JOIN character_profiles p ON p.character_id = c.id WHERE c.id = ?",
    )
    .get(id) as
    { id: string; name: string; portrait: string | null; hidden: number; revision: number | null; steward: string | null; audience: string | null } | undefined;
  return c
    ? {
        id: c.id,
        name: c.name,
        portrait: c.hidden ? "" : (c.portrait ?? ""),
        revision: c.revision ?? 0,
        steward: c.steward ?? "",
        audience: JSON.parse(c.audience ?? "[]") as string[],
      }
    : null;
};
const mayMeet = (user: User, c: { revision: number; audience: string[] } | null) =>
  Boolean(c && c.revision > 0 && (canAuthor(user) || !c.audience.length || c.audience.includes(user.audience)));
/** A course a learner can open now: published, not archived, and for their audience. */
const readable = (user: User, g: GuideRow | undefined): g is GuideRow => Boolean(g && g.status === "published" && g.revision_id && canRead(user, g));

function record(
  db: Db,
  user: Pick<User, "id" | "audience" | "org_id">,
  event: LivingEvent,
  e: { note?: string; ret?: string; guide?: string; revision?: string; detail?: string; key: string; at?: string },
  now: Date,
) {
  const done = db
    .prepare(
      "INSERT OR IGNORE INTO living_events (at, received_at, user_id, audience, org_id, event, note_id, return_id, guide_id, revision_id, detail, idem) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      e.at ?? now.toISOString(),
      now.toISOString(),
      user.id,
      user.audience,
      user.org_id ?? "",
      event,
      e.note ?? "",
      e.ret ?? "",
      e.guide ?? "",
      e.revision ?? "",
      (e.detail ?? "").slice(0, 80),
      `${user.id}:${e.key}`,
    );
  return Boolean(done.changes);
}

// ---------------------------------------------------------------------------------------------
// For authors
// ---------------------------------------------------------------------------------------------

/** What the checks need to know about a return: canon, the two questions, and the blocks on the page as the author has them. */
function contextOf(db: Db, row: ReturnRow): ReturnContext & { fromGuide: GuideRow | undefined; toGuide: GuideRow | undefined } {
  const eps = episodes(db);
  const from = eps.find((e) => e.id === row.from_episode);
  const to = eps.find((e) => e.id === row.to_episode);
  const c = character(db, row.character_id);
  const fromGuide = guideRow(db, row.from_guide);
  const toGuide = guideRow(db, row.to_guide);
  // The earlier question as learners met it; the return's as the author has it now.
  const first = questionOf(findBlock(publishedDoc(db, fromGuide) ?? fromGuide?.draft, row.from_page, row.from_block).block);
  const target = findBlock(toGuide?.draft, row.to_page, row.to_block);
  const published = pagesOf(publishedDoc(db, toGuide)).some((p) => p.id === row.to_page);
  return {
    character: c ? { name: c.name, approved: c.revision > 0 } : null,
    fromEpisode: from ? { title: from.title, seq: from.seq, approved: from.status === "approved" } : null,
    toEpisode: to ? { title: to.title, seq: to.seq, approved: to.status === "approved" } : null,
    first,
    second: questionOf(target.block),
    blocks: blocksOf(target.page).map((b) => ({ id: b.id, type: b.type, label: blockLabel(b), known: Boolean(contractFor(b.type)) })),
    target: toGuide
      ? {
          exists: Boolean(target.page),
          published: toGuide.status === "published" && published,
          relayEpisode: target.page?.relay?.episode ?? "",
          toEpisodeId: row.to_episode,
        }
      : null,
    later: to
      ? eps
          .filter(
            (e) =>
              e.status === "approved" &&
              e.seq > to.seq &&
              (!row.character_id || (JSON.parse(e.people) as { characterId: string }[]).some((p) => p.characterId === row.character_id)),
          )
          .map((e) => ({ title: e.title, summary: e.summary }))
      : [],
    fromGuide,
    toGuide,
  };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const linkOf = (r: ReturnRow): Approved["link"] => ({
  from_episode: r.from_episode,
  from_guide: r.from_guide,
  from_page: r.from_page,
  from_block: r.from_block,
  to_episode: r.to_episode,
  to_guide: r.to_guide,
  to_page: r.to_page,
  to_block: r.to_block,
});

/** Every return, with where it stands. */
export function livingLibrary(db: Db, actor: User, now = new Date()) {
  requireAuthor(actor);
  ensureLiving(db, now);
  const eps = new Map(episodes(db).map((e) => [e.id, e]));
  const rows = db.prepare("SELECT * FROM story_returns ORDER BY updated_at DESC").all() as ReturnRow[];
  return {
    returns: rows.map((r) => {
      const ctx = contextOf(db, r);
      const note = noteFor(db, r.id);
      const a = approvedOf(r);
      return {
        id: r.id,
        title: r.title,
        status: r.status,
        changed: Boolean(a) && (!sameJson(a!.data, dataOf(r)) || !sameJson(a!.link, linkOf(r))),
        sample: Boolean(r.sample),
        character: ctx.character?.name ?? "",
        from: eps.get(r.from_episode)?.title ?? "",
        to: eps.get(r.to_episode)?.title ?? "",
        course: ctx.toGuide ? { id: ctx.toGuide.id, title: ctx.toGuide.title, status: ctx.toGuide.status } : null,
        note: note ? { status: note.status } : null,
        blocking: returnProblems(dataOf(r), ctx).blocking.length,
        reviewOn: r.review_on,
      };
    }),
    hasPilot: rows.some((r) => r.id === RETURN_PILOT.id),
  };
}
export type LivingLibrary = ReturnType<typeof livingLibrary>;

/** One return, with everything an author and a reviewer need beside it. */
export function returnDetail(db: Db, actor: User, id: unknown, now = new Date()) {
  requireAuthor(actor);
  ensureLiving(db, now);
  const row = returnRow(db, id);
  if (!row) throw new HttpError(404, "That return isn’t here.");
  const data = dataOf(row);
  const ctx = contextOf(db, row);
  const a = approvedOf(row);
  const c = character(db, row.character_id);
  const eps = episodes(db);
  const note = noteFor(db, row.id);
  const noteData = note ? cleanNote(JSON.parse(note.data)) : emptyNote();
  const live = note?.status === "live" ? cleanNote(JSON.parse(note.live)) : null;
  const theme = row.theme_id
    ? (db.prepare("SELECT id, title, diagnosis FROM pd_themes WHERE id = ?").get(row.theme_id) as { id: string; title: string; diagnosis: string } | undefined)
    : undefined;
  const response = theme
    ? (db.prepare("SELECT data, status FROM pd_responses WHERE theme_id = ?").get(theme.id) as { data: string; status: string } | undefined)
    : undefined;
  const r = response
    ? (JSON.parse(response.data) as { desired?: string; barrierSummary?: string; learning?: string; measure?: { name?: string }; reviewOn?: string })
    : null;

  const targetPage = findBlock(ctx.toGuide?.draft, row.to_page, row.to_block).page;
  const pageBlocks = blocksOf(targetPage);
  const placed = new Map(data.placements.map((p) => [p.blockId, p]));
  const blocks = pageBlocks.map((b) => {
    const contract = contractFor(b.type);
    const p = placed.get(b.id);
    return {
      id: b.id,
      type: b.type,
      label: blockLabel(b),
      known: Boolean(contract),
      /** From the block registry: what a learner does with this kind of block, and what it can and can't show. */
      does: contract?.purpose ?? "",
      evidence: contract ? EVIDENCE[contract.evidence] : "",
      scoring: contract?.scoring ?? "",
      events: contract?.events ?? [],
      visibility: contract?.visibility ?? "",
      signoff: contract?.signoff ?? "",
      cannot: contract
        ? contract.evidence === "assessed"
          ? "That the judgement is used at work."
          : "That the learner would do this at work, or that anything at work changed. It is practice, not an assessed result."
        : "",
      placement: p ?? null,
    };
  });
  // Story moments placed on this page: the person's own words, each at the version its placement pinned.
  const moments = ctx.toGuide
    ? (
        db
          .prepare(
            `SELECT m.id, m.kind, m.status, m.draft, p.place FROM story_placements p JOIN story_moments m ON m.id = p.moment_id
             WHERE p.kind = 'guide' AND p.ref = ? AND p.status = 'active'`,
          )
          .all(ctx.toGuide.id) as { id: string; kind: string; status: string; draft: string; place: string }[]
      )
        .filter((m) => m.place === `page:${row.to_page}` || pageBlocks.some((b) => b.id === m.place))
        .map((m) => {
          const d = JSON.parse(m.draft) as { title?: string; text?: string; hypothetical?: boolean };
          return {
            id: m.id,
            kind: m.kind,
            title: d.title ?? "",
            text: (d.text ?? "").slice(0, 200),
            hypothetical: Boolean(d.hypothetical),
            approved: m.status === "approved",
          };
        })
    : [];
  const fromEp = eps.find((e) => e.id === row.from_episode);
  const beatText: Record<BeatKey, string> = {
    previous: fromEp ? `${fromEp.title}. ${fromEp.summary}` : "",
    change: data.changed,
    decision: data.decide,
    consequence: data.consequences,
    response:
      moments
        .filter((m) => m.kind === "person_response")
        .map((m) => m.text)
        .join(" ") || "",
    action: data.workAction,
  };
  const map = (Object.keys(BEATS) as BeatKey[]).map((key) => ({
    key,
    label: BEATS[key].label,
    hint: BEATS[key].hint,
    // A person's response written for one learner's attempt is that learner's practice, not shared story.
    kind: key === "response" && moments.some((m) => m.kind === "person_response" && m.hypothetical) ? ("branch" as const) : BEATS[key].kind,
    text: beatText[key],
    blocks: blocks
      .filter((b) => b.placement?.beat === key)
      .map((b) => ({ id: b.id, label: b.label, evidence: b.evidence, why: b.placement!.why, source: b.placement!.source })),
    moments: key === "response" ? moments.filter((m) => m.kind === "person_response") : [],
  }));

  const problems = returnProblems(data, ctx);
  const publishedQuestion = questionOf(findBlock(publishedDoc(db, ctx.toGuide), row.to_page, row.to_block).block);
  const deliveries = note
    ? (db
        .prepare(
          `SELECT COUNT(*) AS eligible, SUM(delivered_at IS NOT NULL) AS delivered, SUM(opened_at IS NOT NULL) AS opened,
                  SUM(dismissed_at IS NOT NULL) AS dismissed FROM field_note_deliveries WHERE note_id = ?`,
        )
        .get(note.id) as { eligible: number; delivered: number | null; opened: number | null; dismissed: number | null })
    : null;
  const guides = (
    db
      .prepare("SELECT id, slug, title, status, audience, revision_id, draft FROM magazine_guides WHERE status != 'archived' ORDER BY title")
      .all() as GuideRow[]
  ).map((g) => ({
    id: g.id,
    title: g.title,
    status: g.status,
    pages: pagesOf(g.draft).map((p) => ({
      id: p.id,
      title: p.title,
      decisions: blocksOf(p)
        .filter((b) => b.type === "decision")
        .map((b) => ({ id: b.id, label: blockLabel(b) })),
    })),
  }));
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    sample: Boolean(row.sample),
    owner: row.owner,
    reviewOn: row.review_on,
    characterId: row.character_id,
    themeId: row.theme_id,
    link: linkOf(row),
    data,
    approved: a
      ? {
          at: a.at,
          by: row.approved_by ?? "",
          changed: !sameJson(a.data, data) || !sameJson(a.link, linkOf(row)),
          characterRevision: a.character?.revision ?? 0,
        }
      : null,
    /** The published page now asks something other than what was approved. Evidence is kept apart by question either way. */
    questionMoved: Boolean(a?.rubric && publishedQuestion && rubricOf(publishedQuestion) !== a.rubric),
    canApprove: mayApprove(db, actor, c?.steward ?? ""),
    character: c ? { id: c.id, name: c.name, revision: c.revision, steward: c.steward } : null,
    characters: (
      db.prepare("SELECT c.id, c.name, p.revision FROM character_profiles p JOIN characters c ON c.id = p.character_id ORDER BY c.name").all() as {
        id: string;
        name: string;
        revision: number;
      }[]
    ).map((x) => ({
      id: x.id,
      name: x.name,
      approved: x.revision > 0,
      episodes: eps.filter((e) => e.status === "approved" && (JSON.parse(e.people) as { characterId: string }[]).some((p) => p.characterId === x.id)).length,
    })),
    episodes: eps.map((e) => ({
      id: e.id,
      title: e.title,
      whenLabel: e.when_label,
      seq: e.seq,
      approved: e.status === "approved",
      people: (JSON.parse(e.people) as { characterId: string }[]).map((p) => p.characterId),
    })),
    guides,
    first: ctx.first,
    second: ctx.second,
    course: ctx.toGuide
      ? { id: ctx.toGuide.id, slug: ctx.toGuide.slug, title: ctx.toGuide.title, status: ctx.toGuide.status, published: Boolean(ctx.target?.published) }
      : null,
    earlier: ctx.fromGuide ? { id: ctx.fromGuide.id, title: ctx.fromGuide.title, status: ctx.fromGuide.status } : null,
    blocks,
    map,
    problems,
    theme: theme
      ? {
          id: theme.id,
          title: theme.title,
          desired: r?.desired || (JSON.parse(theme.diagnosis) as { desired?: string }).desired || "",
          barrier: r?.barrierSummary ?? "",
          learning: r?.learning ?? "",
          measure: r?.measure?.name ?? "",
          reviewOn: r?.reviewOn ?? "",
          decided: response?.status === "approved",
        }
      : null,
    themes: (db.prepare("SELECT id, title FROM pd_themes WHERE merged_into IS NULL ORDER BY title").all() as { id: string; title: string }[]) ?? [],
    note: {
      id: note?.id ?? "",
      status: (note?.status ?? "draft") as NoteStatus,
      data: noteData,
      changed: Boolean(live) && !sameJson(live, noteData),
      problems: noteProblems(noteData),
      releasedAt: note?.released_at ?? null,
      withdrawnReason: note?.withdrawn_reason ?? "",
      deliveries: deliveries
        ? { eligible: deliveries.eligible, delivered: deliveries.delivered ?? 0, opened: deliveries.opened ?? 0, dismissed: deliveries.dismissed ?? 0 }
        : null,
    },
    /** What the Hub's own records show on the return's question so far. Never a work result. */
    evidence:
      row.to_guide && row.to_block
        ? transferEvidence(
            db,
            { fromGuide: row.from_guide, fromBlock: row.from_block, toGuide: row.to_guide, toPage: row.to_page, toBlock: row.to_block },
            monthWindow("2000-01", now.toISOString().slice(0, 7)),
          )
        : null,
    reportLink: row.theme_id ? `/admin/signal-room/${row.theme_id}#learning` : null,
  };
}
export type ReturnDetail = ReturnType<typeof returnDetail>;

/** One change at a time. Editing never touches what learners have: that only moves on approval or withdrawal. */
export function livingAction(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensureLiving(db, now);
  const at = now.toISOString();
  const need = () => {
    const row = returnRow(db, input.id);
    if (!row) throw new HttpError(404, "That return isn’t here.");
    return row;
  };
  // The pilot makes a course, which opens its own transaction: it can't run inside this one.
  if (input.action === "pilot") return createReturnPilot(db, actor, now);
  // Saving a course draft opens its own transaction too.
  if (input.action === "apply-question") return applyQuestion(db, actor, need(), input.question, now);
  return tx(db, () => {
    switch (input.action) {
      case "create": {
        const title = str(input.title, 120);
        if (title.length < 4) throw new HttpError(400, "Give the return a working title.");
        const id = newId("ret");
        const data = emptyReturn();
        const themeId = idOf(input.themeId);
        const theme = themeId ? (db.prepare("SELECT diagnosis FROM pd_themes WHERE id = ?").get(themeId) as { diagnosis: string } | undefined) : undefined;
        if (theme) {
          // Only what the response decision already says: the behaviour and how sure anyone is about the barrier.
          const resp = db.prepare("SELECT data FROM pd_responses WHERE theme_id = ?").get(themeId) as { data: string } | undefined;
          const r = resp ? (JSON.parse(resp.data) as { desired?: string; barrierSummary?: string }) : {};
          data.behaviour = (r.desired || (JSON.parse(theme.diagnosis) as { desired?: string }).desired || "").slice(0, 400);
          data.barrier = (r.barrierSummary ?? "").slice(0, 400);
        }
        db.prepare(
          "INSERT INTO story_returns (id, title, character_id, theme_id, data, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(id, title, idOf(input.characterId), theme ? themeId : "", JSON.stringify(data), actor.id, at, at);
        return { id };
      }
      case "save": {
        const row = need();
        const title = input.title === undefined ? row.title : str(input.title, 120);
        if (title.length < 4) throw new HttpError(400, "Give the return a working title.");
        const pick = (k: keyof ReturnRow, v: unknown) => (v === undefined ? (row[k] as string) : idOf(v));
        db.prepare(
          `UPDATE story_returns SET title = ?, character_id = ?, theme_id = ?, from_episode = ?, from_guide = ?, from_page = ?, from_block = ?,
             to_episode = ?, to_guide = ?, to_page = ?, to_block = ?, owner = ?, review_on = ?, data = ?, updated_at = ? WHERE id = ?`,
        ).run(
          title,
          pick("character_id", input.characterId),
          pick("theme_id", input.themeId),
          pick("from_episode", input.fromEpisode),
          pick("from_guide", input.fromGuide),
          pick("from_page", input.fromPage),
          pick("from_block", input.fromBlock),
          pick("to_episode", input.toEpisode),
          pick("to_guide", input.toGuide),
          pick("to_page", input.toPage),
          pick("to_block", input.toBlock),
          input.owner === undefined ? row.owner : str(input.owner, 120),
          input.reviewOn === undefined ? row.review_on : day(input.reviewOn),
          input.data === undefined ? row.data : JSON.stringify(cleanReturn(input.data)),
          at,
          row.id,
        );
        return { id: row.id };
      }
      case "approve": {
        const row = need();
        const data = dataOf(row);
        const ctx = contextOf(db, row);
        const c = character(db, row.character_id);
        if (!mayApprove(db, actor, c?.steward ?? ""))
          throw new HttpError(403, `Only ${c?.steward ?? "the steward"} or a superadmin can approve a return for this character.`);
        const { blocking } = returnProblems(data, ctx);
        if (blocking.length) throw Object.assign(new HttpError(400, `Not yet. ${blocking.join(" ")}`), { problems: blocking });
        if (!row.owner.trim() || !row.review_on) throw new HttpError(400, "Name an owner and set the date this return will be reviewed.");
        const snapshot: Approved = {
          data,
          character: c ? { id: c.id, revision: c.revision } : null,
          link: linkOf(row),
          rubric: ctx.second ? rubricOf(ctx.second) : "",
          at,
        };
        db.prepare("UPDATE story_returns SET status = 'approved', approved = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE id = ?").run(
          JSON.stringify(snapshot),
          actor.id,
          at,
          at,
          row.id,
        );
        audit(db, {
          actor: actor.id,
          event: "living.return_approved",
          entity: `return:${row.id}`,
          next: { character: snapshot.character, toEpisode: row.to_episode, rubric: snapshot.rubric, reviewOn: row.review_on },
          at: now,
        });
        return { id: row.id };
      }
      case "withdraw": {
        const row = need();
        const reason = str(input.reason, 400);
        if (reason.length < 10) throw new HttpError(400, "Say why it’s being withdrawn, in a sentence.");
        db.prepare("UPDATE story_returns SET status = 'withdrawn', updated_at = ? WHERE id = ?").run(at, row.id);
        // Its note goes with it: the invitation is taken back, and the Inbox line with it.
        for (const n of db.prepare("SELECT id FROM field_notes WHERE return_id = ? AND status = 'live'").all(row.id) as { id: string }[])
          withdrawNote(db, n.id, reason, at);
        audit(db, { actor: actor.id, event: "living.return_withdrawn", entity: `return:${row.id}`, reason, at: now });
        return { id: row.id };
      }
      case "reopen": {
        const row = need();
        if (row.status !== "withdrawn") throw new HttpError(400, "Only a withdrawn return can be reopened as a draft.");
        db.prepare("UPDATE story_returns SET status = 'draft', updated_at = ? WHERE id = ?").run(at, row.id);
        return { id: row.id };
      }
      case "save-note": {
        const row = need();
        const data = cleanNote(input.data);
        const had = noteFor(db, row.id);
        if (had) db.prepare("UPDATE field_notes SET data = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(data), at, had.id);
        else
          db.prepare("INSERT INTO field_notes (id, return_id, data, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
            newId("note"),
            row.id,
            JSON.stringify(data),
            actor.id,
            at,
            at,
          );
        return { id: row.id };
      }
      case "release-note": {
        const row = need();
        const note = noteFor(db, row.id);
        if (!note) throw new HttpError(400, "Write the note first.");
        const data = cleanNote(JSON.parse(note.data));
        const problems = noteProblems(data);
        const a = approvedOf(row);
        // A note is an invitation to something that is there: approved, published, and reachable by the people it goes to.
        if (!a) problems.push("Approve the return first.");
        const g = guideRow(db, a?.link.to_guide ?? "");
        if (a && !(g && g.status === "published" && pagesOf(publishedDoc(db, g)).some((p) => p.id === a.link.to_page)))
          problems.push("Publish the page the note opens first.");
        if (a && !(a.link.from_guide && a.link.from_block)) problems.push("Link the earlier activity: it’s what makes someone eligible.");
        if (g && data.audience.length) {
          const allowed = JSON.parse(g.audience) as string[];
          const shut = data.audience.filter((x) => allowed.length && !allowed.includes(x));
          if (shut.length) problems.push("The note goes to people the course isn’t shared with. Narrow the note’s audience or widen the course’s.");
        }
        if (problems.length) throw Object.assign(new HttpError(400, `Not yet. ${problems.join(" ")}`), { problems });
        db.prepare(
          "UPDATE field_notes SET status = 'live', live = ?, released_by = ?, released_at = ?, withdrawn_at = NULL, withdrawn_reason = '', updated_at = ? WHERE id = ?",
        ).run(JSON.stringify(data), actor.id, at, at, note.id);
        audit(db, {
          actor: actor.id,
          event: "living.note_released",
          entity: `note:${note.id}`,
          next: { audience: data.audience, delayDays: data.delayDays, channel: data.channel, optional: true },
          at: now,
        });
        return { id: row.id };
      }
      case "withdraw-note": {
        const row = need();
        const note = noteFor(db, row.id);
        if (!note || note.status !== "live") throw new HttpError(400, "This note isn’t released.");
        const reason = str(input.reason, 400);
        if (reason.length < 10) throw new HttpError(400, "Say why it’s being withdrawn, in a sentence.");
        withdrawNote(db, note.id, reason, at);
        audit(db, { actor: actor.id, event: "living.note_withdrawn", entity: `note:${note.id}`, reason, at: now });
        return { id: row.id };
      }
      case "delete": {
        const row = need();
        const note = noteFor(db, row.id);
        const sent = note ? (db.prepare("SELECT COUNT(*) AS n FROM field_note_deliveries WHERE note_id = ?").get(note.id) as { n: number }).n : 0;
        if (row.approved_at || sent) throw new HttpError(400, "A return that has been approved or sent is kept. Withdraw it instead.");
        if (note) db.prepare("DELETE FROM field_notes WHERE id = ?").run(note.id);
        db.prepare("DELETE FROM story_returns WHERE id = ?").run(row.id);
        return { deleted: true };
      }
      default:
        throw new HttpError(400, "Unknown action.");
    }
  });
}

/**
  Puts a question an author has chosen to take into the return page's draft: the transfer activity's wording, its
  options and their feedback, and nothing else on the page. The course's draft changes; what learners are reading
  doesn't until it is reviewed and published in the usual way.
*/
function applyQuestion(db: Db, actor: User, row: ReturnRow, question: unknown, now: Date) {
  const q = (question && typeof question === "object" ? question : {}) as { context?: unknown; prompt?: unknown; choices?: unknown };
  const prompt = str(q.prompt, 400);
  const choices = (Array.isArray(q.choices) ? q.choices : []).slice(0, 4).map((c, i) => {
    const x = (c && typeof c === "object" ? c : {}) as { text?: unknown; verdict?: unknown; feedback?: unknown };
    const verdict = x.verdict === "best" || x.verdict === "risky" ? x.verdict : "acceptable";
    return { id: `option-${i + 1}`, text: str(x.text, 280), verdict, feedback: str(x.feedback, 500) };
  });
  if (
    prompt.length < 15 ||
    choices.length < 3 ||
    choices.some((c) => c.text.length < 10 || c.feedback.length < 20) ||
    choices.filter((c) => c.verdict === "best").length !== 1
  )
    throw new HttpError(400, "A question needs its wording, three or four options with feedback, and exactly one best answer.");
  if (!row.to_guide || !row.to_block) throw new HttpError(400, "Choose the page and the activity that asks the transfer question first.");
  const doc = authorGuide(db, actor, row.to_guide).doc;
  let found = false;
  for (const page of doc.pages)
    for (const section of page.sections)
      section.blocks = section.blocks.map((b) => {
        if (page.id !== row.to_page || b.id !== row.to_block || b.type !== "decision") return b;
        found = true;
        const context = str(q.context, 240);
        return { ...b, prompt, ...(context ? { context } : {}), choices } as typeof b;
      });
  if (!found) throw new HttpError(400, "That activity isn’t a decision question on the return page any more.");
  saveGuideDraft(db, actor, row.to_guide, { doc }, now);
  audit(db, { actor: actor.id, event: "living.question_applied", entity: `return:${row.id}`, next: { guide: row.to_guide, block: row.to_block }, at: now });
  return { id: row.id };
}

function withdrawNote(db: Db, noteId: string, reason: string, at: string) {
  db.prepare("UPDATE field_notes SET status = 'withdrawn', withdrawn_at = ?, withdrawn_reason = ?, updated_at = ? WHERE id = ?").run(at, reason, at, noteId);
  db.prepare("DELETE FROM notifications WHERE source = ?").run(sourceOf(noteId));
}

/**
  Adds the Dot pilot as drafts: the one-page course "Dot at the markets", its return link, its Field Note, and
  Dot's possible response as an unapproved story moment. The earlier activity is linked if this Hub has the "Dot
  and the rose garden" course. Nothing is approved, published, released or sent.
*/
export function createReturnPilot(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  ensureLiving(db, now);
  if (returnRow(db, RETURN_PILOT.id)) throw new HttpError(409, "The Dot return pilot is already here.");
  const choices = relayChoices(db, actor, now);
  const current = new Map(choices.people.map((p) => [p.id, p.revision]));
  const doc: GuideDoc = {
    ...RETURN_PILOT_DOC,
    relay: choices.ava ? RETURN_PILOT_DOC.relay : undefined,
    pages: RETURN_PILOT_DOC.pages.map((p) => ({
      ...p,
      relay:
        choices.ava && p.relay
          ? {
              ...p.relay,
              characters: p.relay.characters.filter((c) => current.has(c.id)).map((c) => ({ id: c.id, revision: current.get(c.id)! })),
              episode: choices.episodes.some((e) => e.id === p.relay!.episode) ? p.relay.episode : "",
            }
          : undefined,
    })),
  };
  const made = createGuide(
    db,
    actor,
    { title: RETURN_PILOT.title, standfirst: RETURN_PILOT.standfirst, audience: [...RETURN_PILOT.audience], completion: RETURN_PILOT.completion, doc },
    now,
  );
  // The earlier decision, if this Hub has the rose garden course (most recently updated first).
  const first = (
    db
      .prepare(
        "SELECT id, slug, title, status, audience, revision_id, draft FROM magazine_guides WHERE status != 'archived' ORDER BY (status = 'published') DESC, updated_at DESC",
      )
      .all() as GuideRow[]
  ).find((g) => g.id !== made.id && questionOf(findBlock(g.draft, RETURN_PILOT.fromPage, RETURN_PILOT.fromBlock).block));
  const eps = new Set(episodes(db).map((e) => e.id));
  const at = now.toISOString();
  tx(db, () => {
    db.prepare(
      `INSERT INTO story_returns (id, title, character_id, theme_id, from_episode, from_guide, from_page, from_block, to_episode, to_guide, to_page, to_block,
         data, owner, review_on, sample, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', 1, ?, ?, ?)`,
    ).run(
      RETURN_PILOT.id,
      RETURN_PILOT.title,
      character(db, RETURN_PILOT.characterId) ? RETURN_PILOT.characterId : "",
      db.prepare("SELECT 1 FROM pd_themes WHERE id = ?").get(RETURN_PILOT.themeId) ? RETURN_PILOT.themeId : "",
      eps.has(RETURN_PILOT.fromEpisode) ? RETURN_PILOT.fromEpisode : "",
      first?.id ?? "",
      first ? RETURN_PILOT.fromPage : "",
      first ? RETURN_PILOT.fromBlock : "",
      eps.has(RETURN_PILOT.toEpisode) ? RETURN_PILOT.toEpisode : "",
      made.id,
      RETURN_PILOT.toPage,
      RETURN_PILOT.toBlock,
      JSON.stringify(RETURN_PILOT_DATA),
      actor.id,
      at,
      at,
    );
    db.prepare("INSERT INTO field_notes (id, return_id, data, sample, created_by, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)").run(
      newId("note"),
      RETURN_PILOT.id,
      JSON.stringify(RETURN_PILOT_NOTE),
      actor.id,
      at,
      at,
    );
    // Dot's own words afterwards: a draft a steward approves and an author places. Not shared history.
    if (character(db, RETURN_PILOT.characterId))
      db.prepare(
        "INSERT OR IGNORE INTO story_moments (id, kind, speaker_id, featured_id, episode_id, plan_id, draft, status, revision, sample, created_by, created_at, updated_at) VALUES (?, 'person_response', ?, '', ?, '', ?, 'draft', 0, 1, ?, ?, ?)",
      ).run(
        RETURN_PILOT_MOMENT.id,
        RETURN_PILOT.characterId,
        eps.has(RETURN_PILOT.toEpisode) ? RETURN_PILOT.toEpisode : "",
        JSON.stringify(RETURN_PILOT_MOMENT.data),
        actor.id,
        at,
        at,
      );
  });
  return { id: RETURN_PILOT.id, guideId: made.id, earlier: first ? first.title : null };
}

// ---------------------------------------------------------------------------------------------
// For learners
// ---------------------------------------------------------------------------------------------

/** A person's first answer on the earlier decision, if their record is there and they may still open that course. */
function earlierAnswer(db: Db, user: User, link: Approved["link"]) {
  if (!link.from_guide || !link.from_block) return null;
  const g = guideRow(db, link.from_guide);
  if (!g || g.status === "archived" || !canRead(user, g)) return null;
  const a = db
    .prepare(
      "SELECT json_extract(detail, '$.choice') AS choice, at FROM magazine_events WHERE user_id = ? AND guide_id = ? AND block_id = ? AND event = 'decision.answered' ORDER BY at, id LIMIT 1",
    )
    .get(user.id, link.from_guide, link.from_block) as { choice: string; at: string } | undefined;
  return a ? { choice: a.choice, at: a.at, guide: g } : null;
}

/**
  What opens a return page for this learner: where we left the person, what has changed and what to decide, from
  the approved copy. A line about their own earlier answer is added only for them, only if that record is still
  theirs to see. Someone with no earlier answer gets the same page without it. Null when the page isn't a return.
*/
export function returnFor(db: Db, user: User, input: { guide?: unknown; page?: unknown; preview?: unknown; prior?: unknown }, now = new Date()) {
  ensureLiving(db, now);
  const slug = str(input.guide, 120);
  const pageId = idOf(input.page);
  const g =
    (db.prepare("SELECT id, slug, title, status, audience, revision_id, draft FROM magazine_guides WHERE slug = ? OR id = ?").get(slug, slug) as
      GuideRow | undefined) ?? undefined;
  if (!g || !pageId) return null;
  const preview = input.preview === true && canAuthor(user);
  if (!preview && !readable(user, g)) return null;
  const row = db
    .prepare(
      `SELECT * FROM story_returns WHERE to_guide = ? AND to_page = ? AND status ${preview ? "!= 'withdrawn'" : "= 'approved'"} ORDER BY approved_at DESC, updated_at DESC LIMIT 1`,
    )
    .get(g.id, pageId) as ReturnRow | undefined;
  if (!row) return null;
  // A preview shows the author's working copy; a learner gets what was approved.
  const a = preview ? { data: dataOf(row), link: linkOf(row), character: null, rubric: "", at: "" } : approvedOf(row);
  if (!a) return null;
  const c = character(db, row.character_id);
  const who = mayMeet(user, c) ? c : null;
  const before = preview ? null : earlierAnswer(db, user, a.link);
  const previewLine = preview && typeof input.prior === "string" ? (a.data.reflections[input.prior] ?? null) : null;
  const earlierGuide = guideRow(db, a.link.from_guide);
  const eps = episodes(db);
  const fromEp = eps.find((e) => e.id === a.link.from_episode && e.status === "approved");
  const note = noteFor(db, row.id);
  return {
    id: row.id,
    preview,
    character: who ? { id: who.id, name: who.name, portrait: who.portrait } : null,
    whenLabel: eps.find((e) => e.id === a.link.to_episode)?.when_label ?? "",
    recap: a.data.recap,
    changed: a.data.changed,
    role: a.data.role,
    decide: a.data.decide,
    /** Theirs alone: about what they chose last time. Never sent for anyone else, and never part of the shared story. */
    mine: before ? (a.data.reflections[before.choice] ?? null) : previewLine,
    returning: Boolean(before) || Boolean(previewLine),
    earlier:
      readable(user, earlierGuide) && fromEp
        ? { title: fromEp.title, href: `/magazine/${earlierGuide.slug}${a.link.from_page ? `/${a.link.from_page}` : ""}` }
        : null,
    /** For "View their story": the episode this page sits at, so nothing later is listed unasked. */
    episode: a.link.to_episode,
    transferBlock: a.link.to_block,
    revisionId: g.revision_id ?? "",
    noteId: note?.id ?? "",
  };
}
export type ReturnOpening = NonNullable<ReturnType<typeof returnFor>>;

type Live = { note: NoteRow; data: NoteData; row: ReturnRow; a: Approved; guide: GuideRow };
/** Released notes whose return is approved and whose page this person can open now. Anything else is suppressed. */
function liveNotes(db: Db, user: User): Live[] {
  const out: Live[] = [];
  for (const note of db.prepare("SELECT * FROM field_notes WHERE status = 'live'").all() as NoteRow[]) {
    const row = returnRow(db, note.return_id);
    const a = row && approvedOf(row);
    if (!row || !a) continue;
    const data = cleanNote(JSON.parse(note.live));
    const g = guideRow(db, a.link.to_guide);
    if (!readable(user, g)) continue;
    if (data.audience.length && !data.audience.includes(user.audience)) continue;
    if (!pagesOf(publishedDoc(db, g)).some((p) => p.id === a.link.to_page)) continue;
    out.push({ note, data, row, a, guide: g });
  }
  return out;
}
const deliveryOf = (r: DeliveryRow): Delivery => ({
  eligibleAt: r.eligible_at,
  dueAt: r.due_at,
  deliveredAt: r.delivered_at,
  openedAt: r.opened_at,
  dismissedAt: r.dismissed_at,
  snoozedUntil: r.snoozed_until,
});
const deliveryRow = (db: Db, noteId: string, userId: string) =>
  db.prepare("SELECT * FROM field_note_deliveries WHERE note_id = ? AND user_id = ?").get(noteId, userId) as DeliveryRow | undefined;

/**
  Brings one person's Field Notes up to date: works out what they have become eligible for, delivers what has
  fallen due (within the cap), and takes back anything that is no longer theirs to open. Safe to run on every page
  load: a delivery row can only be made once, and each step checks what is already there.
*/
function syncNotes(db: Db, user: User, now: Date) {
  const at = now.toISOString();
  const live = liveNotes(db, user);
  const liveIds = new Set(live.map((l) => l.note.id));
  // Withdrawn, unpublished, or no longer for this person: the Inbox line goes. Their record of it stays.
  for (const d of db.prepare("SELECT note_id FROM field_note_deliveries WHERE user_id = ? AND delivered_at IS NOT NULL").all(user.id) as { note_id: string }[])
    if (!liveIds.has(d.note_id)) db.prepare("DELETE FROM notifications WHERE user_id = ? AND source = ?").run(user.id, sourceOf(d.note_id));
  for (const l of live) {
    let d = deliveryRow(db, l.note.id, user.id);
    if (!d) {
      const before = earlierAnswer(db, user, l.a.link);
      // Not answered the earlier decision: not eligible yet. The delay runs from when they first answered it.
      if (!before) continue;
      db.prepare("INSERT OR IGNORE INTO field_note_deliveries (note_id, user_id, eligible_at, due_at) VALUES (?, ?, ?, ?)").run(
        l.note.id,
        user.id,
        before.at,
        addDays(before.at, l.data.delayDays),
      );
      record(db, user, "field_note_eligible", { note: l.note.id, ret: l.row.id, guide: l.guide.id, key: `eligible:${l.note.id}`, at: before.at }, now);
      d = deliveryRow(db, l.note.id, user.id)!;
    }
    if (!d.delivered_at) {
      if (d.due_at > at) continue;
      // Already been back and answered the return: there's nothing to invite them to.
      const answered = db
        .prepare("SELECT 1 FROM magazine_events WHERE user_id = ? AND guide_id = ? AND block_id = ? AND event = 'decision.answered' LIMIT 1")
        .get(user.id, l.a.link.to_guide, l.a.link.to_block);
      if (answered) continue;
      const earlier = (
        db.prepare("SELECT delivered_at FROM field_note_deliveries WHERE user_id = ? AND delivered_at IS NOT NULL").all(user.id) as { delivered_at: string }[]
      ).map((r) => r.delivered_at);
      if (!capAllows(earlier, now)) continue;
      // Only a row that is still undelivered is delivered: a second request arriving at the same moment changes nothing.
      const done = db
        .prepare("UPDATE field_note_deliveries SET delivered_at = ?, target_revision = ? WHERE note_id = ? AND user_id = ? AND delivered_at IS NULL")
        .run(at, l.guide.revision_id ?? "", l.note.id, user.id);
      if (!done.changes) continue;
      record(
        db,
        user,
        "field_note_delivered",
        { note: l.note.id, ret: l.row.id, guide: l.guide.id, revision: l.guide.revision_id ?? "", key: `delivered:${l.note.id}` },
        now,
      );
      d = deliveryRow(db, l.note.id, user.id)!;
    }
    // In the Inbox while it's new. One per person per note, however often this runs.
    if (noteState(deliveryOf(d), now, l.data.expiresDays) === "new") {
      const who = character(db, l.row.character_id);
      notify(
        db,
        user.id,
        {
          kind: "update",
          category: "Field note from Ava",
          title: reasonText(l.data.reason, mayMeet(user, who) ? who!.name : ""),
          body: l.data.hook,
          href: `/field-notes/${l.note.id}`,
          source: sourceOf(l.note.id),
        },
        new Date(d.delivered_at!),
      );
    }
  }
  return live;
}

/**
  A learner's Field Notes: the ones that have arrived and are still theirs to open, newest first. Opening, snoozing
  or dismissing a note never changes a course, a completion or an attempt.
*/
export function fieldNotes(db: Db, user: User, now = new Date()) {
  ensureLiving(db, now);
  const live = syncNotes(db, user, now);
  const eps = new Map(episodes(db).map((e) => [e.id, e]));
  const items = live.flatMap((l) => {
    const d = deliveryRow(db, l.note.id, user.id);
    if (!d?.delivered_at) return [];
    const state = noteState(deliveryOf(d), now, l.data.expiresDays);
    if (state !== "new" && state !== "read") return [];
    const who = character(db, l.row.character_id);
    const met = mayMeet(user, who) ? who : null;
    const earlierGuide = guideRow(db, l.a.link.from_guide);
    const fromEp = eps.get(l.a.link.from_episode);
    const published = (db.prepare("SELECT published_at FROM magazine_revisions WHERE id = ?").get(l.guide.revision_id) as { published_at: string } | undefined)
      ?.published_at;
    return [
      {
        id: l.note.id,
        state,
        reason: reasonText(l.data.reason, met?.name ?? ""),
        hook: l.data.hook,
        character: met ? { id: met.id, name: met.name, portrait: met.portrait } : null,
        title: l.guide.title,
        minutes: l.data.minutes,
        publishedOn: published ?? "",
        optional: true as const,
        href: `/field-notes/${l.note.id}`,
        earlier: readable(user, earlierGuide) && fromEp?.status === "approved" ? { title: fromEp.title, href: `/magazine/${earlierGuide.slug}` } : null,
        deliveredAt: d.delivered_at,
      },
    ];
  });
  items.sort((a, b) => Number(a.state === "read") - Number(b.state === "read") || b.deliveredAt.localeCompare(a.deliveredAt));
  return { notes: items, unread: items.filter((i) => i.state === "new").length };
}
export type FieldNotes = ReturnType<typeof fieldNotes>;
export type FieldNoteItem = FieldNotes["notes"][number];

/**
  Opens a note: checks again that it's this person's and that its page is still theirs to open, marks it read, and
  says where to go. A note that has been withdrawn, or whose page has gone, says so and points at the Magazine.
*/
export function openNote(db: Db, user: User, noteId: unknown, now = new Date()) {
  ensureLiving(db, now);
  const id = idOf(noteId);
  const d = id ? deliveryRow(db, id, user.id) : undefined;
  // Someone else's note, or one that never arrived, looks the same as no note at all.
  if (!d?.delivered_at) return { state: "none" as const, href: "/magazine" };
  const l = syncNotes(db, user, now).find((x) => x.note.id === id);
  if (!l) return { state: "unavailable" as const, href: "/magazine" };
  const at = now.toISOString();
  db.prepare("UPDATE field_note_deliveries SET opened_at = COALESCE(opened_at, ?), snoozed_until = NULL WHERE note_id = ? AND user_id = ?").run(
    at,
    id,
    user.id,
  );
  db.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ? AND source = ?").run(at, user.id, sourceOf(id));
  record(db, user, "field_note_opened", { note: id, ret: l.row.id, guide: l.guide.id, revision: l.guide.revision_id ?? "", key: `opened:${id}` }, now);
  return { state: "open" as const, href: `/magazine/${l.guide.slug}/${l.a.link.to_page}?note=${id}` };
}

/** Dismiss, snooze or bring back one of your own notes. */
export function noteAction(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureLiving(db, now);
  const id = idOf(input.id);
  const d = id ? deliveryRow(db, id, user.id) : undefined;
  if (!d?.delivered_at) throw new HttpError(404, "That note isn’t here.");
  const note = noteRow(db, id)!;
  const at = now.toISOString();
  const key = { note: id, ret: note.return_id };
  if (input.action === "dismiss") {
    db.prepare("UPDATE field_note_deliveries SET dismissed_at = COALESCE(dismissed_at, ?) WHERE note_id = ? AND user_id = ?").run(at, id, user.id);
    db.prepare("DELETE FROM notifications WHERE user_id = ? AND source = ?").run(user.id, sourceOf(id));
    record(db, user, "field_note_dismissed", { ...key, key: `dismissed:${id}` }, now);
  } else if (input.action === "snooze") {
    const until = addDays(at, NOTE_DEFAULTS.snoozeDays);
    db.prepare("UPDATE field_note_deliveries SET snoozed_until = ? WHERE note_id = ? AND user_id = ?").run(until, id, user.id);
    db.prepare("DELETE FROM notifications WHERE user_id = ? AND source = ?").run(user.id, sourceOf(id));
    record(db, user, "field_note_snoozed", { ...key, key: `snoozed:${id}:${at.slice(0, 10)}` }, now);
    return { ok: true, until };
  } else if (input.action === "restore") {
    db.prepare("UPDATE field_note_deliveries SET dismissed_at = NULL, snoozed_until = NULL WHERE note_id = ? AND user_id = ?").run(id, user.id);
  } else throw new HttpError(400, "Unknown action.");
  return { ok: true };
}

/** What a learner's page reports: a return opened, their story followed, the transfer activity reached. Once each. */
export function recordLivingEvent(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureLiving(db, now);
  const event = LIVING_CLIENT_EVENTS.find((e) => e === input.event);
  const row = returnRow(db, input.returnId);
  const a = row && approvedOf(row);
  if (!event || !row || !a) throw new HttpError(400, "Unknown event.");
  const g = guideRow(db, a.link.to_guide);
  if (!readable(user, g)) throw new HttpError(404, "That page isn’t here.");
  const noteId = idOf(input.noteId);
  // An author's own reading of a published page is counted like anyone's; a draft preview never reaches here.
  return {
    recorded: record(
      db,
      user,
      event,
      {
        ret: row.id,
        guide: g.id,
        revision: g.revision_id ?? "",
        note: noteId && deliveryRow(db, noteId, user.id) ? noteId : "",
        detail: event === "return_episode_opened" ? (earlierAnswer(db, user, a.link) ? "returning" : "new") : "",
        key: `${event}:${row.id}:${g.revision_id}`,
      },
      now,
    ),
  };
}

/**
  After a decision is answered (the Magazine has already recorded the answer itself): if it was a return's transfer
  question, note that a transfer response was submitted. The answer and its marking stay in the Magazine's records;
  this holds only that it happened, once per attempt.
*/
export function transferSubmitted(db: Db, user: User, guideId: string, blockId: unknown, attempt: unknown, now: Date) {
  if (typeof blockId !== "string") return;
  ensureLiving(db, now);
  // The reader posts the course's id; a slug is accepted too.
  const course = db.prepare("SELECT id FROM magazine_guides WHERE id = ? OR slug = ?").get(guideId, guideId) as { id: string } | undefined;
  if (!course) return;
  const row = db.prepare("SELECT * FROM story_returns WHERE to_guide = ? AND to_block = ? AND status = 'approved' LIMIT 1").get(course.id, blockId) as
    ReturnRow | undefined;
  const g = row && guideRow(db, course.id);
  if (!row || !g) return;
  record(
    db,
    user,
    "transfer_response_submitted",
    {
      ret: row.id,
      guide: g.id,
      revision: g.revision_id ?? "",
      detail: earlierAnswer(db, user, linkOf(row)) ? "returning" : "new",
      key: `submitted:${row.id}:${g.revision_id}:${Number(attempt) || 1}`,
    },
    now,
  );
}

/** For the register and the Signal Room: each return for a theme, its note, and how far the invitation has travelled. */
export function returnsForTheme(db: Db, themeId: string) {
  ensureLivingTables(db);
  const rows = db.prepare("SELECT * FROM story_returns WHERE theme_id = ? ORDER BY created_at").all(themeId) as ReturnRow[];
  return rows.map((r) => {
    const note = noteFor(db, r.id);
    const data = dataOf(r);
    const a = approvedOf(r);
    const g = guideRow(db, r.to_guide);
    const revision = g?.revision_id
      ? (db.prepare("SELECT number, published_at FROM magazine_revisions WHERE id = ?").get(g.revision_id) as
          { number: number; published_at: string } | undefined)
      : undefined;
    const d = note
      ? (db
          .prepare(
            "SELECT COUNT(*) AS eligible, SUM(delivered_at IS NOT NULL) AS delivered, SUM(opened_at IS NOT NULL) AS opened, SUM(dismissed_at IS NOT NULL) AS dismissed FROM field_note_deliveries WHERE note_id = ?",
          )
          .get(note.id) as { eligible: number; delivered: number | null; opened: number | null; dismissed: number | null })
      : null;
    const who = character(db, r.character_id);
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      approvedAt: a?.at ?? "",
      character: who?.name ?? "",
      owner: r.owner,
      reviewOn: r.review_on,
      link: linkOf(r),
      principle: data.principle,
      cues: data.cues,
      mistake: data.mistake,
      transfer: data.transfer,
      placements: data.placements,
      course: g
        ? { id: g.id, title: g.title, slug: g.slug, status: g.status, version: revision?.number ?? null, publishedAt: revision?.published_at ?? "" }
        : null,
      earlier: guideRow(db, r.from_guide) ? { id: r.from_guide, title: guideRow(db, r.from_guide)!.title } : null,
      note: note
        ? {
            status: note.status,
            releasedAt: note.released_at ?? "",
            withdrawnAt: note.withdrawn_at ?? "",
            eligible: d?.eligible ?? 0,
            delivered: d?.delivered ?? 0,
            opened: d?.opened ?? 0,
            dismissed: d?.dismissed ?? 0,
          }
        : null,
    };
  });
}
export type ThemeReturn = ReturnType<typeof returnsForTheme>[number];
