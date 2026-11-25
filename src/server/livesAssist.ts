import "server-only";
import { bibleBrief, cleanId, isOut, LIFE_EVENT_CATEGORIES, storyOrder } from "@/lib/livesInProgress";
import { askForJson } from "./claudeJson";
import { audit, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { claudeConfigured, openaiJson, openaiReady } from "./openaiText";
import { approvedBible, ensureLives, lifeEvents, livesSettings, memberArcs, memberCast, memberEpisodes } from "./livesInProgress";
import { categoryOf, MOMENT_CATEGORIES } from "@/lib/lifeMoments";
import { BALANCE_BUCKETS, cleanRoutine, dayNumber, dayString, localDay, monthGrid, routineWhen, spreadSchedule } from "@/lib/livingCalendar";
import { catalogueInfo } from "./learningPaths";

/*
  The AI Story Assistant (Admin → Lives in Progress, docs/lives-in-progress.md). It proposes; it never decides. An
  author asks for one thing at a time: an arc, an episode, first-person lines, an image prompt, or a review (for
  inconsistencies, authenticity, competencies, other perspectives and missed learning). The model sees the approved
  Bible, the supporting cast, earlier arcs and published episodes, the Life Event Bank and the Hub's published
  learning titles. Never a draft Bible, never a learner's conversation.

  Nothing is saved by asking. The author takes what they want into the editor, where it is a draft like any other
  and goes through review and approval before anyone sees it. Nothing is ever scheduled or published from here.
*/

export const ASSIST_KINDS = ["arc", "episode", "dialogue", "image", "review", "moment", "moments"] as const;
export type AssistKind = (typeof ASSIST_KINDS)[number];
const PER_HOUR = 40;

type Ask = <T>(prompt: string, check: (v: unknown) => string[]) => Promise<T>;
const defaultAsk: Ask = async <T>(prompt: string, check: (v: unknown) => string[]) =>
  claudeConfigured()
    ? (await askForJson<T>([{ type: "text", text: prompt }], check, { onText: () => {}, onPhase: () => {} }, "medium")).value
    : await openaiJson<T>(prompt, check);

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const strs = (v: unknown, max: number, each = 300) =>
  Array.isArray(v)
    ? v
        .slice(0, max)
        .map((x) => str(x, each))
        .filter(Boolean)
    : [];

const VOICE = `Write in plain Australian English. These are fictional people living ordinary lives with support at home, written like an interactive documentary or an episodic drama, not a course. First-person words must sound like the person talking, never like a lesson: no "it is important to", no principles explained, no praise of the listener. Give them ordinary days, good moments and humour as well as challenges. Never invent clinical, regulatory, funding or policy facts; if a beat needs one, say "needs an approved source". Never use a real person's details.`;

function context(db: Db, memberId: string, now: Date) {
  const bible = approvedBible(db, memberId);
  const cast = memberCast(db, memberId);
  const arcs = memberArcs(db, memberId).filter((a) => a.status !== "archived");
  const out = storyOrder(memberEpisodes(db, memberId).filter((e) => isOut(e, now)));
  const events = lifeEvents(db).filter((e) => !e.archived);
  const learning = [
    ...catalogueInfo(db)
      .filter((l) => !l.draft)
      .map((l) => `Topic: ${l.title}`),
    ...(db.prepare("SELECT title FROM magazine_guides WHERE status = 'published' ORDER BY title").all() as { title: string }[]).map(
      (g) => `Magazine: ${g.title}`,
    ),
    ...(db.prepare("SELECT name FROM learning_paths WHERE archived = 0 ORDER BY name").all() as { name: string }[]).map((p) => `Discovery Path: ${p.name}`),
  ].slice(0, 80);
  const text = [
    bible ? `The approved Character Bible:\n${bibleBrief(bible)}` : "There is no approved Character Bible yet: say so, and keep to what's below.",
    cast.length
      ? `Supporting cast (use only these people, or say a new one is needed):\n${cast.map((c) => `- [${c.id}] ${c.name}, ${c.relation}. ${c.personality} ${c.perspective}`).join("\n")}`
      : "No supporting cast yet.",
    arcs.length ? `Arcs so far:\n${arcs.map((a) => `- ${a.title} (${a.status}): ${a.summary}`).join("\n")}` : "No arcs yet.",
    out.length
      ? `Published episodes (what has actually happened, in order):\n${out.map((e) => `- Episode ${e.number}, ${e.title}: ${e.knowledge || e.story}`).join("\n")}`
      : "Nothing published yet.",
    `The Life Event Bank (suggest from these by id where one fits; ordinary life counts too):\n${events.map((e) => `- [${e.id}] ${LIFE_EVENT_CATEGORIES[e.category]}: ${e.title}. ${e.summary}`).join("\n")}`,
    `Published learning in the Hub (link only to these, by exact title):\n${learning.join("\n")}`,
  ].join("\n\n");
  return { text, bible, cast, events, learning };
}

/** One proposal for an author, by kind. `ask` is injectable so tests never call a model. */
export async function livesProposal(db: Db, actor: User, input: Record<string, unknown>, now: Date, ask: Ask = defaultAsk) {
  requireAuthor(actor);
  ensureLives(db, now);
  const kind = String(input.kind ?? "") as AssistKind;
  if (!ASSIST_KINDS.includes(kind)) throw new HttpError(400, "Choose what you’d like the assistant to suggest.");
  if (ask === defaultAsk && !claudeConfigured() && !openaiReady())
    throw new HttpError(503, "The assistant isn’t connected. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to the server and restart it.");
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const recent = db.prepare("SELECT COUNT(*) AS n FROM audit WHERE actor = ? AND event = 'lives.assist' AND at > ?").get(actor.id, since) as { n: number };
  if (recent.n >= PER_HOUR) throw new HttpError(429, "That’s a lot of suggestions in an hour. Take a short break, then try again.");
  if (kind === "moments") return momentSchedule(db, actor, input, now, ask);
  const memberId = cleanId(input.memberId);
  const name = (db.prepare("SELECT name FROM characters WHERE id = ?").get(memberId) as { name: string } | undefined)?.name;
  if (!name) throw new HttpError(404, "Choose a digital member first.");
  const ctx = context(db, memberId, now);
  const brief = obj(input.brief);
  const episode = typeof input.episodeId === "string" ? memberEpisodes(db, memberId).find((e) => e.id === input.episodeId) : undefined;
  const arc = typeof input.arcId === "string" ? memberArcs(db, memberId).find((a) => a.id === input.arcId) : undefined;
  const eventIds = new Set(ctx.events.map((e) => e.id));
  const castIds = new Set(ctx.cast.map((c) => c.id));
  const removed: string[] = [];
  let result: unknown;

  if (kind === "arc") {
    const n = Math.min(12, Math.max(3, Number(brief.episodes) || 6));
    const prompt = `${VOICE}\n\nYou are helping a learning author plan a new Story Arc for ${name}, a fictional person in Trilogy Care's Partner Hub ("Lives in Progress").\n\n${ctx.text}\n\nThe author's brief:\n- Theme: ${str(brief.theme, 300) || "(not given)"}\n- Duration: ${str(brief.duration, 60) || `${n} weeks`}\n- Learning objectives: ${str(brief.objectives, 600) || "(not given)"}\n- Desired behaviour change: ${str(brief.behaviour, 400) || "(not given)"}\n- Operational issue it relates to: ${str(brief.issue, 400) || "(none)"}\n- Supporting characters to include: ${str(brief.cast, 300) || "(your choice from the cast)"}\n- Emotional tone: ${str(brief.tone, 200) || "warm, honest, hopeful"}\n- Number of episodes: ${n}\n\nPropose an arc that continues from what has already happened and contradicts nothing in the Bible. Reply with JSON only:\n{"title": "...", "summary": "...", "starting": "...", "theme": "...", "resolution": "...", "reasoning": "why this structure, in two to four sentences", "learning": ["learning opportunity", ...], "events": ["life event id", ...], "episodes": [{"number": 1, "title": "...", "summary": "for authors", "story": "two sentences for learners, no lesson", "quote": "a line for the homepage card", "learning": "the learning opportunity it opens", "cast": ["cast id", ...], "events": ["life event id"]}]}`;
    const value = await ask<Record<string, unknown>>(prompt, (v) => {
      const o = obj(v);
      const issues: string[] = [];
      if (!str(o.title, 120)) issues.push("Missing title.");
      if (!Array.isArray(o.episodes) || o.episodes.length < 3) issues.push("Give at least three episodes.");
      return issues;
    });
    const eps = (Array.isArray(value.episodes) ? value.episodes : []).slice(0, 12).map((x, i) => {
      const e = obj(x);
      const cast = strs(e.cast, 6, 60).filter((c) => castIds.has(c) || (removed.push(`A cast member that isn’t in ${name}’s cast (${c}).`), false));
      const events = strs(e.events, 4, 60).filter((id) => eventIds.has(id) || (removed.push(`A life event that isn’t in the bank (${id}).`), false));
      return {
        number: i + 1,
        title: str(e.title, 120),
        summary: str(e.summary, 600),
        story: str(e.story, 600),
        quote: str(e.quote, 200),
        learning: str(e.learning, 200),
        cast,
        events,
      };
    });
    result = {
      title: str(value.title, 120),
      summary: str(value.summary, 1500),
      starting: str(value.starting, 800),
      theme: str(value.theme, 300),
      resolution: str(value.resolution, 800),
      reasoning: str(value.reasoning, 1200),
      learning: strs(value.learning, 10, 200),
      events: strs(value.events, 12, 60).filter((id) => eventIds.has(id)),
      episodes: eps,
    };
  } else if (kind === "episode" || kind === "dialogue") {
    const target = episode
      ? `Episode ${episode.number}, "${episode.title}": ${episode.summary || episode.story}`
      : `A new episode${arc ? ` in "${arc.title}" (${arc.summary})` : ""}`;
    const prompt = `${VOICE}\n\n${ctx.text}\n\n${arc ? `The arc: ${arc.title}. Theme: ${arc.theme}. ${arc.summary}\n\n` : ""}The episode: ${target}\nThe author's note: ${str(brief.note, 600) || "(none)"}\n\n${
      kind === "dialogue"
        ? `Write first-person words for ${name} in this episode. Reply with JSON only: {"dialogue": "two to four sentences", "quote": "one short line for the homepage card", "diary": "an audio diary of 60 to 110 words, as they'd say it out loud"}`
        : `Draft the episode. It must follow from what has been published and contradict nothing in the Bible. Reply with JSON only: {"title": "...", "summary": "for authors", "story": "two or three sentences for learners", "dialogue": "first person", "quote": "a homepage line", "diary": "an audio diary, 60 to 110 words", "knowledge": "what ${name} knows or feels afterwards", "teaser": "a teaser for the next episode that gives nothing away", "interactions": [{"kind": "conversation|decide|perspective|reflect", "label": "...", "body": "...", "castId": "for perspective", "options": [{"text": "...", "response": "${name}'s reaction, first person"}], "thought": "for reflect"}]}`
    }`;
    const value = await ask<Record<string, unknown>>(prompt, (v) => {
      const o = obj(v);
      return kind === "dialogue"
        ? str(o.dialogue, 2000)
          ? []
          : ["Missing dialogue."]
        : str(o.title, 120) && str(o.diary, 3000)
          ? []
          : ["Missing title or diary."];
    });
    const interactions = (Array.isArray(value.interactions) ? value.interactions : [])
      .slice(0, 4)
      .map((x) => obj(x))
      .filter((i) => ["conversation", "decide", "perspective", "reflect"].includes(String(i.kind)))
      .map((i) => ({
        kind: String(i.kind),
        label: str(i.label, 120),
        body: str(i.body, 1200),
        castId: castIds.has(String(i.castId)) ? String(i.castId) : "",
        options: (Array.isArray(i.options) ? i.options : []).slice(0, 4).map((o) => ({ text: str(obj(o).text, 240), response: str(obj(o).response, 800) })),
        thought: str(i.thought, 1200),
      }))
      .filter((i) => i.kind !== "perspective" || i.castId || (removed.push("A perspective from someone who isn’t in the cast."), false));
    result = {
      title: str(value.title, 120),
      summary: str(value.summary, 1200),
      story: str(value.story, 1500),
      dialogue: str(value.dialogue, 2500),
      quote: str(value.quote, 200),
      diary: str(value.diary, 3000),
      knowledge: str(value.knowledge, 1500),
      teaser: str(value.teaser, 300),
      interactions,
    };
  } else if (kind === "moment") {
    const category = categoryOf(str(brief.category, 40) || "everyday", livesSettings(db));
    const event = ctx.events.find((e) => e.id === str(brief.lifeEventId, 60));
    const prompt = `${VOICE}\n\n${ctx.text}\n\n${momentRules(name)}\n\nWrite one Life Moment for ${name}.\n- Category: ${category.label}\n${event ? `- From the Life Event Bank: ${event.title}. ${event.summary}\n` : ""}${arc ? `- It may follow the arc "${arc.title}", but only what's already published.\n` : ""}- The author's note: ${str(brief.note, 600) || "(none)"}\n\nReply with JSON only: {"headline": "under 12 words, third person", "body": "one sentence, or empty", "quote": "a line in their own words", "audioScript": "${category.id === "voice" ? "a 40 to 70 word voice message in their own words" : "empty"}", "imagePrompt": "a photograph that would suit it, matching the visual guide", "actionLabel": "a short button label, or empty", "continuity": "which Bible facts or episodes it rests on"}`;
    const value = await ask<Record<string, unknown>>(prompt, (v) => (str(obj(v).headline, 140) ? [] : ["Missing headline."]));
    result = {
      category: category.id,
      lifeEventId: event?.id ?? "",
      headline: str(value.headline, 140),
      body: str(value.body, 400),
      quote: str(value.quote, 400),
      audioScript: category.id === "voice" ? str(value.audioScript, 1500) : "",
      imagePrompt: str(value.imagePrompt, 1200),
      actionLabel: str(value.actionLabel, 60),
      continuity: str(value.continuity, 800),
    };
  } else if (kind === "image") {
    if (!episode) throw new HttpError(400, "Choose an episode.");
    const prompt = `Write an image-generation prompt for one photograph for this episode of a fictional person's story. Photographic, natural light, documentary style, dignified, no text in the image, no logos.\n\nHow they look (keep to this exactly): ${ctx.bible?.media.visualGuide || "(no visual guide yet: say so)"}\n\nThe episode: ${episode.title}. ${episode.story}\n\nReply with JSON only: {"prompt": "...", "alt": "alt text for the picture, one sentence"}`;
    const value = await ask<Record<string, unknown>>(prompt, (v) => (str(obj(v).prompt, 1200) ? [] : ["Missing prompt."]));
    result = { prompt: str(value.prompt, 1200), alt: str(value.alt, 300) };
  } else {
    const target = arc ? arc : episode ? memberArcs(db, memberId).find((a) => a.id === episode.arcId) : undefined;
    if (!target) throw new HttpError(400, "Choose an arc to review.");
    const eps = memberEpisodes(db, memberId).filter((e) => e.arcId === target.id && e.status !== "archived");
    const prompt = `${VOICE}\n\n${ctx.text}\n\nReview this arc for a learning author. Arc: ${target.title}. ${target.summary}\nEpisodes:\n${eps
      .map((e) => `- ${e.number}. ${e.title} [${e.status}]: ${e.story} First person: ${e.dialogue} Diary: ${e.diary}`)
      .join(
        "\n",
      )}\n\nReply with JSON only: {"inconsistencies": ["anything that contradicts the Bible or the published story"], "authenticity": ["lines that sound like a lesson, a brochure or an AI, with a better way to say them"], "competencies": ["capabilities the arc could support, in plain words"], "perspectives": ["another character's point of view worth showing"], "missed": ["learning opportunities the arc misses, with the Hub title that covers them if there is one"], "balance": "one sentence on whether there is enough ordinary life and good news"}`;
    const value = await ask<Record<string, unknown>>(prompt, (v) => (Array.isArray(obj(v).inconsistencies) ? [] : ["Missing inconsistencies list."]));
    result = {
      inconsistencies: strs(value.inconsistencies, 10, 400),
      authenticity: strs(value.authenticity, 10, 400),
      competencies: strs(value.competencies, 10, 200),
      perspectives: strs(value.perspectives, 6, 300),
      missed: strs(value.missed, 8, 300),
      balance: str(value.balance, 400),
    };
  }
  // The audit says a suggestion was asked for and about what; never what it said.
  audit(db, {
    actor: actor.id,
    event: "lives.assist",
    entity: `member:${memberId}`,
    next: { kind, arc: arc?.id ?? null, episode: episode?.id ?? null },
    at: now,
  });
  return {
    kind,
    proposal: result,
    removed,
    leanedOn: { bible: Boolean(ctx.bible), cast: ctx.cast.length, events: ctx.events.length, learning: ctx.learning.length },
  };
}

// ---------------------------------------------------------------------------------------------
// Life Moments (lib/lifeMoments)
// ---------------------------------------------------------------------------------------------

/** What every Life Moment proposal must respect. */
const momentRules = (name: string) =>
  `Life Moments are small things from ${name}'s days between episodes, shown as cards on the homepage: everyday moments, good news, reflections, voice messages, things coming up. Rules: keep to the Character Bible and what has been published; never anticipate or hint at an episode that isn't out yet; no new major life events (illness, death, a move, a new diagnosis, money trouble) — those need an approved story; most moments are ordinary and warm, and need no learning objective; first-person lines sound like the person, never like a lesson.`;

/**
  A proposed schedule of Life Moments across several members, for two weeks (or `weeks`), at about the Hub's
  configured cadence. Nothing is saved: the author ticks the ones they want, which become drafts.
*/
async function momentSchedule(db: Db, actor: User, input: Record<string, unknown>, now: Date, ask: Ask) {
  const ids = (Array.isArray(input.memberIds) ? input.memberIds : []).map(cleanId).filter(Boolean).slice(0, 8);
  const names = new Map(
    ids.flatMap((id) => {
      const r = db.prepare("SELECT name FROM characters WHERE id = ?").get(id) as { name: string } | undefined;
      return r ? [[id, r.name] as const] : [];
    }),
  );
  if (!names.size) throw new HttpError(400, "Choose at least one digital member.");
  const brief = obj(input.brief);
  // A fortnight (or up to four weeks) from tomorrow, or a whole month ("Generate a month"), never starting before tomorrow.
  const tomorrow = dayString(dayNumber(localDay(now.toISOString(), "Australia/Brisbane")) + 1);
  const month = typeof brief.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(brief.month) ? brief.month : "";
  const grid = month ? monthGrid(month) : null;
  const from = grid ? (grid.first > tomorrow ? grid.first : tomorrow) : tomorrow;
  const days = grid ? Math.max(0, dayNumber(grid.last) - dayNumber(from) + 1) : Math.min(4, Math.max(1, Number(brief.weeks) || 2)) * 7;
  if (!days) throw new HttpError(400, "That month has already gone.");
  const s = livesSettings(db);
  const total = Math.min(90, s.momentsPerDay * days);
  const voices = Math.min(10, Math.max(0, Math.round(Number(brief.voices) || 2)));
  const routines = (db.prepare("SELECT data FROM lip_routines WHERE status = 'approved'").all() as { data: string }[]).map((r) =>
    cleanRoutine(JSON.parse(r.data)),
  );
  const season = summerOrNot(from);
  const events = lifeEvents(db).filter((e) => !e.archived);
  const eventIds = new Set(events.map((e) => e.id));
  const categories = Object.keys(MOMENT_CATEGORIES).filter((c) => c !== "new_chapter");
  const people = [...names.entries()]
    .map(([id, name]) => {
      const b = approvedBible(db, id);
      const eps = memberEpisodes(db, id);
      const out = storyOrder(eps.filter((e) => isOut(e, now)));
      const coming = eps.filter((e) => e.status === "scheduled" && Date.parse(e.publishAt) > now.getTime());
      const recent = db
        .prepare("SELECT data FROM lip_moments WHERE member_id = ? AND status IN ('published','scheduled','approved') ORDER BY publish_at DESC LIMIT 8")
        .all(id) as { data: string }[];
      return [
        `## ${name} [${id}]`,
        b ? bibleBrief(b) : "No approved Bible: keep to everyday colour only.",
        out.length
          ? `Published so far:\n${out.map((e) => `- Episode ${e.number}, ${e.title}: ${e.knowledge || e.story}`).join("\n")}`
          : "No episodes published.",
        coming.length
          ? `Episodes still to come (dates only; you don't know what happens in them, so don't hint): ${coming.map((e) => `episode ${e.number} on day ${Math.floor((Date.parse(e.publishAt) - now.getTime()) / 86_400_000) + 1}`).join(", ")}`
          : "",
        recent.length
          ? `Moments already planned or shared (don't repeat them):\n${recent.map((r) => `- ${(JSON.parse(r.data) as { headline?: string }).headline}`).join("\n")}`
          : "",
        routines.some((r) => r.memberId === id)
          ? `Their usual routines (moments can come from these):\n${routines
              .filter((r) => r.memberId === id)
              .map((r) => `- ${r.title}: ${routineWhen(r)}`)
              .join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    })
    .join("\n\n");
  const prompt = `${VOICE}\n\n${momentRules("each person")}\n\nPeople:\n\n${people}\n\nThe Life Event Bank (use an id where one fits):\n${events.map((e) => `- [${e.id}] ${e.title}`).join("\n")}\n\nIt's ${season} in Australia. Propose about ${total} Life Moments for the ${days} days from ${from}, spread across the people, mixing categories: ${categories.join(", ")}. Aim for roughly this balance: ${(Object.keys(BALANCE_BUCKETS) as (keyof typeof BALANCE_BUCKETS)[]).map((b) => `${BALANCE_BUCKETS[b].label} ${s.balance[b]}%`).join(", ")}. Include ${voices} voice messages (category "voice", with a 40 to 70 word audioScript). The Hub chooses each moment's day and time, so give a "dayHint" only for something that must fall on a date (a birthday, Christmas). Reply with JSON only: {"moments": [{"memberId": "...", "dayHint": "", "category": "...", "headline": "...", "body": "...", "quote": "...", "audioScript": "", "lifeEventId": "", "continuity": "what it rests on"}]}`;
  const value = await ask<Record<string, unknown>>(prompt, (v) =>
    Array.isArray(obj(v).moments) && (obj(v).moments as unknown[]).length ? [] : ["Missing moments."],
  );
  const removed: string[] = [];
  const content = (value.moments as unknown[])
    .slice(0, 120)
    .map((x) => obj(x))
    .filter((m) => names.has(String(m.memberId)) || (removed.push(`A moment for someone you didn't choose (${String(m.memberId)}).`), false))
    .map((m) => {
      const category = categories.includes(String(m.category)) ? String(m.category) : "everyday";
      const lifeEventId = eventIds.has(String(m.lifeEventId)) ? String(m.lifeEventId) : "";
      if (m.lifeEventId && !lifeEventId) removed.push(`A life event that isn't in the bank (${String(m.lifeEventId)}).`);
      return {
        memberId: String(m.memberId),
        name: names.get(String(m.memberId)),
        category,
        headline: str(m.headline, 140),
        body: str(m.body, 400),
        quote: str(m.quote, 400),
        audioScript: category === "voice" ? str(m.audioScript, 1500) : "",
        lifeEventId,
        continuity: str(m.continuity, 800),
      };
    })
    .filter((m) => m.headline);
  // A little serendipity: the Hub, not the model, decides each day and time, the same way every time for the same
  // people and dates: uneven days, quiet days, no one on two days running, birthdays in the morning, reflections at night.
  const { placed, dropped } = spreadSchedule(content, { from, days, seed: [...names.keys()].sort().join(","), variety: s.variety });
  if (dropped) removed.push(`${dropped} more than the days can hold without crowding them.`);
  // Times are in Queensland time, which doesn't change in summer.
  const proposals = placed.map(({ date, time, ...m }) => ({ ...m, time, publishAt: new Date(`${date}T${time}:00+10:00`).toISOString() }));
  audit(db, {
    actor: actor.id,
    event: "lives.assist",
    entity: "lip_moments",
    next: { kind: month ? "month" : "moments", members: [...names.keys()], days },
    at: now,
  });
  return { kind: "moments" as const, proposal: { moments: proposals }, removed, leanedOn: { bible: true, cast: 0, events: events.length, learning: 0 } };
}

/** The season in Australia for a date: summer from December, autumn from March, and so on. */
function summerOrNot(date: string) {
  const m = Number(date.slice(5, 7));
  return m === 12 || m <= 2 ? "summer" : m <= 5 ? "autumn" : m <= 8 ? "winter" : "spring";
}
