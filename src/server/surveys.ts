import "server-only";
import { lessons } from "@/content/lessons";
import { AGREE, moduleFeedbackQuestions, type SurveyQuestion } from "@/content/surveys";
import { audit, tx, type Db } from "./db";
import { canAuthor, HttpError, requireAuthor, requireReporter, type User } from "./auth";

/*
  Surveys: asked when someone finishes a learning path, or a single topic.
  Only completions after the survey was attached count, so attaching one never surveys people about old work.
  Who answered is kept apart from what they answered, so anonymous answers stay anonymous.
*/

type SurveyRow = {
  id: string;
  name: string;
  description: string;
  anonymous: number;
  required: number;
  questions: string;
  archived: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};
type LinkRow = { survey_id: string; target_type: "path" | "lesson"; target_id: string; linked_at: string };
type Target = { type: "path" | "lesson"; id: string };
export type SurveyInput = { name: string; description?: string; anonymous?: boolean; required?: boolean; questions: SurveyQuestion[] };

const parse = (r: SurveyRow) => ({
  ...r,
  questions: JSON.parse(r.questions) as SurveyQuestion[],
  anonymous: Boolean(r.anonymous),
  required: Boolean(r.required),
});

function getSurvey(db: Db, id: string) {
  const row = db.prepare("SELECT * FROM surveys WHERE id = ? AND archived = 0").get(id) as SurveyRow | undefined;
  if (!row) throw new HttpError(404, "Survey not found.");
  return parse(row);
}

const pathName = (db: Db, id: string) =>
  (db.prepare("SELECT name FROM learning_paths WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? "Learning path";
const lessonTitle = (slug: string) => lessons.find((l) => l.slug === slug)?.title ?? slug;
const targetTitle = (db: Db, t: Target) => (t.type === "path" ? pathName(db, t.id) : lessonTitle(t.id));
const linksFor = (db: Db, surveyId: string) => db.prepare("SELECT * FROM survey_links WHERE survey_id = ?").all(surveyId) as LinkRow[];

/** Places a survey can be attached: every live learning path and every catalogue lesson. */
function attachable(db: Db) {
  const paths = (db.prepare("SELECT id, name FROM learning_paths WHERE archived = 0 ORDER BY name").all() as { id: string; name: string }[]).map((p) => ({
    type: "path" as const,
    id: p.id,
    title: p.name,
  }));
  const ls = lessons.filter((l) => l.track !== "reinforcement").map((l) => ({ type: "lesson" as const, id: l.slug, title: l.title }));
  const taken = new Map(
    (db.prepare("SELECT l.*, s.name FROM survey_links l JOIN surveys s ON s.id = l.survey_id").all() as (LinkRow & { name: string })[]).map((l) => [
      `${l.target_type}:${l.target_id}`,
      { surveyId: l.survey_id, surveyName: l.name },
    ]),
  );
  return [...paths, ...ls].map((t) => ({ ...t, current: taken.get(`${t.type}:${t.id}`) ?? null }));
}

function validate(input: SurveyInput) {
  const name = input.name?.trim();
  if (!name) throw new HttpError(400, "Give the survey a name.");
  if (!Array.isArray(input.questions) || !input.questions.length) throw new HttpError(400, "Add at least one question.");
  if (input.questions.length > 12) throw new HttpError(400, "Keep surveys to 12 questions or fewer.");
  const ids = new Set<string>();
  for (const q of input.questions) {
    if (!q.id || ids.has(q.id)) throw new HttpError(400, "Each question needs its own id.");
    ids.add(q.id);
    if (!q.prompt?.trim()) throw new HttpError(400, "Every question needs some wording.");
    if (!["rating", "confidence", "agree", "choice", "text"].includes(q.type)) throw new HttpError(400, `Unknown question type “${String(q.type)}”.`);
    if (q.type === "choice" && (!Array.isArray(q.options) || q.options.filter((o) => o.trim()).length < 2))
      throw new HttpError(400, `“${q.prompt}” needs at least two options.`);
  }
  return {
    name: name.slice(0, 120),
    description: (input.description ?? "").trim().slice(0, 300),
    anonymous: input.anonymous !== false,
    required: Boolean(input.required),
    questions: input.questions.map((q) => ({
      ...q,
      prompt: q.prompt.trim(),
      required: Boolean(q.required),
      ...(q.type === "choice" ? { options: q.options.map((o) => o.trim()).filter(Boolean) } : {}),
    })) as SurveyQuestion[],
  };
}

const orgScope = (actor: User) => (canAuthor(actor) ? null : actor.org_id);
const responsesFor = (db: Db, actor: User, surveyId: string) => {
  const org = orgScope(actor);
  return db
    .prepare(`SELECT * FROM survey_responses WHERE survey_id = ? ${org ? "AND org_id = ?" : ""} ORDER BY submitted_at DESC`)
    .all(...(org ? [surveyId, org] : [surveyId])) as {
    id: number;
    target_type: "path" | "lesson";
    target_id: string;
    org_id: string;
    user_id: string | null;
    answers: string;
    submitted_at: string;
  }[];
};

export function listSurveys(db: Db, actor: User) {
  requireReporter(actor);
  return (db.prepare("SELECT * FROM surveys WHERE archived = 0 ORDER BY name").all() as SurveyRow[]).map((r) => {
    const s = parse(r);
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      anonymous: s.anonymous,
      required: s.required,
      questions: s.questions.length,
      usedOn: linksFor(db, s.id).map((l) => ({ type: l.target_type, id: l.target_id, title: targetTitle(db, { type: l.target_type, id: l.target_id }) })),
      responses: responsesFor(db, actor, s.id).length,
    };
  });
}

export function surveyDetail(db: Db, actor: User, id: string) {
  requireReporter(actor);
  const s = getSurvey(db, id);
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    anonymous: s.anonymous,
    required: s.required,
    questions: s.questions,
    links: linksFor(db, id).map((l) => ({ type: l.target_type, id: l.target_id })),
    attachable: attachable(db),
    canEdit: canAuthor(actor),
  };
}

