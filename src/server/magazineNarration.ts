import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { audit, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { askForJson, keyCounts } from "./claudeJson";
import { GENERATION_MODEL } from "./generate";
import { audienceText, requireGuide, sourceDocuments, type DraftProgress } from "./magazineDraft";
import { narration as speakWithTimings, ttsConfig } from "./tts";
import { saveUpload } from "./uploads";
import { claudeConfigured, mp3Seconds, OPENAI_VOICES, openaiJson, openaiReady, openaiSpeech, openaiTextModel } from "./openaiText";
import { GuideDocError, PAGE_TEMPLATES, readGuideDoc, type GuideDoc, type NarrationAudio, type NarrationLength } from "@/lib/magazine";
import { answersOn, audioOf, NARRATION_LENGTHS, scriptWarnings, secondsFor, spoilerIn, textHash, wordCount } from "@/lib/magazineNarration";

/*
  The Magazine Audio Guide (docs/magazine-audio-guide.md). Claude drafts a short spoken introduction for
  the course and for each page from the course's own content; the author edits and approves each one;
  ElevenLabs records approved scripts, which are kept as hub uploads and attached to their page in the
  draft. Nothing here changes the course: drafts and recordings go back to the editor, which adds them as
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

/** The prompt: the course at a glance, the pages being introduced in full, and the rules. */
export function narrationPrompt(input: {
  title: string;
  standfirst: string;
  audience: string;
  doc: GuideDoc;
  targets: Target[];
  length: NarrationLength;
  note: string;
}) {
  const { min, max } = NARRATION_LENGTHS[input.length];
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
      return `<page id="${p.id}" number="${i + 1}" of="${input.doc.pages.length}">
${JSON.stringify({ title: p.title, purpose: p.purpose, sections: p.sections.map((s) => ({ title: s.title, blocks: s.blocks })) })}
${answers.length ? `Answers on this page the introduction must never give away or hint at:\n${answers.map((a) => `- ${a}`).join("\n")}` : ""}
</page>`;
    })
    .join("\n\n");
  const wantsIntro = input.targets.includes("intro");
  return `You are writing the Audio Guide for a Magazine course on Trilogy Care's Partner Hub, a training site for Australian aged care. The Audio Guide is a friendly voice, a learning companion, that gives a short spoken introduction ${wantsIntro ? "to the course and " : ""}to each page. It doesn't read the page aloud: it opens the page up, then the learner reads and does it.

Course: ${input.title || "(untitled)"}
What learners will be able to do: ${input.standfirst || "(not given)"}
Who it's for: ${input.audience}

The course's pages, in order:
${list}

Write: ${[wantsIntro ? "the course introduction" : "", ...input.targets.filter((t) => t !== "intro").map((t) => `the introduction to page id ${t}`)].filter(Boolean).join("; ")}.
${input.note ? `\nThe author's note:\n<note>\n${input.note}\n</note>\n` : ""}
${pages ? `The pages being introduced (JSON):\n${pages}\n` : ""}
Rules for every script:
- Hook, don't summarise. Open with a question, a challenge or a surprising idea from the page. Don't list what the page covers.
- Keep it short: ${min} to ${max} words (about ${NARRATION_LENGTHS[input.length].seconds} spoken).
- Speak naturally: conversational Australian English, "you", short sentences. Write for the ear: no lists, headings, brackets, emoji, abbreviations or symbols a voice would stumble on. Not corporate training language.
- Build continuity: a page introduction may refer to what the learner has just done and where this page takes them. ${wantsIntro ? "The course introduction welcomes them, says why it matters to their work and what they'll gain." : ""}
- No spoilers: never reveal or hint at the best choice in a decision, the right answer to a question or activity, or how a scenario ends well.
- Respect the source material: never state a rate, dollar amount, date, timeframe, rule, clinical instruction or compliance requirement. The pages teach those; you point the learner towards them.
- People in the pages' scenarios may be mentioned by first name, as the page does. Never invent new people or facts.

