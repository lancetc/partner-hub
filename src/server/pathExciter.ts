import "server-only";
import { lessons } from "@/content/lessons";
import { audit, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { catalogueInfo, chaptersFor, getRow, overview, slugsFor } from "./learningPaths";
import { ensureExciterStore, storedExciter, writeExciter } from "./pathExciterStore";
import { markOwnerJobsAttached, ownerJobs, queueOwnerAudio, retryOwnerJob, type NarrationJob } from "./narrationJobs";
import { hubSpeech, type SpeechEngine } from "./magazineNarration";
import { introListening, shareOf, SMALL_GROUP, type IntroAudioRow } from "./narrationStats";
import { askForJson } from "./claudeJson";
import { GENERATION_MODEL } from "./generate";
import { claudeConfigured, openaiJson, openaiReady, openaiTextModel } from "./openaiText";
import { readUpload } from "./uploads";
import { estimateWords } from "@/lib/wordTimings";
import {
  approveForPublication,
  attachRecording,
  editWorking,
  formulaicOpening,
  INTRO_AUDIO_ACTIONS,
  INTRO_AUDIO_SPEEDS,
  playable,
  secondsFor,
  spoilerIn,
  textHash,
  wordCount,
  workingCopy,
  type IntroAudioAction,
  type NarrationState,
} from "@/lib/magazineNarration";
import {
  EXCITER_AUDIO,
  EXCITER_TARGET,
  EXCITER_VOICE,
  EXCITER_WORDS,
  exciterForLearners,
  exciterOutdated,
  exciterOwner,
  exciterState,
  exciterWarnings,
  pathSnapshot,
  type Exciter,
  type ExciterAudio,
  type PathShape,
} from "@/lib/pathExciter";

/*
  The Discovery Exciter on the server (docs/discovery-exciter.md). Everything paid reuses the Magazine Audio
  Introductions: scripts are drafted by Claude (or OpenAI) like a Magazine introduction, audio is recorded by the shared
  background queue (server/narrationJobs, owner `learning_path:<id>`) in the Magazine Editorial Voice and kept as a hub
  upload, and listening is counted by the same rules (server/narrationStats). What's here is the path's side: reading the
  whole path for the prompt, keeping the Exciter (server/pathExciterStore), the author's actions, the Manager's rows,
  what learners get, and their events.

  Nothing here makes audio or calls AI unless an author asks: editing a script, approving it, a path changing, or a
  learner opening the page never does.
*/

// ---------------------------------------------------------------------------------------------
// The path as the Exciter sees it
// ---------------------------------------------------------------------------------------------

type CatalogueEntry = ReturnType<typeof catalogueInfo>[number];
/** The path's fields, its Topics in order and its chapters, for the snapshot and the prompt. */
function shapeOf(db: Db, pathId: string, cat: Map<string, CatalogueEntry> = catalogueMap(db)): PathShape & { slugs: string[] } {
  const row = getRow(db, pathId);
  const o = overview(row);
  const slugs = slugsFor(db, pathId);
  return {
    name: row.name,
    description: row.description ?? "",
    audience: row.audience ?? "",
    whoFor: o.whoFor,
    outcomes: o.outcomes,
    reward: o.reward,
    topics: slugs.map((s) => ({ slug: s, title: cat.get(s)?.title ?? s })),
    chapters: chaptersFor(db, pathId).map((c) => ({ title: c.title, stage: c.stage, description: c.description })),
    slugs,
  };
}
const catalogueMap = (db: Db) => new Map(catalogueInfo(db).map((l) => [l.slug, l]));

/** The snapshot of the path as it's saved now. */
export const pathSnapshotFor = (db: Db, pathId: string) => pathSnapshot(shapeOf(db, pathId));

// ---------------------------------------------------------------------------------------------
// Editing, keeping the published version until its replacement is approved
// ---------------------------------------------------------------------------------------------

/** editWorking for an Exciter: the change goes into `next` while learners hear the published one, and the path-wide settings stay. */
function editExciter(n: Exciter | undefined, fn: (w: Exciter | undefined) => Exciter | undefined): Exciter | undefined {
  const out = editWorking(n, EXCITER_AUDIO, fn) as Exciter | undefined;
  return out && keepSettings(n, out);
}
/** Visibility and the delivery note belong to the path's introduction, not to one version of it. */
const keepSettings = (from: Exciter | undefined, to: Exciter): Exciter => {
  const { hidden: _h, curious: _c, ...rest } = to;
  void _h;
  void _c;
  return { ...rest, ...(from?.hidden && { hidden: true as const }), ...(from?.curious && { curious: true as const }) };
};

/** Puts each finished recording with the script it was made from, for the author to approve. Returns the Exciter as it is now. */
function attachFinished(db: Db, pathId: string, jobs: NarrationJob[], now: Date): Exciter | undefined {
  let n = storedExciter(db, pathId);
  const done = jobs.filter((j) => j.target === EXCITER_TARGET && j.status === "done" && j.result && !j.attached).reverse();
  const attached: string[] = [];
  for (const j of done) {
    const rec: ExciterAudio = { ...j.result!, ...(j.delivery && { delivery: j.delivery }) };
    const next = attachRecording(n, rec, EXCITER_AUDIO) as Exciter | undefined;
    if (next === n || !next) continue;
    n = keepSettings(n, next);
    attached.push(j.id);
  }
  if (attached.length) {
    writeExciter(db, pathId, n, "system", now);
    markOwnerJobsAttached(db, exciterOwner(pathId), attached, now);
    for (const j of done.filter((x) => attached.includes(x.id))) j.attached = true;
  }
  return n;
}

const STATE_AUDIO: Partial<Record<NarrationState, string>> = { rerecord: "Doesn’t match the script", pending: "To approve", revoice: "Earlier voice" };
/** The recording's status, in the Manager's words. */
function audioStatus(w: Exciter | undefined, job: NarrationJob | null, state: NarrationState) {
  const forThis = job && w && job.scriptHash === textHash(w.script) && (!w.audio || w.audio.at < job.createdAt);
  if (forThis && job.status === "queued") return "Queued";
  if (forThis && job.status === "running") return "Generating";
  if (forThis && job.status === "failed") return "Failed";
  if (!w?.audio) return "None";
  return STATE_AUDIO[state] ?? (w.audio.provider === "upload" ? "Uploaded" : "Generated");
}

/** Everything the editor's Discovery Exciter section shows. */
export function exciterView(db: Db, actor: User, pathId: string, speech: SpeechEngine = hubSpeech) {
  requireAuthor(actor);
  const row = getRow(db, pathId);
  const jobs = ownerJobs(db, exciterOwner(pathId), EXCITER_VOICE, speech);
  const n = attachFinished(db, pathId, jobs.jobs, new Date());
  const snap = pathSnapshotFor(db, pathId);
  const w = workingCopy(n) as Exciter | undefined;
  const state = exciterState(w, snap);
  const job = jobs.jobs.find((j) => j.target === EXCITER_TARGET) ?? null;
  const words = w ? wordCount(w.script) : 0;
  return {
    pathId,
    description: row.description ?? "",
    exciter: n ?? null,
    working: w ?? null,
    /** Learners hear the published one now. */
    live: Boolean(exciterForLearners(n)),
    replacing: Boolean(n?.next && playable(n, EXCITER_AUDIO)),
    state,
    outdated: exciterOutdated(n, snap) || exciterOutdated(n?.next, snap),
    words,
    seconds: w?.audio && w.audio.scriptHash === textHash(w.script) ? w.audio.seconds : secondsFor(words),
    estimated: !(w?.audio && w.audio.scriptHash === textHash(w.script)),
    warnings: w ? exciterWarnings(w.script, row.description ?? "") : [],
    audioStatus: audioStatus(w, job, state),
    job,
    speech: jobs.speech,
    perHour: jobs.perHour,
    range: { min: EXCITER_WORDS.min, max: EXCITER_WORDS.max },
  };
}
export type ExciterView = ReturnType<typeof exciterView>;

const cleanScript = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").slice(0, 1200) : "");

/**
  An author's change to a path's Exciter. None of these makes audio or calls AI: "queue" (generate audio) needs
  `confirmed`, and drafting a script is its own request (draftExciters).
*/
export function exciterAction(
  db: Db,
  actor: User,
  pathId: string,
  input: { action?: unknown; script?: unknown; on?: unknown; src?: unknown; seconds?: unknown; confirmed?: unknown; fresh?: unknown; jobId?: unknown },
  now: Date,
  speech: SpeechEngine = hubSpeech,
) {
  requireAuthor(actor);
  getRow(db, pathId);
  ensureExciterStore(db);
  const n = storedExciter(db, pathId);
  const w = workingCopy(n) as Exciter | undefined;
  const live = playable(n, EXCITER_AUDIO);
  const save = (next: Exciter | undefined, event: string, detail?: object) => {
    writeExciter(db, pathId, next, actor.id, now);
    audit(db, { actor: actor.id, event: `learning_path.exciter_${event}`, entity: `learning_path:${pathId}`, next: { ...detail }, at: now });
  };
  const at = now.toISOString();
  switch (input.action) {
    case "save": {
      // The author's words. Editing never makes audio; in a replacement, audio of the old words goes (the published one stays).
      const script = cleanScript(input.script);
      if (!script.trim() && !w) throw new HttpError(400, "Write the script first.");
      save(
        editExciter(n, (x) => {
          const next: Exciter = { ...(x ?? { status: "draft" as const, version: 1 }), script, source: "author" };
          if (live && next.audio && next.audio.scriptHash !== textHash(script)) delete next.audio;
          return next;
        }),
        "edited",
        { words: wordCount(script) },
      );
      break;
    }
    case "approve-script": {
      if (!w?.script.trim()) throw new HttpError(400, "There’s no script to approve.");
      save(
        editExciter(n, (x) => x && { ...x, script: x.script.trim(), status: "approved", basis: pathSnapshotFor(db, pathId) }),
        "script_approved",
        { version: w.version ?? 1 },
      );
      break;
    }
    case "to-draft": {
      if (!w || w.status !== "approved" || w.audio) throw new HttpError(400, "Only an approved script without audio can go back to draft.");
      save(
        editExciter(n, (x) => x && { ...x, status: "draft" }),
        "script_to_draft",
      );
      break;
    }
    case "approve-audio": {
      // Approve for publication: learners hear this one from now on (the path has no separate publish step).
      if (!w || w.status !== "approved" || !w.audio || w.audio.scriptHash !== textHash(w.script))
        throw new HttpError(400, "There’s no audio to approve for these words.");
      const next = approveForPublication(n, actor.name, at) as Exciter | undefined;
      save(next && keepSettings(n, next), "published", { version: w.version ?? 1, seconds: w.audio.seconds, provider: w.audio.provider ?? null });
      break;
    }
    case "visible": {
      if (!n) throw new HttpError(400, "There’s no introduction to show or hide.");
      const { hidden: _h, ...rest } = n;
      void _h;
      save(input.on === true ? rest : { ...rest, hidden: true }, input.on === true ? "shown" : "hidden");
      break;
    }
    case "curious": {
      if (!n) throw new HttpError(400, "Write the script first.");
      const { curious: _c, ...rest } = n;
      void _c;
      save(input.on === true ? { ...rest, curious: true } : rest, "delivery", { curious: input.on === true });
      break;
    }
    case "still-fine": {
      // "It's still appropriate": a new snapshot of the path, without changing the script or the audio.
      if (!n) throw new HttpError(400, "There’s no introduction to confirm.");
      const basis = pathSnapshotFor(db, pathId);
      save({ ...n, ...(n.basis && { basis }), ...(n.next && { next: { ...n.next, ...(n.next.basis && { basis }) } }) }, "confirmed_current");
      break;
    }
    case "discard": {
      if (!n?.next) throw new HttpError(400, "There’s no replacement to discard.");
      save(
        editExciter(n, () => undefined),
        "replacement_discarded",
      );
      break;
    }
    case "upload": {
      // The author's own recording of these words, uploaded to the library first: it waits for approval like any other.
      if (!w?.script.trim()) throw new HttpError(400, "Write the script first: the recording should say it.");
      const src = typeof input.src === "string" ? input.src : "";
      const file = /^\/api\/uploads\/([0-9a-f-]{36}\.(mp3|m4a|wav|ogg|webm|aac))$/.exec(src)?.[1];
      const upload = file ? readUpload(db, file) : null;
      if (!upload || !upload.mime.startsWith("audio/")) throw new HttpError(400, "Upload the recording (an MP3) first.");
      const seconds = Math.max(0, Math.min(600, Math.round(Number(input.seconds) * 10) / 10 || 0));
      const rec: ExciterAudio = {
        src,
        seconds,
        words: estimateWords(w.script, seconds),
        scriptHash: textHash(w.script),
        voice: "upload",
        at,
        provider: "upload",
        pending: true,
      };
      save(
        editExciter(n, (x) => x && { ...x, status: "approved", ...(x.status !== "approved" && { basis: pathSnapshotFor(db, pathId) }), audio: rec }),
        "uploaded",
        { seconds },
      );
      break;
    }
    case "remove": {
      save(undefined, "removed");
      break;
    }
    case "queue": {
      const r = queueExciterAudio(db, actor, [pathId], { confirmed: input.confirmed, fresh: input.fresh }, now, speech);
      if (r.skipped.length) throw new HttpError(400, r.skipped[0].reason === "No script yet." ? "Write the script first." : "Approve the script first.");
      break;
    }
    case "retry":
      retryOwnerJob(db, actor, exciterOwner(pathId), input.jobId, now, speech);
      break;
    default:
      throw new HttpError(400, "Unknown action.");
  }
  return exciterView(db, actor, pathId, speech);
}

/**
  Asks for audio for paths' approved scripts, recorded in the background by the shared queue. Always a confirmed,
  paid action: the editor and the Manager show the estimated cost first, and the server refuses without `confirmed`.
  Paths without an approved script are skipped, with the reason.
*/
export function queueExciterAudio(
  db: Db,
  actor: User,
  pathIds: unknown,
  input: { confirmed?: unknown; fresh?: unknown },
  now: Date,
  speech: SpeechEngine = hubSpeech,
) {
  requireAuthor(actor);
  const ids = idsOf(db, pathIds);
  if (input.confirmed !== true) throw new HttpError(400, "Confirm the estimated cost before generating audio.");
  const queued: { pathId: string; job: NarrationJob }[] = [];
  const skipped: { pathId: string; reason: string }[] = [];
  for (const id of ids) {
    const n = storedExciter(db, id);
    const w = workingCopy(n) as Exciter | undefined;
    if (!w?.script.trim()) {
      skipped.push({ pathId: id, reason: "No script yet." });
      continue;
    }
    if (w.status !== "approved") {
      skipped.push({ pathId: id, reason: "The script isn’t approved." });
      continue;
    }
    const r = queueOwnerAudio(
      db,
      actor,
      exciterOwner(id),
      { items: [{ target: EXCITER_TARGET, script: w.script.trim() }], voice: EXCITER_VOICE, confirmed: true, fresh: input.fresh === true },
      now,
      { event: "learning_path.exciter_queued", delivery: n?.curious ? "curious" : null },
      speech,
    );
    queued.push({ pathId: id, job: r.jobs[0] });
  }
  return { queued, skipped };
}

/** Live path ids from a request, checked: up to 100, each one a live path. */
function idsOf(db: Db, v: unknown): string[] {
  const ids = [...new Set((Array.isArray(v) ? v : []).map(String))].slice(0, 100);
  if (!ids.length) throw new HttpError(400, "Choose at least one Discovery Path.");
  for (const id of ids) getRow(db, id);
  return ids;
}

// ---------------------------------------------------------------------------------------------
// Drafting scripts from the whole path
// ---------------------------------------------------------------------------------------------

/** Card headings in a Topic, for the prompt: what it covers, in order, without its answers. */
function topicOutline(slug: string) {
  const l = lessons.find((x) => x.slug === slug);
  if (!l) return [];
  return Object.values(l.nodes)
    .map((n) => (n as { heading?: unknown }).heading)
    .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
    .slice(0, 14);
}

/** The prompt for one path's Exciter: the whole path, its structure and every Topic, and the PRD's shape and rules. */
export function exciterPrompt(input: {
  shape: PathShape & { slugs: string[] };
  topics: { slug: string; title: string; summary: string; minutes: number; draft: boolean; cards: string[] }[];
  quiz: string | null;
  note: string;
}) {
  const { shape: p, topics } = input;
  const chaptered = p.chapters.length > 0;
  const byChapter = chaptered ? input.shape.chapters : [];
  const topicLines = topics
    .map(
      (t, i) =>
        `${i + 1}. ${t.title}${t.draft ? " (still being written)" : ""}, about ${t.minutes} minutes: ${t.summary || "(no summary)"}${t.cards.length ? `\n   Cards: ${t.cards.join("; ")}` : ""}`,
    )
    .join("\n");
  return `You are writing the Discovery Exciter for a Discovery Path on Trilogy Care's Partner Hub, a learning site for Australian aged care (service partners who deliver care, and Trilogy Care's own staff). It is spoken in the Magazine Editorial Voice: warm, calm and professionally confident, conversational Australian English, a little curious and exploratory.

The Discovery Exciter is not a summary, not a list of learning outcomes and not a reading of the path's description. It is a short spoken narrative that makes the learner want to explore the subject, by showing why it matters to their own professional experience.

The Discovery Path
Title: ${p.name}
Description (shown on the page; don't read it out): ${p.description || "(none)"}
Audience: ${p.audience || "(not given)"}
Who it's for: ${p.whoFor || "(not given)"}
What learners will be able to do (the behaviour change it's for):
${p.outcomes.length ? p.outcomes.map((o) => `- ${o}`).join("\n") : "- (not given)"}
What they get at the end: ${p.reward || "(not given)"}
${input.quiz ? `Upfront or final check: ${input.quiz}\n` : ""}
Structure, in order:
${chaptered ? byChapter.map((c, i) => `Chapter ${i + 1}${c.stage ? ` (${c.stage})` : ""}: ${c.title}${c.description ? `: ${c.description}` : ""}`).join("\n") : "One list of Topics."}

Topics, in order:
${topicLines || "(no Topics yet)"}
${input.note ? `\nThe author's note:\n<note>\n${input.note}\n</note>\n` : ""}
Write one Discovery Exciter for the whole path (not the first Topic). As one flowing piece of speech, never as labelled parts:
- Open with an engaging question, observation or professional dilemma.
- Establish why this Discovery Path matters, and connect it with real professional experience.
- Introduce the challenges or opportunities the learner will explore, creating curiosity without giving the answers away.
- Say what the learner will gain, and encourage them to explore and reflect.

For tone only (never reuse its words), an Exciter for a path on growing a Care Partner business: “Your business is growing, referrals are coming in, and your team is getting busier. But growth brings a different set of questions. When should you hire another coordinator? Which referrals are worth investing in? Can your cash flow support the next three months? And what happens when your existing clients start noticing the pressure? Throughout this Discovery Path, you'll step into realistic business situations, explore the numbers and make decisions that experienced Care Partners face every day. There isn't always one right answer, but there are better questions to ask.”

Rules:
- ${EXCITER_WORDS.min} to ${EXCITER_WORDS.max} words (30 to 60 seconds spoken).
- Never open with "Welcome to", "In this path", "This module" or anything like them. Avoid corporate training language and repetition.
- Write for the ear: "you", short sentences, no lists, headings, brackets, emoji or abbreviations a voice would stumble on.
- Stay true to the path: mention only what its Topics, outcomes and structure cover. Add no new facts, people or promises. Never state a clinical, financial or regulatory claim, rate, dollar amount, date or timeframe the path doesn't teach, and give no clinical advice.
- Don't give away the answers to its scenarios or questions.

Reply with only a JSON object, no other text: {"script": "what the voice says"}`;
}

/** Problems that send the reply back once: empty, far off the length, a formulaic opening, or reading out the description. */
export function exciterIssues(description: string) {
  return (value: unknown): string[] => {
    const v = value as { script?: unknown } | null;
    if (!v || typeof v !== "object") return ["Reply with a JSON object."];
    const script = typeof v.script === "string" ? v.script.trim() : "";
    if (!script) return ["The script is empty."];
    const issues: string[] = [];
    const n = wordCount(script);
    if (n < EXCITER_WORDS.min * 0.75 || n > EXCITER_WORDS.max * 1.2)
      issues.push(`The script is ${n} words; keep it between ${EXCITER_WORDS.min} and ${EXCITER_WORDS.max}.`);
    if (formulaicOpening(script)) issues.push("The script opens like a training module. Open with a question, an observation or a professional dilemma.");
    if (description.trim() && spoilerIn(script, [description]))
      issues.push("The script reads out the description. Write something new that opens the path up.");
    return issues;
  };
}

/** Writes a script: Claude when connected, else OpenAI. Tests pass their own (no paid calls). */
export type ScriptWriter = (
  prompt: string,
  check: (v: unknown) => string[],
  onPhase: (phase: "checking" | "fixing", issues?: number) => void,
) => Promise<{ value: unknown; model: string; usage?: unknown }>;
export const hubWriter: ScriptWriter = async (prompt, check, onPhase) => {
  if (claudeConfigured()) {
    const r = await askForJson<unknown>([{ type: "text", text: prompt }], check, { onText: () => {}, onPhase }, "medium");
    return { value: r.value, model: GENERATION_MODEL, usage: r.usage };
  }
  if (!openaiReady()) throw new HttpError(503, "Neither Claude nor OpenAI is connected. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env.local.");
  return { value: await openaiJson<unknown>(prompt, check, onPhase), model: openaiTextModel() };
};

export type ExciterDraftEvent =
  | { type: "phase"; phase: "writing" | "checking" | "fixing"; pathId: string; n: number; of: number; issues?: number }
  | { type: "drafted"; pathId: string; ok: boolean; error?: string; words?: number };

/**
  AI drafts the Exciter for each path from the whole path, one request a path, in turn. Each arrives as a new draft
  version (a published Exciter keeps playing until its replacement is approved). Several at once needs `confirmed`.
  `missingOnly` skips paths that already have a script. One failing doesn't stop the rest.
*/
export async function draftExciters(
  db: Db,
  actor: User,
  input: { pathIds?: unknown; note?: unknown; confirmed?: unknown; missingOnly?: unknown },
  now: Date,
  send: (e: ExciterDraftEvent) => void,
  writer: ScriptWriter = hubWriter,
) {
  requireAuthor(actor);
  let ids = idsOf(db, input.pathIds);
  if (input.missingOnly === true) ids = ids.filter((id) => !workingCopy(storedExciter(db, id))?.script.trim());
  if (ids.length > 1 && input.confirmed !== true) throw new HttpError(400, "Confirm before writing several scripts with AI.");
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 600) : "";
  const cat = catalogueMap(db);
  const results: { pathId: string; ok: boolean; error?: string; words?: number }[] = [];
  for (const [i, id] of ids.entries()) {
    try {
      const shape = shapeOf(db, id, cat);
      const quiz = (() => {
        const q = overview(getRow(db, id)).quiz;
        return q
          ? `an upfront quiz (${q.questions ? `${q.questions} questions` : "a question from each Topic"}, ${q.passMark}% to pass) that completes the path`
          : null;
      })();
      const prompt = exciterPrompt({
        shape,
        topics: shape.slugs.map((s) => {
          const c = cat.get(s);
          return { slug: s, title: c?.title ?? s, summary: c?.summary ?? "", minutes: c?.minutes ?? 0, draft: Boolean(c?.draft), cards: topicOutline(s) };
        }),
        quiz,
        note,
      });
      send({ type: "phase", phase: "writing", pathId: id, n: i + 1, of: ids.length });
      const out = await writer(prompt, exciterIssues(shape.description), (phase, issues) =>
        send({ type: "phase", phase, pathId: id, n: i + 1, of: ids.length, issues }),
      );
      const script = (out.value as { script?: unknown } | null)?.script;
      if (typeof script !== "string" || !script.trim()) throw new HttpError(502, "The AI didn’t write a script. Try again.");
      const text = script.trim().slice(0, 1200);
      const checks = exciterWarnings(text, shape.description);
      const n = storedExciter(db, id);
      writeExciter(
        db,
        id,
        editExciter(n, (w) => ({ script: text, status: "draft", version: (w?.version ?? 0) + 1, source: "ai", ...(checks.length && { checks }) })),
        actor.id,
        now,
      );
      audit(db, {
        actor: actor.id,
        event: "learning_path.exciter_drafted",
        entity: `learning_path:${id}`,
        next: { model: out.model, usage: out.usage ?? null },
        at: now,
      });
      results.push({ pathId: id, ok: true, words: wordCount(text) });
      send({ type: "drafted", pathId: id, ok: true, words: wordCount(text) });
    } catch (e) {
      const error = e instanceof HttpError ? e.message : "The script couldn’t be written.";
      if (!(e instanceof HttpError)) console.error(e);
      results.push({ pathId: id, ok: false, error });
      send({ type: "drafted", pathId: id, ok: false, error });
    }
  }
  return { results };
}

// ---------------------------------------------------------------------------------------------
// The Discovery Path Introduction Manager
// ---------------------------------------------------------------------------------------------

/** Every live path's Exciter, for the Manager. */
export function exciterManager(db: Db, actor: User, speech: SpeechEngine = hubSpeech) {
  requireAuthor(actor);
  const paths = db.prepare("SELECT id, name, description FROM learning_paths WHERE archived = 0 ORDER BY name").all() as {
    id: string;
    name: string;
    description: string | null;
  }[];
  const cat = catalogueMap(db);
  let speechInfo: ReturnType<typeof ownerJobs>["speech"] | null = null;
  let perHour = 0;
  const rows = paths.map((p) => {
    const jobs = ownerJobs(db, exciterOwner(p.id), EXCITER_VOICE, speech);
    speechInfo = jobs.speech;
    perHour = jobs.perHour;
    const n = attachFinished(db, p.id, jobs.jobs, new Date());
    const shape = shapeOf(db, p.id, cat);
    const snap = pathSnapshot(shape);
    const w = workingCopy(n) as Exciter | undefined;
    const state = exciterState(w, snap);
    const job = jobs.jobs.find((j) => j.target === EXCITER_TARGET) ?? null;
    const words = w ? wordCount(w.script) : 0;
    const recorded = Boolean(w?.audio && w.audio.scriptHash === textHash(w.script));
    const learners = exciterForLearners(n);
    return {
      id: p.id,
      name: p.name,
      topics: shape.slugs.length,
      script: w?.script ?? "",
      scriptStatus: !w ? ("none" as const) : w.status,
      version: w?.version ?? null,
      source: w?.source ?? n?.source ?? null,
      words,
      characters: w?.script.trim().length ?? 0,
      state,
      audioStatus: audioStatus(w, job, state),
      audio: w?.audio ?? null,
      /** What learners hear now, if anything. */
      published: learners ? { src: learners.audio.src, seconds: learners.audio.seconds } : null,
      approvedBy: n?.approvedBy ?? null,
      approvedAt: n?.approvedAt ?? null,
      seconds: recorded ? w!.audio!.seconds : secondsFor(words),
      estimated: !recorded,
      updatedAt: n?.updatedAt ?? null,
      outdated: exciterOutdated(n, snap) || exciterOutdated(n?.next, snap),
      hidden: Boolean(n?.hidden),
      curious: Boolean(n?.curious),
      replacing: Boolean(n?.next && playable(n, EXCITER_AUDIO)),
      job: job && { id: job.id, status: job.status, error: job.error, scriptHash: job.scriptHash, createdAt: job.createdAt },
      warnings: w ? exciterWarnings(w.script, p.description ?? "") : [],
    };
  });
  return { rows, speech: speechInfo, perHour };
}
export type ExciterManagerRow = ReturnType<typeof exciterManager>["rows"][number];

/** Approve the scripts of several paths at once (each one's current working script, snapshot taken now). Needs `confirmed`. */
export function approveExciterScripts(db: Db, actor: User, input: { pathIds?: unknown; confirmed?: unknown }, now: Date) {
  requireAuthor(actor);
  const ids = idsOf(db, input.pathIds);
  if (input.confirmed !== true) throw new HttpError(400, "Confirm before approving several scripts.");
  const approved: string[] = [];
  for (const id of ids) {
    const n = storedExciter(db, id);
    const w = workingCopy(n) as Exciter | undefined;
    if (!w?.script.trim() || w.status === "approved") continue;
    const next = editExciter(n, (x) => x && { ...x, script: x.script.trim(), status: "approved", basis: pathSnapshotFor(db, id) });
    writeExciter(db, id, next, actor.id, now);
    audit(db, {
      actor: actor.id,
      event: "learning_path.exciter_script_approved",
      entity: `learning_path:${id}`,
      next: { version: w.version ?? 1, bulk: true },
      at: now,
    });
    approved.push(id);
  }
  return { approved };
}

// ---------------------------------------------------------------------------------------------
// Learners
// ---------------------------------------------------------------------------------------------

/** What the path page plays: the approved Exciter and its approved recording, or null (nothing is shown in its place). */
export function learnerExciter(db: Db, pathId: string) {
  return exciterForLearners(storedExciter(db, pathId));
}

/**
  A learner's listening event (intro_audio.<action>): the path's id, their id (for counting people once) and numbers
  only. Anything else sent is dropped. Never needed to finish anything.
*/
export function recordExciterEvent(db: Db, user: User, pathId: string, input: { action?: unknown; detail?: unknown }, now: Date) {
  getRow(db, pathId);
  ensureExciterStore(db);
  const action = String(input.action ?? "") as IntroAudioAction;
  if (!(INTRO_AUDIO_ACTIONS as readonly string[]).includes(action)) throw new HttpError(400, "Unknown listening event.");
  const d = (input.detail ?? {}) as Record<string, unknown>;
  const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.round(v * 10) / 10) : undefined);
  const speed = typeof d.speed === "number" && (INTRO_AUDIO_SPEEDS as readonly number[]).includes(d.speed) ? d.speed : undefined;
  const detail = {
    ...(num(d.seconds, 3600) !== undefined && { seconds: num(d.seconds, 3600) }),
    ...(num(d.percent, 100) !== undefined && { percent: num(d.percent, 100) }),
    ...(speed !== undefined && { speed }),
  };
  // A runaway page can't fill the table: at most 300 events a person a path a day.
  const since = new Date(now.getTime() - 86_400_000).toISOString();
  const recent = (
    db.prepare("SELECT COUNT(*) AS n FROM path_intro_events WHERE path_id = ? AND user_id = ? AND at > ?").get(pathId, user.id, since) as { n: number }
  ).n;
  if (recent >= 300) return { ok: true };
  db.prepare("INSERT INTO path_intro_events (path_id, user_id, event, detail, at) VALUES (?, ?, ?, ?, ?)").run(
    pathId,
    user.id,
    `intro_audio.${action}`,
    JSON.stringify(detail),
    now.toISOString(),
  );
  return { ok: true };
}

export type ExciterStats = {
  pathId: string;
  plays: number;
  listeners: number;
  seconds: number;
  percent: number | null;
  completed: number;
  replays: number;
  transcripts: number;
  speeds: Record<string, number>;
  /** Of the listeners, the share who went on to a Topic in the path, and who finished the path (null under five people). */
  startedAfterListening: number | null;
  finishedAfterListening: number | null;
  /** Of the people who started the path without listening, the share who finished it (null under five people). */
  finishedWithoutListening: number | null;
};

/** Listening to each path's Exciter, and progression into the path and its completion. Ids and numbers only, never who. */
export function exciterStats(db: Db, actor: User): { paths: ExciterStats[]; listeners: number; seconds: number } {
  requireAuthor(actor);
  ensureExciterStore(db);
  const rows = db.prepare("SELECT path_id, user_id, event, detail FROM path_intro_events ORDER BY id").all() as (IntroAudioRow & { path_id: string })[];
  const by = new Map<string, IntroAudioRow[]>();
  for (const r of rows) by.set(r.path_id, [...(by.get(r.path_id) ?? []), r]);
  const out: ExciterStats[] = [];
  const cat = catalogueMap(db);
  for (const [pathId, rs] of by) {
    const l = introListening(rs);
    const slugs = slugsFor(db, pathId);
    const live = slugs.filter((s) => cat.get(s) && !cat.get(s)!.draft);
    const touched = new Set<string>();
    const doneBy = new Map<string, Set<string>>();
    if (slugs.length) {
      const marks = slugs.map(() => "?").join(", ");
      for (const r of db.prepare(`SELECT DISTINCT user_id FROM lesson_progress WHERE slug IN (${marks})`).all(...slugs) as { user_id: string }[])
        touched.add(r.user_id);
      for (const r of db.prepare(`SELECT DISTINCT user_id, lesson_slug FROM lesson_completions WHERE lesson_slug IN (${marks})`).all(...slugs) as {
        user_id: string;
        lesson_slug: string;
      }[]) {
        touched.add(r.user_id);
        doneBy.set(r.user_id, (doneBy.get(r.user_id) ?? new Set()).add(r.lesson_slug));
      }
    }
    const finished = new Set([...doneBy].filter(([, s]) => live.length > 0 && live.every((x) => s.has(x))).map(([u]) => u));
    const listeners = [...l.listenerIds];
    const without = [...touched].filter((u) => !l.listenerIds.has(u));
    const both = listeners.length >= SMALL_GROUP && without.length >= SMALL_GROUP;
    out.push({
      pathId,
      plays: l.plays,
      listeners: listeners.length,
      seconds: l.seconds,
      percent: l.percent,
      completed: l.completed,
      replays: l.replays,
      transcripts: l.transcripts,
      speeds: l.speeds,
      startedAfterListening: shareOf(listeners, touched),
      finishedAfterListening: shareOf(listeners, finished),
      finishedWithoutListening: both ? shareOf(without, finished) : null,
    });
  }
  const everyone = new Set(rows.filter((r) => r.event === "intro_audio.play").map((r) => r.user_id));
  return { paths: out, listeners: everyone.size, seconds: out.reduce((n, p) => n + p.seconds, 0) };
}
