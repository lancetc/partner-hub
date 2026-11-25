import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { audit, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { askForJson, keyCounts } from "./claudeJson";
import { GENERATION_MODEL } from "./generate";
import { audienceText, requireGuide, sourceDocuments, type DraftProgress } from "./magazineDraft";
import { narration as speakWithTimings, narratorName, ttsConfig } from "./tts";
import { saveUpload } from "./uploads";
import { claudeConfigured, mp3Seconds, OPENAI_VOICES, openaiJson, openaiReady, openaiSpeechModel, openaiTextModel } from "./openaiText";
import { GuideDocError, PAGE_TEMPLATES, readGuideDoc, type GuideDoc, type NarrationAudio, type NarrationLength, type Page } from "@/lib/magazine";
import {
  answersOn,
  audioOf,
  DELIVERY_NOTES,
  type DeliveryNote,
  formulaicOpening,
  NARRATION_LENGTHS,
  sameOpenings,
  scriptWarnings,
  secondsFor,
  speechCost,
  spoilerIn,
  textHash,
  VOICE_PROFILES,
  wordCount,
} from "@/lib/magazineNarration";
import type { WordTiming } from "@/lib/wordTimings";

/*
  The Magazine Audio Guide and Audio Introductions (docs/magazine-audio-guide.md). Claude (or OpenAI, when Claude
  isn't connected) drafts a short spoken introduction for the course and for each page from the course's own content;
  the author edits and approves each one; approved scripts are recorded in the background (server/narrationJobs) in
  the Magazine Editorial Voice or another voice, kept as hub uploads, and attached to their page in the draft for the
  author to approve. Nothing here changes the course: drafts and recordings go back to the editor, which adds them as
  changes the author can undo.
*/

export const MAX_NOTE = 600;
const PER_HOUR = 60;

/** Who's being introduced: the course ("intro"), or a page by its id. */
type Target = "intro" | string;
export type DraftedScript = { target: Target; script: string; checks: string[] };

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function readDoc(value: unknown): GuideDoc {
  try {
    return readGuideDoc(value, { draft: true });
  } catch (e) {
    if (e instanceof GuideDocError) throw new HttpError(400, `The course has problems to fix first: ${e.problems.slice(0, 3).join(" ")}`);
    throw e;
  }
}

/** What a scope asks for: the whole course (as its settings say), its introduction, or one page. */
export function targetsFor(doc: GuideDoc, scope: string): Target[] {
  const audio = audioOf(doc);
  const content = doc.pages.filter((p) => p.kind === "content");
  // A one-page guide's page introduction is its introduction.
  const intro = doc.pages.length > 1;
  if (scope === "course") return [...(intro && audio.levels.course ? ["intro"] : []), ...(audio.levels.pages ? content.map((p) => p.id) : [])];
  if (scope === "intro") {
    if (!intro) throw new HttpError(400, "A one-page guide has a page introduction only.");
    return ["intro"];
  }
  if (!content.some((p) => p.id === scope)) throw new HttpError(400, "That page can’t have narration (it isn’t a content page).");
  return [scope];
}

/** Who's in a page's cases: the people its scenarios name, for the introduction to mention as the page does. */
function casesOn(page: Page): string[] {
  const names = new Set<string>();
  const json = JSON.stringify(page.sections);
  for (const m of json.matchAll(/\b(Mrs|Mr|Ms|Dr) [A-Z][a-z]+|"(?:name|person|client|caller)":"([^"]{2,40})"/g)) names.add((m[2] ?? m[0]).trim());
  return [...names].slice(0, 8);
}

/** The prompt: the course at a glance, the pages being introduced in full, and the rules. */
export function narrationPrompt(input: {
  title: string;
  standfirst: string;
  audience: string;
  doc: GuideDoc;
  targets: Target[];
  length: NarrationLength;
  note: string;
  /** The author's brief from Draft with AI: the behaviour change the course is for, and anything else they told it. */
  brief?: string;
}) {
  const { min, max } = NARRATION_LENGTHS[input.length];
  const editorial = input.length === "editorial";
  const list = input.doc.pages
    .map(
      (p, i) =>
        `${i + 1}. [id ${p.id}] ${p.title || "(untitled)"} (${p.kind === "assessment" ? "assessment" : PAGE_TEMPLATES[p.template].title}): ${p.purpose || "(no purpose)"}`,
    )
    .join("\n");
  const pages = input.targets
    .filter((t) => t !== "intro")
    .map((id) => {
      const p = input.doc.pages.find((x) => x.id === id)!;
      const i = input.doc.pages.indexOf(p);
      const answers = answersOn(p);
      const before = input.doc.pages[i - 1];
      const after = input.doc.pages[i + 1];
      const cases = casesOn(p);
      return `<page id="${p.id}" number="${i + 1}" of="${input.doc.pages.length}">
Position: ${i === 0 ? "the first page" : `after “${before?.title || "the previous page"}”`}${after ? `, before “${after.title || "the next page"}”` : ", the last page"}.
Description: ${p.purpose || "(none)"}
${p.relay?.purpose ? `The behaviour or decision this page works on (the author's words for Ava Relay): ${p.relay.purpose}\n` : ""}${cases.length ? `People in its cases: ${cases.join(", ")}\n` : ""}Content and activities (JSON):
${JSON.stringify({ title: p.title, purpose: p.purpose, sections: p.sections.map((s) => ({ title: s.title, blocks: s.blocks })) })}
${answers.length ? `Answers on this page the introduction must never give away or hint at:\n${answers.map((a) => `- ${a}`).join("\n")}` : ""}
</page>`;
    })
    .join("\n\n");
  const wantsIntro = input.targets.includes("intro");
  return `You are writing the spoken introductions for a Magazine course on Trilogy Care's Partner Hub, a learning site for Australian aged care (partners who deliver care and Trilogy Care's own staff). The voice is the Magazine's editorial voice: warm, calm and professionally confident, closer to an interactive digital publication than an eLearning course. It gives a short spoken introduction ${wantsIntro ? "to the course and " : ""}to each page. It doesn't read the page aloud, and doesn't repeat its heading or description: it opens the page up, then the learner reads and does it.

Course: ${input.title || "(untitled)"}
Learning outcomes (what learners will be able to do): ${input.standfirst || "(not given)"}
Who it's for: ${input.audience}
${input.brief ? `The author's brief (the behaviour change the course is for, and background):\n<brief>\n${input.brief.slice(0, 4000)}\n</brief>\n` : ""}
The course's pages, in order:
${list}

Write: ${[wantsIntro ? "the course introduction" : "", ...input.targets.filter((t) => t !== "intro").map((t) => `the introduction to page id ${t}`)].filter(Boolean).join("; ")}.
${input.note ? `\nThe author's note:\n<note>\n${input.note}\n</note>\n` : ""}
${pages ? `The pages being introduced:\n${pages}\n` : ""}
Each page introduction, in this order, as one flowing piece of speech (never as labelled parts):
1. Why the subject matters.
2. How it connects to the learner's own work and experience.
3. A real problem, question or opportunity the page opens up.
4. What they'll gain from the page.
5. An invitation to explore the page.
${editorial ? "For example, for a page called “Dot at quarter end: what's really left?” (an example of the tone only; never reuse its words): “Dot's dashboard suggests she still has money available, but does that tell the whole story? Outstanding invoices, scheduled services and existing commitments can make the amount on screen quite different from what is actually available to spend. In this activity, you'll step into the coordinator's role, work through Dot's numbers and decide what can genuinely be funded before the quarter ends. It's a practical exercise in looking beyond the headline figure and making decisions that protect both Dot's care and her budget.”\n" : ""}
Rules for every script:
- Hook, don't summarise. Open with the situation, a question or why it matters. Never open with "Welcome to this module", "In today's lesson", "In this page we will" or anything like them, and don't start two introductions with the same words. Each one should feel written for its page.
- Keep it short: ${min} to ${max} words (about ${NARRATION_LENGTHS[input.length].seconds} spoken).${editorial ? " Shorter is fine where a page needs less." : ""}
- Speak naturally: conversational Australian English, "you", short sentences, respectful of an experienced adult audience. Write for the ear: no lists, headings, brackets, emoji, abbreviations or symbols a voice would stumble on. Not corporate training language, and not promotional.
- Build continuity: a page introduction may refer to what the learner has just done and where this page takes them. ${wantsIntro ? "The course introduction welcomes them, says why it matters to their work and what they'll gain." : ""}
- No spoilers: never reveal or hint at the best choice in a decision, the right answer to a question or activity, or how a scenario ends well.
- Respect the source material: never state a rate, dollar amount, date, timeframe, rule, regulatory requirement, financial figure, clinical instruction or compliance requirement, and give no clinical advice. The pages teach those, with their evidence; you point the learner towards them.
- People in the pages' cases may be mentioned by first name, as the page does. Never invent new people or facts.

Reply with only a JSON object, no other text:
{${wantsIntro ? '"intro": "the course introduction",' : ""} "pages": [{"id": "page id", "script": "what the voice says"}]}`;
}

/** Problems that send the reply back once: a missing or extra script, far off the length, a formulaic or repeated opening, or a give-away. */
export function narrationIssues(doc: GuideDoc, targets: Target[], length: NarrationLength) {
  return (value: unknown): string[] => {
    const v = value as { intro?: unknown; pages?: unknown } | null;
    if (!v || typeof v !== "object") return ["Reply with a JSON object."];
    const issues: string[] = [];
    const { min, max } = NARRATION_LENGTHS[length];
    // The editorial length allows a shorter introduction where it suits the page.
    const low = length === "editorial" ? min * 0.5 : min * 0.75;
    const written: { id: string; script: string }[] = [];
    const check = (label: string, script: string, answers: string[], id: string) => {
      if (!script) return void issues.push(`${label} is empty.`);
      written.push({ id, script });
      const n = wordCount(script);
      if (n < low || n > max * 1.25) issues.push(`${label} is ${n} words; keep it between ${min} and ${max}.`);
      const spoiler = spoilerIn(script, answers);
      if (spoiler) issues.push(`${label} gives away an answer ("${spoiler}"). Hint at the question, never the answer.`);
      if (formulaicOpening(script)) issues.push(`${label} opens like a training module. Open with the situation, a question or why it matters.`);
    };
    if (targets.includes("intro")) check("The course introduction", text(v.intro), [], "intro");
    const pages = Array.isArray(v.pages) ? (v.pages as { id?: unknown; script?: unknown }[]) : [];
    for (const id of targets.filter((t) => t !== "intro")) {
      const got = pages.find((p) => p?.id === id);
      const page = doc.pages.find((p) => p.id === id)!;
      if (!got) issues.push(`Write the introduction for page id ${id}.`);
      else check(`The introduction to “${page.title || id}”`, text(got.script), answersOn(page), id);
    }
    for (const ids of sameOpenings(written)) issues.push(`The introductions for ${ids.join(", ")} start with the same words. Give each its own opening.`);
    const extra = pages.filter((p) => !targets.includes(String(p?.id)));
    if (extra.length) issues.push(`Only write the scripts asked for (not ${extra.map((p) => String(p?.id)).join(", ")}).`);
    return issues;
  };
}

/** The author's brief from Draft with AI, when there is one. */
function briefOf(db: Db, guideId: string): string {
  try {
    return (db.prepare("SELECT brief FROM magazine_plans WHERE guide_id = ?").get(guideId) as { brief?: string } | undefined)?.brief?.trim() ?? "";
  } catch {
    return "";
  }
}

/**
  Claude drafts the Audio Guide scripts for the course as it stands in the editor: the whole course in
  one go (so the scripts make one arc), the course introduction, or one page. Nothing is saved.
*/
export async function draftNarration(
  db: Db,
  actor: User,
  guideId: string,
  input: { scope?: unknown; only?: unknown; note?: unknown; doc?: unknown; title?: unknown; standfirst?: unknown },
  now: Date,
  send: (e: DraftProgress) => void,
): Promise<{ scripts: DraftedScript[] }> {
  const g = requireGuide(db, actor, guideId);
  const doc = readDoc(input.doc);
  const audio = audioOf(doc);
  const scope = typeof input.scope === "string" && input.scope ? input.scope : "course";
  // Generate redoes only what's missing or out of date: the rest of the course is still read, for continuity.
  const only = Array.isArray(input.only) ? input.only.map(String) : null;
  const targets = targetsFor(doc, scope).filter((t) => !only || only.includes(t));
  if (!targets.length) throw new HttpError(400, "Turn on course or page introductions in the Audio guide settings first.");
  const note = text(input.note).slice(0, MAX_NOTE);
  // Claude reads the course's documents too; OpenAI, when Claude isn't connected, works from the course itself.
  const claude = claudeConfigured();
  const sources = claude ? sourceDocuments(db, guideId) : [];
  if (sources.length) send({ type: "phase", phase: "reading" });
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...sources,
    {
      type: "text",
      text: narrationPrompt({
        title: text(input.title) || g.title,
        standfirst: text(input.standfirst) || g.standfirst,
        audience: audienceText(g.audience),
        doc,
        targets,
        length: audio.length,
        note,
        brief: briefOf(db, guideId),
      }),
    },
  ];
  send({ type: "phase", phase: "writing" });
  type Reply = { intro?: string; pages?: { id: string; script: string }[] };
  const check = narrationIssues(doc, targets, audio.length);
  const { value, usage } = claude
    ? await askForJson<Reply>(content, check, {
        onText: (soFar) => send({ type: "count", what: "pages", n: keyCounts(soFar, ["script"]).script }),
        onPhase: (phase, issues) => send({ type: "phase", phase, issues }),
      })
    : {
        value: await openaiJson<Reply>((content.at(-1) as { text: string }).text, check, (phase, issues) => send({ type: "phase", phase, issues })),
        usage: null,
      };
  const scripts = targets.map((t): DraftedScript => {
    const script = t === "intro" ? text(value.intro) : text(value.pages?.find((p) => p.id === t)?.script);
    const page = doc.pages.find((p) => p.id === t);
    return { target: t, script, checks: scriptWarnings(script, audio.length, page ? answersOn(page) : []) };
  });
  audit(db, {
    actor: actor.id,
    event: "magazine.narration_drafted",
    entity: guideId,
    next: { model: claude ? GENERATION_MODEL : openaiTextModel(), scope, scripts: scripts.length, usage },
    at: now,
  });
  return { scripts };
}

// ---------------------------------------------------------------------------------------------
// Speech, independent of who provides it
// ---------------------------------------------------------------------------------------------

/** A voice as the Magazine names it ("profile:editorial", "topic", "openai:<voice>" or an ElevenLabs voice id), if it's one. */
export function cleanVoice(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (v === "topic") return v;
  if (/^profile:[a-z-]{2,30}$/.test(v)) return v.slice(8) in VOICE_PROFILES ? v : null;
  if (/^openai:[a-z]{2,20}$/.test(v)) return OPENAI_VOICES.some((x) => `openai:${x.id}` === v) ? v : null;
  return /^[A-Za-z0-9]{8,40}$/.test(v) ? v : null;
}

/** Who speaks a voice and how: the provider, its model, the voice it asks for, and a profile's delivery notes. */
export function speechTarget(voice: string): { provider: "openai" | "elevenlabs"; model: string; speaker: string; style?: string; profile?: string } {
  if (voice.startsWith("profile:")) {
    const p = VOICE_PROFILES[voice.slice(8) as keyof typeof VOICE_PROFILES];
    return { provider: p.provider, model: openaiSpeechModel(), speaker: `openai:${p.voice}`, style: p.instructions, profile: p.id };
  }
  const speaker = voice === "topic" ? ttsConfig().voiceId : voice;
  return speaker.startsWith("openai:")
    ? { provider: "openai", model: openaiSpeechModel(), speaker }
    : { provider: "elevenlabs", model: ttsConfig().modelId, speaker };
}

/**
  Speech for a Magazine introduction: any provider behind one shape, so another voice or service can be added without
  changing the player or the editor. Tests pass their own; nothing here is called without an author asking for it.
*/
export type SpeechEngine = (
  text: string,
  voice: string,
  /** `delivery`: a note the profile takes on for this kind of introduction (DELIVERY_NOTES), e.g. a Discovery Exciter's "curious". */
  opts: { fresh: boolean; delivery?: DeliveryNote },
) => Promise<{ audio: Buffer; words: WordTiming[] | null; provider: string; model: string; profile?: string }>;

export const hubSpeech: SpeechEngine = async (script, voice, opts) => {
  const t = speechTarget(voice);
  // A delivery note is added to a profile's own notes (only OpenAI's gpt-4o voices read them), so it stays the same voice.
  const style = t.style && opts.delivery ? `${t.style} ${DELIVERY_NOTES[opts.delivery]}` : t.style;
  // With word timings: ElevenLabs reports them; for OpenAI's voices they're estimated from the recording's length.
  const { audio, words } = await speakWithTimings(script, t.speaker, style, { fresh: opts.fresh });
  return { audio, words, provider: t.provider, model: t.model, ...(t.profile && { profile: t.profile }) };
};

/**
  Records one approved script and keeps it as a hub upload, ready to attach to its page for the author to approve.
  Called by the background queue (server/narrationJobs), never while a learner reads.
*/
export async function makeRecording(
  db: Db,
  actor: User,
  guideId: string,
  input: { script: string; voice: string; target: string; fresh?: boolean; delivery?: DeliveryNote },
  now: Date,
  speech: SpeechEngine = hubSpeech,
): Promise<NarrationAudio> {
  const script = text(input.script);
  if (!script) throw new HttpError(400, "There’s no script to record.");
  if (script.length > 1200) throw new HttpError(400, "That script is too long to record. Keep it under 1,200 characters.");
  const voice = cleanVoice(input.voice);
  if (!voice) throw new HttpError(400, "Choose one of the voices offered.");
  const out = await speech(script, voice, { fresh: Boolean(input.fresh), ...(input.delivery && { delivery: input.delivery }) });
  const label = script
    .replace(/[^\w .,-]/g, "")
    .slice(0, 50)
    .trim();
  const saved = await saveUpload(
    db,
    actor,
    new File([new Uint8Array(out.audio)], `Audio introduction – ${label}.mp3`, { type: "audio/mpeg" }),
    { width: 0, height: 0 },
    now,
  );
  const words = out.words;
  const seconds = words?.length ? Math.round(words[words.length - 1].end * 10) / 10 : (mp3Seconds(out.audio) ?? secondsFor(wordCount(script)));
  const cost = speechCost(script.length, out.provider, out.model);
  audit(db, {
    actor: actor.id,
    event: "magazine.narration_recorded",
    entity: guideId,
    next: {
      target: input.target.slice(0, 60),
      voice,
      provider: out.provider,
      model: out.model,
      characters: script.length,
      seconds,
      cost,
      ...(input.delivery && { delivery: input.delivery }),
    },
    at: now,
  });
  return {
    src: saved.src,
    seconds,
    words,
    scriptHash: textHash(script),
    voice,
    at: now.toISOString(),
    provider: out.provider,
    ...(out.profile && { profile: out.profile }),
    model: out.model,
    ...(cost !== null && { cost }),
  };
}

/** Recordings an author has asked for in the last hour, to stop a runaway loop. */
export function recordingsThisHour(db: Db, actor: User, now: Date) {
  const since = new Date(now.getTime() - 3600_000).toISOString();
  return (
    db.prepare("SELECT COUNT(*) AS n FROM audit WHERE actor = ? AND event = 'magazine.narration_recorded' AND at > ?").get(actor.id, since) as { n: number }
  ).n;
}
export const RECORDINGS_PER_HOUR = PER_HOUR;

/**
  A short sample of a voice, for "Preview voice profile": the same words every time, so it's made once per voice and
  model (kept by server/tts) and replayed free after that.
*/
export const VOICE_SAMPLE =
  "Every visit starts before you knock on the door. In the next few minutes, you'll see what good preparation looks like, and why it matters to the person you're supporting.";
export async function voiceSample(actor: User, voice: unknown, speech: SpeechEngine = hubSpeech) {
  requireAuthor(actor);
  const v = cleanVoice(voice);
  if (!v) throw new HttpError(400, "Choose one of the voices offered.");
  return (await speech(VOICE_SAMPLE, v, { fresh: false })).audio;
}

type Voice = { voiceId: string; name: string; description: string };
let voiceCache: { at: number; voices: Voice[]; note: string | null } | null = null;

/** The ElevenLabs voices this hub's key can use, for "Choose another voice". Kept for an hour. */
export async function narrationVoices(
  actor: User,
  now = Date.now(),
): Promise<{
  topic: { name: string };
  profiles: { id: string; name: string; summary: string; ready: boolean }[];
  voices: Voice[];
  openai: { id: string; label: string }[];
  note: string | null;
}> {
  requireAuthor(actor);
  const topic = { name: `${narratorName()} (the Topic narrator)` };
  // The Magazine Editorial Voice: OpenAI's Alloy with its delivery notes. Offered always; it needs OPENAI_API_KEY to record.
  const profiles = Object.values(VOICE_PROFILES).map((p) => ({ id: p.id, name: p.name, summary: p.summary, ready: openaiReady() }));
  // OpenAI's voices, with the hub's OpenAI key: an alternative when ElevenLabs is out of credit.
  const openai = openaiReady() ? OPENAI_VOICES : [];
  const { apiKey } = ttsConfig();
  if (!apiKey)
    return {
      topic,
      profiles,
      voices: [],
      openai,
      note: openai.length ? null : "ElevenLabs isn’t connected. Add ELEVENLABS_API_KEY (or OPENAI_API_KEY) to .env.local.",
    };
  if (voiceCache && now - voiceCache.at < 3600_000) return { topic, profiles, voices: voiceCache.voices, openai, note: voiceCache.note };
  let voices: Voice[] = [];
  let note: string | null = null;
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (res.ok) {
      const d = (await res.json()) as { voices?: { voice_id: string; name: string; labels?: Record<string, string>; description?: string | null }[] };
      voices = (d.voices ?? [])
        .map((v) => ({
          voiceId: v.voice_id,
          name: v.name,
          description: [v.labels?.accent, v.labels?.gender, v.labels?.description ?? v.description].filter(Boolean).join(" · "),
        }))
        .filter((v) => /^[A-Za-z0-9]{8,40}$/.test(v.voiceId))
        .sort((a, b) => a.name.localeCompare(b.name));
    } else note = "The ElevenLabs key can’t list voices (it needs the Voices read permission), so only the Topic narrator is offered.";
  } catch {
    note = "Couldn’t reach ElevenLabs to list voices. The Topic narrator still works.";
  }
  voiceCache = { at: now, voices, note };
  return { topic, profiles, voices, openai, note };
}

/**
  A page's narration script on its own, for Draft with AI: written as the page is, from the approved
  outline (so it links to the pages either side). Claude when connected, else OpenAI. A failure isn't
  the page's problem: the page still arrives, without a script.
*/
export async function pageScript(
  db: Db,
  actor: User,
  guideId: string,
  input: { page: import("@/lib/magazine").Page; index: number; outline: { title: string; purpose: string; template: string }[] },
): Promise<string | null> {
  const g = requireGuide(db, actor, guideId);
  const stubs = input.outline.map((o, i) =>
    i === input.index
      ? input.page
      : { id: `outline-${i + 1}`, title: o.title, purpose: o.purpose, template: "blank", kind: "content", required: true, sections: [] },
  );
  let doc: GuideDoc;
  try {
    doc = readGuideDoc({ schema: 2, pages: stubs }, { draft: true });
  } catch {
    return null;
  }
  const targets = [input.page.id];
  const check = narrationIssues(doc, targets, "editorial");
  const prompt = narrationPrompt({
    title: g.title,
    standfirst: g.standfirst,
    audience: audienceText(g.audience),
    doc,
    targets,
    length: "editorial",
    note: "",
    brief: briefOf(db, guideId),
  });
  type Reply = { pages?: { id: string; script: string }[] };
  try {
    const value = claudeConfigured()
      ? (await askForJson<Reply>([{ type: "text", text: prompt }], check, { onText: () => {}, onPhase: () => {} }, "medium")).value
      : openaiReady()
        ? await openaiJson<Reply>(prompt, check)
        : null;
    return text(value?.pages?.find((p) => p.id === input.page.id)?.script) || null;
  } catch {
    return null;
  }
}