export function createSurvey(db: Db, actor: User, input: Partial<SurveyInput> & { template?: "module" | "blank" }, now: Date) {
  requireAuthor(actor);
  const v = validate({
    name: input.name ?? (input.template === "blank" ? "Untitled survey" : "Learning path feedback"),
    description: input.description,
    anonymous: input.anonymous,
    required: input.required,
    questions:
      input.questions ??
      (input.template === "blank" ? [{ id: "q1", type: "rating", prompt: "How useful was this?", required: true }] : moduleFeedbackQuestions),
  });
  const base =
    v.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "survey";
  let id = `sv-${base}`;
  for (let n = 2; db.prepare("SELECT 1 FROM surveys WHERE id = ?").get(id); n++) id = `sv-${base}-${n}`;
  const at = now.toISOString();
  db.prepare(
    "INSERT INTO surveys (id, name, description, anonymous, required, questions, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, v.name, v.description, v.anonymous ? 1 : 0, v.required ? 1 : 0, JSON.stringify(v.questions), actor.id, at, at);
  audit(db, { actor: actor.id, event: "survey.created", entity: `survey:${id}`, next: v, at: now });
  return { id };
}

export function updateSurvey(db: Db, actor: User, id: string, input: SurveyInput, now: Date) {
  requireAuthor(actor);
  const before = getSurvey(db, id);
  const v = validate(input);
  // Anonymity can only be tightened once people have answered, never loosened.
  if (before.anonymous && !v.anonymous && responsesFor(db, actor, id).length)
    throw new HttpError(409, "People answered this survey anonymously, so it has to stay anonymous. Make a copy instead.");
  db.prepare("UPDATE surveys SET name = ?, description = ?, anonymous = ?, required = ?, questions = ?, updated_at = ? WHERE id = ?").run(
    v.name,
    v.description,
    v.anonymous ? 1 : 0,
    v.required ? 1 : 0,
    JSON.stringify(v.questions),
    now.toISOString(),
    id,
  );
  audit(db, {
    actor: actor.id,
    event: "survey.updated",
    entity: `survey:${id}`,
    previous: { ...before, questions: before.questions.length },
    next: { ...v, questions: v.questions.length },
    at: now,
  });
}

/** Archiving stops the survey being asked. Answers are kept for the record. */
export function archiveSurvey(db: Db, actor: User, id: string, now: Date) {
  requireAuthor(actor);
  getSurvey(db, id);
  tx(db, () => {
    db.prepare("UPDATE surveys SET archived = 1, updated_at = ? WHERE id = ?").run(now.toISOString(), id);
    db.prepare("DELETE FROM survey_links WHERE survey_id = ?").run(id);
    audit(db, { actor: actor.id, event: "survey.archived", entity: `survey:${id}`, at: now });
  });
}

/** Replaces where this survey is asked. A place that had another survey moves to this one. */
export function setSurveyLinks(db: Db, actor: User, id: string, targets: Target[], now: Date) {
  requireAuthor(actor);
  getSurvey(db, id);
  // Places it's already asked at stay valid even if that path has since been deleted, so the survey can still be saved.
  const valid = new Set([...attachable(db).map((t) => `${t.type}:${t.id}`), ...linksFor(db, id).map((l) => `${l.target_type}:${l.target_id}`)]);
  for (const t of targets) if (!valid.has(`${t.type}:${t.id}`)) throw new HttpError(400, "That learning path or topic doesn’t exist.");
  const at = now.toISOString();
  const keep = new Map(linksFor(db, id).map((l) => [`${l.target_type}:${l.target_id}`, l.linked_at]));
  tx(db, () => {
    db.prepare("DELETE FROM survey_links WHERE survey_id = ?").run(id);
    for (const t of targets) {
      db.prepare("DELETE FROM survey_links WHERE target_type = ? AND target_id = ?").run(t.type, t.id);
      // Places already linked keep their original date, so nobody new is pulled in by a re-save.
      db.prepare("INSERT INTO survey_links VALUES (?, ?, ?, ?)").run(id, t.type, t.id, keep.get(`${t.type}:${t.id}`) ?? at);
    }
    audit(db, { actor: actor.id, event: "survey.linked", entity: `survey:${id}`, next: targets, at: now });
  });
}

/** Surveys waiting for this person: they finished a linked lesson or path after the survey was attached. */
export function pendingSurveys(db: Db, user: User, onlyForLesson?: string) {
  const links = db.prepare("SELECT l.* FROM survey_links l JOIN surveys s ON s.id = l.survey_id WHERE s.archived = 0").all() as LinkRow[];
  const done = new Map(
    (
      db.prepare("SELECT lesson_slug, MAX(completed_at) AS at FROM lesson_completions WHERE user_id = ? GROUP BY lesson_slug").all(user.id) as {
        lesson_slug: string;
        at: string;
      }[]
    ).map((r) => [r.lesson_slug, r.at]),
  );
  const answered = new Set(
    (
      db.prepare("SELECT survey_id, target_type, target_id FROM survey_status WHERE user_id = ?").all(user.id) as {
        survey_id: string;
        target_type: string;
        target_id: string;
      }[]
    ).map((r) => `${r.survey_id}|${r.target_type}:${r.target_id}`),
  );
  const out: { survey: ReturnType<typeof publicSurvey>; target: Target & { title: string }; finishedAt: string }[] = [];
  for (const l of links) {
    if (answered.has(`${l.survey_id}|${l.target_type}:${l.target_id}`)) continue;
    let finishedAt: string | undefined;
    if (l.target_type === "lesson") {
      if (onlyForLesson && l.target_id !== onlyForLesson) continue;
      finishedAt = done.get(l.target_id);
    } else {
      const assigned = db
        .prepare("SELECT 1 FROM learning_path_assignments a JOIN learning_paths p ON p.id = a.path_id WHERE a.user_id = ? AND a.path_id = ? AND p.archived = 0")
        .get(user.id, l.target_id);
      const slugs = (db.prepare("SELECT lesson_slug FROM learning_path_lessons WHERE path_id = ?").all(l.target_id) as { lesson_slug: string }[]).map(
        (r) => r.lesson_slug,
      );
      if (!assigned || !slugs.length || slugs.some((s) => !done.has(s))) continue;
      if (onlyForLesson && !slugs.includes(onlyForLesson)) continue;
      finishedAt = slugs
        .map((s) => done.get(s)!)
        .sort()
        .at(-1);
    }
    if (!finishedAt || finishedAt < l.linked_at) continue;
    out.push({
      survey: publicSurvey(getSurvey(db, l.survey_id)),
      target: { type: l.target_type, id: l.target_id, title: targetTitle(db, { type: l.target_type, id: l.target_id }) },
      finishedAt,
    });
  }
  // Path surveys first: finishing a whole learning path is the bigger moment.
  return out.sort((a, b) => (a.target.type === b.target.type ? 0 : a.target.type === "path" ? -1 : 1));
}

const publicSurvey = (s: ReturnType<typeof getSurvey>) => ({
  id: s.id,
  name: s.name,
  description: s.description,
  anonymous: s.anonymous,
  required: s.required,
  questions: s.questions,
});

function checkAnswers(questions: SurveyQuestion[], answers: Record<string, unknown>) {
  const clean: Record<string, string | number> = {};
  for (const q of questions) {
    const v = answers?.[q.id];
    const empty = v === undefined || v === null || v === "";
    if (empty) {
      if (q.required) throw new HttpError(400, `Please answer “${q.prompt}”.`);
      continue;
    }
    if (q.type === "rating" || q.type === "confidence") {
      if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 5) throw new HttpError(400, `“${q.prompt}” needs a score from 1 to 5.`);
      clean[q.id] = v as number;
    } else if (q.type === "agree") {
      if (!AGREE.includes(v as string)) throw new HttpError(400, `Choose an option for “${q.prompt}”.`);
      clean[q.id] = v as string;
    } else if (q.type === "choice") {
      if (!q.options.includes(v as string)) throw new HttpError(400, `Choose an option for “${q.prompt}”.`);
      clean[q.id] = v as string;
    } else {
      clean[q.id] = String(v).trim().slice(0, 1000);
    }
  }
  return clean;
}