Reply with only a JSON object, no other text:
{${wantsIntro ? '"intro": "the course introduction",' : ""} "pages": [{"id": "page id", "script": "what the voice says"}]}`;
}

/** Problems that send the reply back to Claude once: a missing or extra script, far off the length, or a give-away. */
export function narrationIssues(doc: GuideDoc, targets: Target[], length: NarrationLength) {
  return (value: unknown): string[] => {
    const v = value as { intro?: unknown; pages?: unknown } | null;
    if (!v || typeof v !== "object") return ["Reply with a JSON object."];
    const issues: string[] = [];
    const { min, max } = NARRATION_LENGTHS[length];
    const check = (label: string, script: string, answers: string[]) => {
      if (!script) return void issues.push(`${label} is empty.`);
      const n = wordCount(script);
      if (n < min * 0.75 || n > max * 1.25) issues.push(`${label} is ${n} words; keep it between ${min} and ${max}.`);
      const spoiler = spoilerIn(script, answers);
      if (spoiler) issues.push(`${label} gives away an answer ("${spoiler}"). Hint at the question, never the answer.`);
    };
    if (targets.includes("intro")) check("The course introduction", text(v.intro), []);
    const pages = Array.isArray(v.pages) ? (v.pages as { id?: unknown; script?: unknown }[]) : [];
    for (const id of targets.filter((t) => t !== "intro")) {
      const got = pages.find((p) => p?.id === id);
      const page = doc.pages.find((p) => p.id === id)!;
      if (!got) issues.push(`Write the introduction for page id ${id}.`);
      else check(`The introduction to “${page.title || id}”`, text(got.script), answersOn(page));
    }
    const extra = pages.filter((p) => !targets.includes(String(p?.id)));
    if (extra.length) issues.push(`Only write the scripts asked for (not ${extra.map((p) => String(p?.id)).join(", ")}).`);
    return issues;
  };
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

/** Records one approved script with ElevenLabs and keeps it as a hub upload, ready to attach to its page. */
export async function recordNarration(
  db: Db,
  actor: User,
  guideId: string,
  input: { script?: unknown; voice?: unknown; target?: unknown },
  now: Date,
): Promise<NarrationAudio> {
  requireGuide(db, actor, guideId);
  const script = text(input.script);
  if (!script) throw new HttpError(400, "There’s no script to record.");
  if (script.length > 1200) throw new HttpError(400, "That script is too long to record. Keep it under 1,200 characters.");
  const voice =
    typeof input.voice === "string" && (/^[A-Za-z0-9]{8,40}$/.test(input.voice) || /^openai:[a-z]{2,20}$/.test(input.voice)) ? input.voice : "topic";
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const recent = db.prepare("SELECT COUNT(*) AS n FROM audit WHERE actor = ? AND event = 'magazine.narration_recorded' AND at > ?").get(actor.id, since) as {
    n: number;
  };
  if (recent.n >= PER_HOUR) throw new HttpError(429, "That’s a lot of recordings in an hour. Take a short break, then try again.");
  // OpenAI's voices read it as a plain MP3 (no word timings); the hub's narrator and ElevenLabs voices come with timings.
  const { audio, words } = voice.startsWith("openai:")
    ? { audio: await openaiSpeech(script, voice.slice("openai:".length)), words: null }
    : await speakWithTimings(script, voice === "topic" ? undefined : voice);
  const label = script
    .replace(/[^\w .,-]/g, "")
    .slice(0, 50)
    .trim();
  const saved = await saveUpload(
    db,
    actor,
    new File([new Uint8Array(audio)], `Audio guide – ${label}.mp3`, { type: "audio/mpeg" }),
    { width: 0, height: 0 },
    now,
  );
  const seconds = words?.length ? Math.round(words[words.length - 1].end * 10) / 10 : (mp3Seconds(audio) ?? secondsFor(wordCount(script)));
  audit(db, {
    actor: actor.id,
    event: "magazine.narration_recorded",
    entity: guideId,
    next: {
      target: String(input.target ?? "").slice(0, 60),
      voice,
      model: voice.startsWith("openai:") ? "openai-tts" : ttsConfig().modelId,
      characters: script.length,
      seconds,
    },
    at: now,
  });
  return { src: saved.src, seconds, words, scriptHash: textHash(script), voice, at: now.toISOString() };
}

type Voice = { voiceId: string; name: string; description: string };
let voiceCache: { at: number; voices: Voice[]; note: string | null } | null = null;

/** The ElevenLabs voices this hub's key can use, for "Choose another voice". Kept for an hour. */
export async function narrationVoices(
  actor: User,
  now = Date.now(),
): Promise<{ topic: { name: string }; voices: Voice[]; openai: { id: string; label: string }[]; note: string | null }> {
  requireAuthor(actor);
  const topic = { name: "Claire, Calm & Friendly (the Topic narrator)" };
  // OpenAI's voices, with the hub's OpenAI key: an alternative when ElevenLabs is out of credit.
  const openai = openaiReady() ? OPENAI_VOICES : [];
  const { apiKey } = ttsConfig();
  if (!apiKey)
    return { topic, voices: [], openai, note: openai.length ? null : "ElevenLabs isn’t connected. Add ELEVENLABS_API_KEY (or OPENAI_API_KEY) to .env.local." };
  if (voiceCache && now - voiceCache.at < 3600_000) return { topic, voices: voiceCache.voices, openai, note: voiceCache.note };
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
  return { topic, voices, openai, note };
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
  const check = narrationIssues(doc, targets, "standard");
  const prompt = narrationPrompt({ title: g.title, standfirst: g.standfirst, audience: audienceText(g.audience), doc, targets, length: "standard", note: "" });
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
