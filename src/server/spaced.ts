import "server-only";
import { lessons } from "@/content/lessons";
import type { Db } from "./db";
import { audit } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { generatedFor, getLesson, lessonSetting } from "./lessonStore";
import { parseVersion, type PathVersionRow, type PinnedStep } from "./learning";
import { publish, submitForReview } from "./paths";
import { generateVariations } from "./generate";
import { lessonStatus, unpublishedLessons } from "./authoredLessons";

/* Spaced learning settings for master lessons: the checkbox, its variations and their status. */

function pathFor(db: Db, pathId: string | null | undefined) {
  if (!pathId) return { live: undefined, draft: undefined };
  const rows = (db.prepare("SELECT * FROM path_versions WHERE path_id = ? ORDER BY version DESC").all(pathId) as PathVersionRow[]).map(parseVersion);
  return { live: rows.find((r) => r.status === "published"), draft: rows.find((r) => r.status === "draft" || r.status === "in_review") };
}

function describe(db: Db, slug: string, step: PinnedStep, stage: string) {
  const s = step.followUpId.startsWith("lesson:") ? step.followUpId.slice(7) : step.followUpId;
  const l = getLesson(db, s);
  return {
    stage,
    slug: s,
    title: l?.title ?? s,
    cards: l ? Object.keys(l.nodes).length : 0,
    minutes: l?.minutes ?? 1,
    source: l && "generated" in l ? (l.generated!.status === "approved" ? "AI draft, approved" : "AI draft, needs review") : "Prepared",
    gap: step.gap,
    variant: null as string | null,
  };
}

export function spacedOverview(db: Db) {
  // When each lesson was last edited in the editor (content-file lessons never edited have none).
  const edited = new Map(
    (db.prepare("SELECT slug, updated_at FROM authored_lessons WHERE deleted_at IS NULL").all() as { slug: string; updated_at: string }[]).map((r) => [
      r.slug,
      r.updated_at,
    ]),
  );
  // New lessons saved in the editor but not yet published come first.
  const unpublished = unpublishedLessons(db).map((l) => ({
    slug: l.slug,
    title: l.title,
    track: l.track,
    minutes: l.minutes,
    cards: Object.keys(l.nodes).length,
    visual: l.visual,
    updatedAt: edited.get(l.slug) ?? null,
    status: "unpublished" as const,
    spaced: false,
    signoff: false,
    state: "off" as const,
    needsReview: false,
    pathId: null,
    pathName: null,
    variations: [] as ReturnType<typeof describe>[],
  }));
  const live = lessons
    .filter((l) => l.track !== "reinforcement")
    .map((l) => {
      const setting = lessonSetting(db, l.slug);
      const { live, draft } = pathFor(db, setting?.path_id);
      const plan = draft ?? live;
      const variations = plan
        ? plan.steps.flatMap((st) => {
            const base = describe(db, l.slug, st, st.stage ?? "Follow up");
            // Role versions and the adaptive support version sit beside the step they replace.
            const roles = Object.entries(st.variants).map(([role, id]) => ({ ...describe(db, l.slug, { ...st, followUpId: id }, base.stage), variant: role }));
            const support = st.adaptive
              ? [{ ...describe(db, l.slug, { ...st, followUpId: st.adaptive.ifStruggled }, "Refresh support"), variant: "support" }]
              : [];
            return [base, ...roles, ...support];
          })
        : [];
      const needsReview = generatedFor(db, l.slug).some((g) => g.status === "draft");
      const state = !setting?.spaced ? "off" : live && !draft ? "live" : plan ? "review" : "empty";
      return {
        slug: l.slug,
        title: l.title,
        track: l.track,
        minutes: l.minutes,
        cards: Object.keys(l.nodes).length,
        visual: l.visual,
        updatedAt: edited.get(l.slug) ?? null,
        status: lessonStatus(db, l.slug).state,
        spaced: Boolean(setting?.spaced),
        signoff: Boolean(setting?.signoff),
        state,
        needsReview,
        pathId: setting?.path_id ?? null,
        pathName: plan?.config.name ?? null,
        variations,
      };
    });
  return [...unpublished, ...live];
}

export type SpacedActionName = "enable" | "disable" | "regenerate" | "approve" | "signoff_on" | "signoff_off";

export async function spacedAction(db: Db, user: User, slug: string, action: SpacedActionName, now: Date, instructions?: string) {
  requireAuthor(user);
  const master = lessons.find((l) => l.slug === slug && l.track !== "reinforcement");
  if (!master) throw new HttpError(404, "Lesson not found.");
  const setting = lessonSetting(db, slug);
  const at = now.toISOString();
  const setSpaced = (on: boolean) =>
    db
      .prepare(
        "INSERT INTO lesson_settings (slug, spaced, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(slug) DO UPDATE SET spaced = excluded.spaced, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
      )
      .run(slug, on ? 1 : 0, at, user.id);

  switch (action) {
    case "signoff_on":
    case "signoff_off": {
      // A manager confirms practice once the last follow up is done. Needs a spaced lesson to hang off.
      if (action === "signoff_on" && !setting?.spaced) throw new HttpError(409, "Turn on spaced learning first.");
      db.prepare("UPDATE lesson_settings SET signoff = ?, updated_at = ?, updated_by = ? WHERE slug = ?").run(
        action === "signoff_on" ? 1 : 0,
        at,
        user.id,
        slug,
      );
      audit(db, { actor: user.id, event: `spaced.${action}`, entity: `lesson:${slug}`, at: now });
      return;
    }
    case "disable":
      setSpaced(false);
      audit(db, {
        actor: user.id,
        event: "spaced.disabled",
        entity: `lesson:${slug}`,
        reason: "New completions no longer start follow ups; existing ones continue.",
        at: now,
      });
      return;
    case "enable": {
      // First time on: Claude writes the variations from the master lesson. The box only turns on
      // once that succeeds, so a failed generation never leaves a lesson "on" with nothing behind it.
      const generated = setting?.path_id ? undefined : await generateVariations(db, user, slug, now, instructions);
      setSpaced(true);
      audit(db, { actor: user.id, event: "spaced.enabled", entity: `lesson:${slug}`, at: now });
      return generated;
    }
    case "regenerate": {
      const generated = await generateVariations(db, user, slug, now, instructions);
      setSpaced(true);
      return generated;
    }
    case "approve": {
      const pathId = setting?.path_id;
      if (!pathId) throw new HttpError(409, "There are no variations to approve yet.");
      db.prepare("UPDATE generated_lessons SET status = 'approved', approved_at = ?, approved_by = ? WHERE master_slug = ? AND status = 'draft'").run(
        at,
        user.id,
        slug,
      );
      const { draft } = pathFor(db, pathId);
      if (draft) {
        if (draft.status === "draft") submitForReview(db, user, pathId, now);
        publish(db, user, pathId, now);
      }
      setSpaced(true);
      audit(db, { actor: user.id, event: "spaced.approved", entity: `lesson:${slug}`, at: now });
      return;
    }
  }
}