function requirePending(db: Db, user: User, surveyId: string, target: Target) {
  const p = pendingSurveys(db, user).find((x) => x.survey.id === surveyId && x.target.type === target.type && x.target.id === target.id);
  if (!p) throw new HttpError(409, "This survey isn’t waiting for you. It may already be answered.");
  return p;
}

export function submitSurvey(db: Db, user: User, surveyId: string, target: Target, answers: Record<string, unknown>, now: Date) {
  const p = requirePending(db, user, surveyId, target);
  const clean = checkAnswers(p.survey.questions, answers);
  const at = now.toISOString();
  tx(db, () => {
    db.prepare("INSERT INTO survey_responses (survey_id, target_type, target_id, org_id, user_id, answers, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      surveyId,
      target.type,
      target.id,
      user.org_id,
      p.survey.anonymous ? null : user.id,
      JSON.stringify(clean),
      at,
    );
    db.prepare("INSERT INTO survey_status VALUES (?, ?, ?, ?, 'submitted', ?)").run(surveyId, user.id, target.type, target.id, at);
  });
  return { ok: true };
}

export function skipSurvey(db: Db, user: User, surveyId: string, target: Target, now: Date) {
  const p = requirePending(db, user, surveyId, target);
  if (p.survey.required) throw new HttpError(409, "This survey is required. It only takes a minute.");
  db.prepare("INSERT INTO survey_status VALUES (?, ?, ?, ?, 'skipped', ?)").run(surveyId, user.id, target.type, target.id, now.toISOString());
  return { ok: true };
}

