"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useApi } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import type { myEnrolment } from "@/server/onboardingCourses";
import { Icon } from "../Icon";
import { Chip, dbtn, Problem } from "../discovery/parts";
import { DemoNote, Progress, StepList } from "./CourseParts";
import { GetToKnowYou } from "./GetToKnowYou";
import type { About } from "@/lib/onboardingCourses";

/** No answers yet: Get to know you opens empty if a reply comes without them (a server still running older code). */
const NO_ANSWERS: About = { years: null, before: "", languages: "", interests: [], learn: [], note: "", updatedAt: null };

/*
  One starting course (docs/onboarding.md, "Starting courses"): what you'll gain, how long it takes, where you're
  up to, the steps (each opens the Topic, Magazine course or Job Aid itself, where its progress is saved), and Get to
  know you (their background, in their own words). Only ever the signed-in person's own: anyone else's is "not found".
*/

type Data = ReturnType<typeof myEnrolment>;

export function CourseView({ id }: { id: string }) {
  const { data, error, reload } = useApi<Data>(`/api/onboarding/courses?enrolment=${encodeURIComponent(id)}`);
  // Back from a step (or a phone call): show where they're up to now.
  useEffect(() => {
    const again = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", again);
    window.addEventListener("focus", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("focus", again);
    };
  }, [reload]);
  if (error)
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Problem text={error} onRetry={reload} />
      </div>
    );
  if (!data) return <p className="mx-auto max-w-3xl px-4 py-10 text-ink-muted">Loading your course…</p>;
  const c = data.course;
  const large = data.prefs.textSize === "large";
  const translated = data.prefs.language !== "en";

  return (
    <div className={cx("mx-auto max-w-3xl px-4 pt-6 pb-16 sm:px-6", large && "text-lg")}>
      <Link href="/" className={dbtn.quiet}>
        <Icon name="arrow-left" className="size-4" /> Home
      </Link>
      <p className="mt-3 font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Your starting course · {c.organisation}</p>
      <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">{c.title}</h1>

      {c.status === "completed" && (
        <p className="mt-3 flex items-center gap-2 rounded-2xl bg-[#e3f4ea] px-4 py-3 text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]">
          <Icon name="circle-check" className="size-5" /> Completed{c.completedAt ? ` on ${formatDate(c.completedAt)}` : ""}. You can open any step again.
        </p>
      )}
      {c.endedReason && <p className="mt-3 rounded-2xl bg-muted px-4 py-3">{c.endedReason}</p>}
      {c.exemptReason && <p className="mt-3 rounded-2xl bg-muted px-4 py-3">You don’t need to do this course: {c.exemptReason}</p>}
      {c.updated && (
        <p className="mt-3 rounded-2xl bg-muted px-4 py-3 text-sm">
          A newer version of this course is out. {c.updated.note || "You can carry on with yours: what you’ve done still counts."}
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Progress done={c.progress.done} total={c.progress.total} />
        <p className="flex flex-wrap gap-2">
          {c.status === "active" && c.minutes > 0 && <Chip>About {c.minutes} min left</Chip>}
          {c.due ? <Chip tone={c.due.overdue ? "warn" : "neutral"}>{c.due.text}</Chip> : c.status === "active" ? <Chip>No due date</Chip> : null}
        </p>
      </div>
      <p className="mt-2 text-sm text-ink-muted">
        To finish, do every step not marked optional. Each one saves as you go, so you can stop and come back on any device.
      </p>

      {c.gains.length > 0 && (
        <section aria-labelledby="gains" className="mt-5">
          <h2 id="gains" className="font-semibold">
            What you’ll gain
          </h2>
          <ul className="mt-1 list-disc pl-5">
            {c.gains.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Get to know you comes before the steps (the owner, Nov 2026): who they are, then what to do. */}
      <GetToKnowYou about={data.about ?? NO_ANSWERS} />

      <section aria-labelledby="steps" className="mt-6">
        <h2 id="steps" className="font-serif text-2xl font-semibold">
          Steps
        </h2>
        {translated && !c.reviewedLanguages.includes(data.prefs.language) && (
          <p className="mt-2 rounded-2xl bg-muted/70 px-4 py-3 text-sm">
            You’re reading in {data.prefs.languageName}. This course hasn’t had a reviewed translation into it yet, so what you see is Google’s machine
            translation: it isn’t approved guidance. If anything is unclear, ask us.
          </p>
        )}
        <div className="mt-3">
          <StepList steps={c.steps} currentId={c.status === "active" ? c.next?.id : null} />
        </div>
      </section>

      {c.demo && <DemoNote className="mt-5" />}

      <section aria-labelledby="where" className="mt-6 rounded-3xl bg-surface p-5 ring-1 ring-line">
        <h2 id="where" className="font-semibold">
          Where things stand
        </h2>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
          <dt className="font-semibold">Hub account</dt>
          <dd>You can sign in.</dd>
          <dt className="font-semibold">Learning</dt>
          <dd>
            {c.status === "completed"
              ? "This course is complete."
              : c.status === "active"
                ? `In progress: ${c.progress.done} of ${c.progress.total} done.`
                : "Not assigned now."}
          </dd>
          <dt className="font-semibold">Approval to work</dt>
          <dd>Managed separately by Trilogy Care. Finishing this course doesn’t approve you to start a service.</dd>
        </dl>
      </section>
    </div>
  );
}
