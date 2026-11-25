import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { lessons, type Lesson } from "@/content/lessons";
import { blankLesson } from "@/content/blankLesson";
import { createLesson, editorLesson, publishLesson } from "./authoredLessons";
import { syncPublishedLessons } from "./lessonRegistry";
import { defaultPresenter, presenters, savePresenter } from "./introPresenters";
import {
  applyIntroMigration,
  bulkIntro,
  draftIntroScript,
  introIssues,
  introMigrationPreview,
  introOverview,
  introPrompt,
  introStats,
  recordIntroEvent,
  type IntroDrafter,
} from "./topicIntros";
import { synthesia, videoGenerationEnabled } from "./videoProviders";
import { avaSpeaks, scriptFor } from "./tts";
import { DEFAULT_PRESENTER, introCardOf, isIntroCard } from "@/lib/topicIntro";
import { buildTopic } from "@/lib/alisBuild";
import { ALIS_MODULES, ALIS_PARTS, ALIS_SUPPORT_NOTE } from "@/content/alisCourse";

/* Topic Video Introductions on the server: presenters, drafting with an injected fake, bulk actions, the migration and analytics. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  syncPublishedLessons(db);
});
afterEach(() => vi.restoreAllMocks());
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-11-25T01:00:00Z");
const SCRIPT =
  "Your client asks you to stay a little longer, and it feels like the kind thing to do. But does a longer visit change what they pay? In this topic, you'll explore what extra time means for the service and the budget, and what to confirm before you agree.";

/** A fake drafter: records its prompts and never reaches a paid service. */
function fake(script = SCRIPT) {
  const prompts: string[] = [];
  const drafter: IntroDrafter = async (prompt, check) => {
    prompts.push(prompt);
    expect(check({ script })).toEqual([]);
    return { value: { script }, model: "fake-model", usage: null };
  };
  return { drafter, prompts };
}

/** An old topic, saved before Introduction cards existed: written straight to the table, as it was. */
function oldTopic(slug: string, first: "image" | "presenter", published: boolean): Lesson {
  const l = blankLesson();
  delete l.nodes.intro;
  l.slug = slug;
  l.title = `ZZ Test ${slug}`;
  l.summary = "A throwaway topic for the tests.";
  l.version = published ? "1.3" : "0.1";
  l.start = "hook";
  l.nodes.hook =
    first === "presenter"
      ? {
          id: "hook",
          type: "presenter",
          beat: 0,
          label: "Hook",
          heading: "A call",
          body: "",
          transcript: SCRIPT,
          durationSec: 22,
          visual: {
            kind: "presenter",
            name: "Trainer",
            synthetic: false,
            tone: "teal",
            alt: "",
            video: { provider: "upload", id: "", title: "Hook", orientation: "portrait", src: "/api/uploads/hook.mp4" },
          },
          next: "check",
        }
      : { id: "hook", type: "image", beat: 0, label: "Hook", heading: "A call", body: "Mara calls.", visual: { kind: "none" }, next: "check" };
  (l.nodes.check as Extract<Lesson["nodes"][string], { type: "quiz" }>).assessment = { passMark: 80 };
  const json = JSON.stringify(l);
  db.prepare(
    "INSERT INTO authored_lessons (slug, draft, published, created_by, created_at, updated_by, updated_at, published_at) VALUES (?, ?, ?, 'jordan', ?, 'jordan', ?, ?)",
  ).run(slug, json, published ? json : null, "2026-10-01T00:00:00Z", "2026-10-01T00:00:00Z", published ? "2026-10-01T00:00:00Z" : null);
  return l;
}
const row = (slug: string) =>
  db.prepare("SELECT * FROM authored_lessons WHERE slug = ?").get(slug) as { draft: string; published: string | null; published_at: string | null };