/** Results for one survey, filtered to a place if given. Organisation admins see their own organisation only. */
export function surveyResults(db: Db, actor: User, id: string, place?: string) {
  requireReporter(actor);
  const s = getSurvey(db, id);
  const all = responsesFor(db, actor, id);
  const rows = place ? all.filter((r) => `${r.target_type}:${r.target_id}` === place) : all;
  const orgs = new Map((db.prepare("SELECT id, name FROM orgs").all() as { id: string; name: string }[]).map((o) => [o.id, o.name]));
  const names = new Map((db.prepare("SELECT id, name FROM users").all() as { id: string; name: string }[]).map((u) => [u.id, u.name]));
  const answers = rows.map((r) => JSON.parse(r.answers) as Record<string, string | number>);
  const org = orgScope(actor);
  const skipped = (
    db
      .prepare(
        `SELECT COUNT(*) n FROM survey_status st JOIN users u ON u.id = st.user_id WHERE st.survey_id = ? AND st.status = 'skipped' ${org ? "AND u.org_id = ?" : ""}`,
      )
      .get(...(org ? [id, org] : [id])) as { n: number }
  ).n;
  const places = [...new Set(all.map((r) => `${r.target_type}:${r.target_id}`))].map((k) => {
    const [type, tid] = k.split(":") as ["path" | "lesson", string];
    return { key: k, title: targetTitle(db, { type, id: tid }), type, count: all.filter((r) => `${r.target_type}:${r.target_id}` === k).length };
  });
  return {
    id: s.id,
    name: s.name,
    anonymous: s.anonymous,
    total: rows.length,
    skipped,
    places,
    questions: s.questions.map((q) => {
      const vals = answers.map((a) => a[q.id]).filter((v) => v !== undefined && v !== "");
      if (q.type === "rating" || q.type === "confidence") {
        const nums = vals as number[];
        return {
          ...q,
          answered: nums.length,
          average: nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null,
          counts: [1, 2, 3, 4, 5].map((n) => ({ label: String(n), count: nums.filter((v) => v === n).length })),
        };
      }
      if (q.type === "agree" || q.type === "choice") {
        const opts = q.type === "agree" ? AGREE : q.options;
        return { ...q, answered: vals.length, average: null, counts: opts.map((o) => ({ label: o, count: vals.filter((v) => v === o).length })) };
      }
      return {
        ...q,
        answered: vals.length,
        average: null,
        counts: [],
        comments: rows
          .map((r, i) => ({
            text: answers[i][q.id] as string | undefined,
            at: r.submitted_at,
            org: orgs.get(r.org_id) ?? r.org_id,
            name: !s.anonymous && r.user_id ? (names.get(r.user_id) ?? null) : null,
          }))
          .filter((c) => c.text),
      };
    }),
  };
}

const csvCell = (v: unknown) => {
  const t = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export function surveyCsv(db: Db, actor: User, id: string) {
  requireReporter(actor);
  const s = getSurvey(db, id);
  const orgs = new Map((db.prepare("SELECT id, name FROM orgs").all() as { id: string; name: string }[]).map((o) => [o.id, o.name]));
  const names = new Map((db.prepare("SELECT id, name FROM users").all() as { id: string; name: string }[]).map((u) => [u.id, u.name]));
  const head = ["Submitted", "Where", "Organisation", ...(s.anonymous ? [] : ["Person"]), ...s.questions.map((q) => q.prompt)];
  const lines = responsesFor(db, actor, id).map((r) => {
    const a = JSON.parse(r.answers) as Record<string, unknown>;
    return [
      r.submitted_at,
      targetTitle(db, { type: r.target_type, id: r.target_id }),
      orgs.get(r.org_id),
      ...(s.anonymous ? [] : [r.user_id ? names.get(r.user_id) : ""]),
      ...s.questions.map((q) => a[q.id]),
    ];
  });
  return { filename: `${s.id}.csv`, body: [head, ...lines].map((l) => l.map(csvCell).join(",")).join("\n") };
}