describe("presenter profiles", () => {
  it("seeds a default presenter who isn't Ava, from an existing library picture", () => {
    const p = defaultPresenter(db);
    expect(p).toMatchObject({ id: DEFAULT_PRESENTER.id, isDefault: true, active: true, provider: "synthesia", language: "en-AU" });
    expect(p.name).not.toMatch(/ava/i);
    expect(p.portrait.src).toMatch(/^\/api\/uploads\//);
  });

  it("adds presenters, keeps one default, and won't make Ava the default", () => {
    const sam = savePresenter(db, u("jordan"), { name: "Sam Lee", portrait: { src: "/api/uploads/sam.webp", width: 720, height: 1280 }, voiceId: "v1" }, now);
    expect(sam).toMatchObject({ id: "sam-lee", isDefault: false, voiceId: "v1", accent: "Australian" });
    savePresenter(db, u("jordan"), { id: "sam-lee", isDefault: true }, now);
    expect(
      presenters(db)
        .filter((p) => p.isDefault)
        .map((p) => p.id),
    ).toEqual(["sam-lee"]);
    expect(() => savePresenter(db, u("jordan"), { name: "Ava", isDefault: true, portrait: { src: "/images/x.webp", width: 1, height: 2 } }, now)).toThrow(
      /Ava/,
    );
    expect(() => savePresenter(db, u("sam"), { name: "X", portrait: { src: "/images/x.webp", width: 1, height: 2 } }, now)).toThrow();
  });
});

describe("new topics", () => {
  it("are created with their Introduction card first", () => {
    const { slug } = createLesson(db, u("jordan"), { ...blankLesson(), title: "ZZ Test new topic" }, now);
    const l = editorLesson(db, slug)!.lesson;
    expect(isIntroCard(l.nodes[l.start])).toBe(true);
    // Even one saved without it (an API client, say) gets it.
    const bare = { ...blankLesson(), title: "ZZ Test bare" };
    delete bare.nodes.intro;
    bare.start = "check";
    const made = editorLesson(db, createLesson(db, u("jordan"), bare, now).slug)!.lesson;
    expect(isIntroCard(made.nodes[made.start])).toBe(true);
    expect(introCardOf(made)!.next).toBe("check");
  });

  it("follow a change to the presenter's portrait, in the draft and what learners see, unless they have their own", () => {
    const a = createLesson(db, u("jordan"), { ...blankLesson(), title: "ZZ Test follows presenter" }, now).slug;
    const b = createLesson(db, u("jordan"), { ...blankLesson(), title: "ZZ Test own picture" }, now).slug;
    publishLesson(db, u("jordan"), a, now);
    const own = editorLesson(db, b)!.lesson;
    introCardOf(own)!.intro.placeholder = { src: "/api/uploads/own.webp", width: 900, height: 1600 };
    db.prepare("UPDATE authored_lessons SET draft = ? WHERE slug = ?").run(JSON.stringify(own), b);

    const p = defaultPresenter(db);
    savePresenter(db, u("jordan"), { id: p.id, portrait: { src: "/api/uploads/new-face.webp", width: 1080, height: 1920, position: "50% 30%" } }, now);

    const card = (slug: string, which: "draft" | "published") => {
      const r = db.prepare(`SELECT ${which} AS j FROM authored_lessons WHERE slug = ?`).get(slug) as { j: string };
      const c = introCardOf(JSON.parse(r.j) as Lesson)!;
      return c.visual.kind === "presenter" ? c.visual.photo?.src : null;
    };
    expect(card(a, "draft")).toBe("/api/uploads/new-face.webp");
    expect(card(a, "published")).toBe("/api/uploads/new-face.webp");
    expect(card(b, "draft")).not.toBe("/api/uploads/new-face.webp");
  });
});

describe("drafting the script", () => {
  it("writes from the topic's context through the injected drafter, with words and duration", async () => {
    const l = oldTopic("zz-draft", "image", false);
    const { drafter, prompts } = fake();
    const r = await draftIntroScript(db, u("jordan"), l, now, drafter);
    expect(r).toMatchObject({ script: SCRIPT, model: "fake-model", words: 49, seconds: 20 });
    expect(prompts[0]).toContain("Topic: ZZ Test zz-draft");
    expect(prompts[0]).toContain("Australian English");
    expect(prompts[0]).toContain("Hiring Runway Window");
    expect(prompts[0]).toContain("No unsupported clinical, financial or regulatory claims");
  });

  it("sends a script outside 35 to 70 words, or a formulaic one, back to be fixed", () => {
    expect(introIssues({ script: "Too short." })[0]).toMatch(/2 words; keep it between 35 and 70/);
    expect(introIssues({ script: `Welcome to this training module. ${SCRIPT}` }).join(" ")).toMatch(/training module/);
    expect(introIssues({ script: SCRIPT })).toEqual([]);
    expect(introIssues({})).toHaveLength(1);
  });

  it("leaves the questions' answers out of the prompt", () => {
    const l = oldTopic("zz-answers", "image", false);
    const q = l.nodes.check as Extract<Lesson["nodes"][string], { type: "quiz" }>;
    q.questions[0] = {
      ...q.questions[0],
      prompt: "What do you check first?",
      options: [
        { id: "a", label: "SECRET-RIGHT-ANSWER" },
        { id: "b", label: "Other" },
      ],
    };
    const prompt = introPrompt(l);
    expect(prompt).toContain("What do you check first?");
    expect(prompt).not.toContain("SECRET-RIGHT-ANSWER");
  });
});

describe("bulk actions", () => {
  it("estimates first, then generates missing scripts only with the estimate's confirmation", async () => {
    oldTopic("zz-bulk-a", "image", true);
    oldTopic("zz-bulk-b", "presenter", true);
    const { drafter, prompts } = fake();
    const est = (await bulkIntro(db, u("jordan"), { action: "estimate_scripts", slugs: ["zz-bulk-a", "zz-bulk-b"] }, now, drafter)) as {
      estimate: { calls: number };
      confirm: string;
      slugs: string[];
    };
    // The reused presenter card already has its script.
    expect(est.slugs).toEqual(["zz-bulk-a"]);
    expect(est.estimate.calls).toBe(1);
    expect(prompts).toHaveLength(0);
    await expect(bulkIntro(db, u("jordan"), { action: "generate_scripts", slugs: ["zz-bulk-a"], confirm: "wrong" }, now, drafter)).rejects.toThrow(/estimate/);
    expect(prompts).toHaveLength(0);
    const r = (await bulkIntro(db, u("jordan"), { action: "generate_scripts", slugs: ["zz-bulk-a"], confirm: est.confirm }, now, drafter)) as {
      done: string[];
    };
    expect(r.done).toEqual(["zz-bulk-a"]);
    expect(prompts).toHaveLength(1);
    // A draft to approve; what learners see is untouched.
    const draft = JSON.parse(row("zz-bulk-a").draft) as Lesson;
    expect(introCardOf(draft)!.intro.script).toMatchObject({ spoken: SCRIPT, status: "draft", origin: "ai" });
    const live = JSON.parse(row("zz-bulk-a").published!) as Lesson;
    expect(introCardOf(live)).toBeUndefined();
  });

  it("assigns presenters and placeholders, and prepares approved scripts without calling Synthesia", async () => {
    const create = vi.spyOn(synthesia, "createVideo");
    const status = vi.spyOn(synthesia, "videoStatus");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    oldTopic("zz-prod", "presenter", true);
    oldTopic("zz-none", "image", true);
    savePresenter(db, u("jordan"), { name: "Sam Lee", portrait: { src: "/api/uploads/sam.webp", width: 720, height: 1280 } }, now);
    await bulkIntro(db, u("jordan"), { action: "assign_presenter", slugs: ["zz-none"], presenterId: "sam-lee" }, now);
    const none = introCardOf(JSON.parse(row("zz-none").draft) as Lesson)!;
    expect(none.intro.presenter).toBe("sam-lee");
    expect(none.visual.kind === "presenter" && none.visual.photo?.src).toBe("/api/uploads/sam.webp");
    await bulkIntro(
      db,
      u("jordan"),
      { action: "replace_placeholder", slugs: ["zz-none"], picture: { src: "/api/uploads/own.webp", width: 900, height: 1600 } },
      now,
    );
    expect(introCardOf(JSON.parse(row("zz-none").draft) as Lesson)!.intro.placeholder?.src).toBe("/api/uploads/own.webp");

    const r = (await bulkIntro(db, u("jordan"), { action: "prepare_production", slugs: ["zz-prod", "zz-none"] }, now)) as {
      done: string[];
      skipped: { slug: string }[];
    };
    expect(r.done).toEqual(["zz-prod"]);
    expect(r.skipped.map((s) => s.slug)).toEqual(["zz-none"]);
    expect(introCardOf(JSON.parse(row("zz-prod").draft) as Lesson)!.intro.production?.state).toBe("ready");
    applyIntroMigration(db, u("jordan"), now);
    introOverview(db);
    expect(create).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(videoGenerationEnabled()).toBe(false);
  });

  it("refuses video generation at the adapter itself, without reaching Synthesia", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(synthesia.createVideo({ script: SCRIPT, title: "x", avatarId: "", voiceId: "", templateId: "", language: "en-AU" })).rejects.toThrow(
      /isn't switched on/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("the migration", () => {
  function learners() {
    // Jordan part-way through the published topic, on the hook card; Riley finished it.
    const attempt = {
      version: "1.3",
      nodeId: "hook",
      route: ["hook"],
      answers: {},
      status: "in_progress",
      startedAt: "2026-10-02T00:00:00Z",
      previousRoutes: [],
    };
    db.prepare("INSERT INTO lesson_progress (user_id, slug, attempt, saved_at) VALUES ('jordan', 'zz-mig-add', ?, ?)").run(
      JSON.stringify(attempt),
      "2026-10-02T00:00:00Z",
    );
    db.prepare(
      "INSERT INTO lesson_completions (user_id, lesson_slug, lesson_version, completed_at) VALUES ('riley', 'zz-mig-add', '1.3', '2026-10-03T00:00:00Z')",
    ).run();
  }

  it("previews without changing anything", () => {
    oldTopic("zz-mig-add", "image", true);
    oldTopic("zz-mig-reuse", "presenter", true);
    learners();
    const before = JSON.stringify(db.prepare("SELECT * FROM authored_lessons ORDER BY slug").all());
    const p = introMigrationPreview(db);
    expect(JSON.stringify(db.prepare("SELECT * FROM authored_lessons ORDER BY slug").all())).toBe(before);
    const mine = p.byTopic.filter((t) => t.slug.startsWith("zz-mig"));
    expect(mine).toEqual([
      { slug: "zz-mig-add", draft: "add", published: "add", video: false },
      { slug: "zz-mig-reuse", draft: "reuse", published: "reuse", video: true },
    ]);
    expect(p.wouldAdd).toBeGreaterThanOrEqual(1);
    expect(p.wouldReuseVideo).toBeGreaterThanOrEqual(1);
    expect(p.learnersInProgress).toBeGreaterThanOrEqual(1);
    expect(p.topics).toBe(p.haveIntro + p.wouldAdd + p.wouldReuse + p.wouldFold + p.wouldMove + p.duplicates);
  });

  it("adds or reuses the card in place, keeps progress, completions, assessments and versions, and does nothing the second time", () => {
    const old = oldTopic("zz-mig-add", "image", true);
    oldTopic("zz-mig-reuse", "presenter", true);
    oldTopic("zz-mig-draft", "image", false);
    learners();
    const progress = JSON.stringify(db.prepare("SELECT * FROM lesson_progress ORDER BY user_id, slug").all());
    const completions = JSON.stringify(db.prepare("SELECT * FROM lesson_completions ORDER BY id").all());
    const publishedAt = row("zz-mig-add").published_at;

    const first = applyIntroMigration(db, u("jordan"), now);
    expect(first.changed).toEqual(expect.arrayContaining(["zz-mig-add", "zz-mig-reuse", "zz-mig-draft"]));

    const live = JSON.parse(row("zz-mig-add").published!) as Lesson;
    const c = introCardOf(live)!;
    expect(live.start).toBe(c.id);
    expect(c.next).toBe("hook");
    // Same version, same completion rule and assessment, every card still there unchanged.
    expect(live.version).toBe("1.3");
    expect(live.completion).toEqual(old.completion);
    for (const id of Object.keys(old.nodes)) expect(live.nodes[id]).toEqual(old.nodes[id]);
    expect(row("zz-mig-add").published_at).toBe(publishedAt);
    // Learners: the saved attempt still matches the version and its card, so it resumes; completions are untouched.
    expect(JSON.stringify(db.prepare("SELECT * FROM lesson_progress ORDER BY user_id, slug").all())).toBe(progress);
    expect(JSON.stringify(db.prepare("SELECT * FROM lesson_completions ORDER BY id").all())).toBe(completions);
    const saved = JSON.parse((db.prepare("SELECT attempt FROM lesson_progress WHERE slug = 'zz-mig-add'").get() as { attempt: string }).attempt);
    expect(saved.version).toBe(live.version);
    expect(live.nodes[saved.nodeId]).toBeDefined();
    // The shared list learners read from has it.
    expect(lessons.find((l) => l.slug === "zz-mig-add")?.start).toBe(c.id);

    // Reused, not duplicated: one presenter card, which is now the introduction, with its video.
    const reused = JSON.parse(row("zz-mig-reuse").published!) as Lesson;
    expect(Object.values(reused.nodes).filter((n) => n.type === "presenter")).toHaveLength(1);
    expect(introCardOf(reused)!.intro.video?.src).toBe("/api/uploads/hook.mp4");

    // Never published: only the draft, still unpublished.
    expect(row("zz-mig-draft").published).toBeNull();
    const d = JSON.parse(row("zz-mig-draft").draft) as Lesson;
    expect(isIntroCard(d.nodes[d.start])).toBe(true);
    expect(d.version).toBe("0.1");

    // Idempotent.
    const all = JSON.stringify(db.prepare("SELECT slug, draft, published FROM authored_lessons ORDER BY slug").all());
    expect(applyIntroMigration(db, u("jordan"), now).changed).toEqual([]);
    expect(JSON.stringify(db.prepare("SELECT slug, draft, published FROM authored_lessons ORDER BY slug").all())).toBe(all);
    const after = introMigrationPreview(db);
    expect(after.haveIntro).toBe(after.topics);
  });

  /** An ALIS Topic as the builder used to make it: opening with a picture title card called "intro". */
  function oldAlis() {
    const m = ALIS_MODULES.find((x) => x.sensitive) ?? ALIS_MODULES[0];
    const l = { ...buildTopic(m, "1.0"), slug: `zz-${m.slug}` };
    const built = l.nodes.intro as Extract<Lesson["nodes"][string], { type: "presenter" }>;
    // The old builder put the part's cover on the title card.
    const c = ALIS_PARTS.find((p) => p.n === m.part)!.cover;
    const photo = { src: c.src, width: c.width, height: c.height, position: "center" };
    l.nodes.intro = {
      id: "intro",
      type: "image",
      beat: 0,
      label: built.label,
      heading: built.heading,
      // The old builder put the support note under the summary.
      body: `${built.body}\n\n*${ALIS_SUPPORT_NOTE}*`,
      visual: { kind: "illustration", variant: "petals", tone: "teal", icon: "shield", alt: built.visual.kind === "presenter" ? built.visual.alt : "", photo },
      next: built.next,
    };
    const json = JSON.stringify(l);
    db.prepare(
      "INSERT INTO authored_lessons (slug, draft, published, created_by, created_at, updated_by, updated_at, published_at) VALUES (?, ?, ?, 'jordan', ?, 'jordan', ?, ?)",
    ).run(l.slug, json, json, "2026-10-01T00:00:00Z", "2026-10-01T00:00:00Z", "2026-10-01T00:00:00Z");
    return { l, m };
  }

  it("folds a picture title card into the Introduction card, so ALIS Topics have one introduction and progress resumes on it", () => {
    const { l, m } = oldAlis();
    // Part-way, on the title card that's about to be folded; and finished.
    const attempt = {
      version: "1.0",
      nodeId: "intro",
      route: ["intro"],
      answers: { "done:intro": 1 },
      status: "in_progress",
      startedAt: "2026-10-02T00:00:00Z",
      previousRoutes: [],
    };
    db.prepare("INSERT INTO lesson_progress (user_id, slug, attempt, saved_at) VALUES ('jordan', ?, ?, ?)").run(
      l.slug,
      JSON.stringify(attempt),
      "2026-10-02T00:00:00Z",
    );
    db.prepare("INSERT INTO lesson_completions (user_id, lesson_slug, lesson_version, completed_at) VALUES ('riley', ?, '1.0', '2026-10-03T00:00:00Z')").run(
      l.slug,
    );
    const progress = JSON.stringify(db.prepare("SELECT * FROM lesson_progress ORDER BY user_id, slug").all());
    const completions = JSON.stringify(db.prepare("SELECT * FROM lesson_completions ORDER BY id").all());

    const preview = introMigrationPreview(db);
    expect(preview.byTopic.find((t) => t.slug === l.slug)).toMatchObject({ draft: "fold", published: "fold" });
    expect(preview.wouldFold).toBeGreaterThanOrEqual(1);
    expect(preview.foldPictures).toBeGreaterThanOrEqual(1);

    applyIntroMigration(db, u("jordan"), now);
    for (const which of ["draft", "published"] as const) {
      const after = JSON.parse(row(l.slug)[which]!) as Lesson;
      expect(Object.values(after.nodes).filter(isIntroCard), which).toHaveLength(1);
      expect(
        Object.values(after.nodes).filter((c) => c.type === "image" && c.heading === m.title),
        which,
      ).toEqual([]);
      const c = after.nodes[after.start];
      if (!isIntroCard(c)) throw new Error(which);
      expect(c.id).toBe("intro");
      expect(c.next).toBe(l.nodes.intro.type === "image" ? l.nodes.intro.next : "");
      expect(c.intro.origin).toBe("folded");
      expect(c.body).toContain(ALIS_SUPPORT_NOTE);
      expect(c.intro.placeholder?.src).toBe((l.nodes.intro.visual as { photo: { src: string } }).photo.src);
      expect(after.version).toBe("1.0");
      expect(after.completion).toEqual(l.completion);
      expect(after.nodes.check).toEqual(l.nodes.check);
    }
    // The saved attempt still names a card that exists (now the introduction) at the same version: it resumes there.
    expect(JSON.stringify(db.prepare("SELECT * FROM lesson_progress ORDER BY user_id, slug").all())).toBe(progress);
    expect(JSON.stringify(db.prepare("SELECT * FROM lesson_completions ORDER BY id").all())).toBe(completions);
    const live = JSON.parse(row(l.slug).published!) as Lesson;
    expect(isIntroCard(live.nodes[attempt.nodeId])).toBe(true);
    expect(attempt.route.every((id) => live.nodes[id])).toBe(true);
    // Again: nothing changes.
    const all = JSON.stringify(db.prepare("SELECT slug, draft, published FROM authored_lessons ORDER BY slug").all());
    expect(applyIntroMigration(db, u("jordan"), now).changed).toEqual([]);
    expect(JSON.stringify(db.prepare("SELECT slug, draft, published FROM authored_lessons ORDER BY slug").all())).toBe(all);
  });

  it("gives content-file topics a database copy at their shipped version", () => {
    const content = lessons.find((l) => l.track !== "reinforcement" && !db.prepare("SELECT 1 FROM authored_lessons WHERE slug = ?").get(l.slug))!;
    applyIntroMigration(db, u("jordan"), now);
    const r = row(content.slug);
    const live = JSON.parse(r.published!) as Lesson;
    expect(live.version).toBe(content.version);
    expect(isIntroCard(live.nodes[live.start])).toBe(true);
    expect(r.published_at).toBeNull();
  });

  it("keeps the published introduction until a replacement is published", () => {
    oldTopic("zz-mig-pub", "image", true);
    applyIntroMigration(db, u("jordan"), now);
    const before = row("zz-mig-pub").published;
    return bulkIntro(
      db,
      u("jordan"),
      { action: "replace_placeholder", slugs: ["zz-mig-pub"], picture: { src: "/api/uploads/new.webp", width: 900, height: 1600 } },
      now,
    ).then(() => {
      expect(row("zz-mig-pub").published).toBe(before);
      publishLesson(db, u("jordan"), "zz-mig-pub", now);
      expect(introCardOf(JSON.parse(row("zz-mig-pub").published!) as Lesson)!.intro.placeholder?.src).toBe("/api/uploads/new.webp");
    });
  });
});

describe("the spoken introduction", () => {
  it("is read from the Introduction card in the narrator's voice, not as Ava; an adopted Ava card stays hers", () => {
    const { slug } = createLesson(db, u("jordan"), { ...blankLesson(), title: "ZZ Test spoken", summary: "What this topic is about." }, now);
    const l = editorLesson(db, slug)!.lesson;
    const key = `lesson:${slug}:${l.start}`;
    expect(scriptFor(db, key, true)).toBe("ZZ Test spoken. What this topic is about.");
    expect(avaSpeaks(db, key, true)).toBe(false);
    oldTopic("zz-ava", "presenter", true);
    syncPublishedLessons(db);
    applyIntroMigration(db, u("jordan"), now);
    expect(scriptFor(db, "lesson:zz-ava:hook")).toBe(SCRIPT);
    expect(avaSpeaks(db, "lesson:zz-ava:hook")).toBe(true);
  });
});

describe("analytics", () => {
  it("records ids and numbers only, with the placeholder and video kept apart", () => {
    const base = { slug: "zz-stats", card: "topic-intro", version: "1.0" };
    recordIntroEvent(db, u("jordan"), { ...base, event: "view", media: "placeholder", key: "k-view-1" }, now);
    recordIntroEvent(db, u("jordan"), { ...base, event: "view", media: "placeholder", key: "k-view-1" }, now);
    recordIntroEvent(db, u("jordan"), { ...base, event: "leave", media: "placeholder", seconds: 7.25 }, now);
    recordIntroEvent(db, u("riley"), { ...base, event: "view", media: "video" }, now);
    recordIntroEvent(db, u("riley"), { ...base, event: "play", media: "video" }, now);
    recordIntroEvent(db, u("riley"), { ...base, event: "progress", media: "video", percent: 50 }, now);
    recordIntroEvent(db, u("riley"), { ...base, event: "skip", media: "video", percent: 50, note: "free text is ignored" }, now);
    expect(() => recordIntroEvent(db, u("riley"), { ...base, event: "typed", media: "video" }, now)).toThrow(/Unknown event/);
    expect(() => recordIntroEvent(db, u("riley"), { ...base, event: "view", media: "audio" }, now)).toThrow();

    const cols = (db.prepare("PRAGMA table_info(topic_intro_events)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toEqual(["id", "at", "received_at", "user_id", "audience", "slug", "card", "version", "event", "media", "seconds", "percent", "idem"]);
    const s = introStats(db, "zz-stats");
    expect(s.placeholder).toMatchObject({ views: 1, viewers: 1, plays: 0, averageSeconds: 7.3 });
    expect(s.video).toMatchObject({ views: 1, plays: 1, skips: 1, averagePercent: 50 });
  });
});
