"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { useHydrated } from "@/lib/store";
import { cx } from "@/lib/format";
import type { MyCourses } from "@/server/onboardingCourses";
import { Icon } from "../Icon";
import { dbtn } from "../discovery/parts";
import { DemoNote, Progress, WhyBox } from "./CourseParts";

/*
  The homepage's getting-started card (docs/onboarding.md, "Starting courses"): one main action, a short list of
  next steps, a work tool and help. Nothing at all when there's no starting course, so the homepage stays short.
  The first time, it points to the two-minute welcome; after that it's "Continue".
*/

export function HomeCourse() {
  const hydrated = useHydrated();
  const { data } = useApi<MyCourses>(hydrated ? "/api/onboarding/courses" : null);
  if (!data) return null;
  const c = data.primary;
  if (!c && !data.confirm) return null;
  const welcome = !data.firstRun.done;

  return (
    <section aria-labelledby="getting-started" className="mb-6 rounded-3xl border border-[#3cb8b9]/45 bg-[#3cb8b9]/12 p-5 sm:p-6">
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#006060] dark:text-[#9fe3e3]">
        {/* The page's masthead already greets them (HomeHero), so this card leads with the course, never another welcome. */}
        {data.returning ? "Pick up where you left off" : "Getting started"} · assigned to you
      </p>

      {data.confirm && !c ? (
        <>
          <h2 id="getting-started" className="mt-1 font-serif text-2xl font-semibold">
            We need to confirm your work type
          </h2>
          <p className="mt-2 max-w-2xl">
            {data.confirm.reason === "disputed"
              ? "You’ve told us your role isn’t right. Someone is checking it. Nothing new is assigned until it’s sorted."
              : "Your account doesn’t say what work you do yet, so we can’t show you the right starting course. An administrator will confirm it."}{" "}
            You can still use Work Tools and look around the Hub.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/onboarding/start" className={dbtn.primary}>
              Tell us about your work
            </Link>
            <Link href="/tools" className={dbtn.secondary}>
              Find a Job Aid
            </Link>
          </div>
        </>
      ) : c ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <h2 id="getting-started" className="mt-1 font-serif text-2xl font-semibold leading-tight sm:text-3xl">
              {welcome ? `Your first course: ${c.title}` : c.title}
            </h2>
            {welcome ? (
              <p className="mt-2 max-w-2xl">You’re here as {data.person.roles[0]?.label ?? "a member"}. Start with two quick questions: about two minutes.</p>
            ) : (
              <div className="mt-3 max-w-md">
                <Progress done={c.progress.done} total={c.progress.total} />
                {c.due && <p className={cx("mt-2 text-sm", c.due.overdue && "font-semibold text-[#9b2c2c] dark:text-[#ff9ea2]")}>{c.due.text}</p>}
              </div>
            )}
            {c.updated && !welcome && <p className="mt-2 text-sm">This course has been updated. {c.updated.note || "You can carry on with your version."}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {welcome ? (
                <Link href="/onboarding/start" className={dbtn.primary}>
                  Start here <Icon name="arrow-right" className="size-4" />
                </Link>
              ) : (
                <Link href={c.next?.href ?? `/onboarding/course/${c.id}`} className={dbtn.primary}>
                  Continue{c.next ? `: ${c.next.title}` : ""} <Icon name="arrow-right" className="size-4" />
                </Link>
              )}
              <Link href={`/onboarding/course/${c.id}`} className={dbtn.quiet}>
                {welcome ? "Go straight to the course" : "See the whole course"}
              </Link>
            </div>
            <div className="mt-3 max-w-xl">
              <WhyBox why={c.why} />
            </div>
          </div>
          <div className="min-w-0">
            {!welcome && data.nextSteps.length > 0 && (
              <>
                <h3 className="font-semibold">Your next steps</h3>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {data.nextSteps.map((s) => (
                    <li key={`${s.enrolmentId}-${s.id}`}>
                      <Link
                        href={s.href ?? `/onboarding/course/${s.enrolmentId}`}
                        className="flex min-h-11 items-center gap-2 rounded-xl px-2 hover:bg-surface"
                      >
                        <Icon name="arrow-right" className="size-4 shrink-0 text-accent" />
                        <span className="min-w-0">
                          <span className="block font-medium leading-snug">{s.title}</span>
                          <span className="block text-xs text-ink-muted">{s.course}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <h3 className={cx("font-semibold", !welcome && data.nextSteps.length > 0 && "mt-4")}>At work</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href={data.help.jobAids} className={dbtn.secondary}>
                <Icon name="search" className="size-4" /> Find a Job Aid
              </Link>
              <Link href={`/onboarding/course/${c.id}#help`} className={dbtn.secondary}>
                Get help
              </Link>
            </div>
            <p className="mt-3 text-sm text-ink-muted">
              Urgent or unsafe? Call 000 if someone is in danger, then follow the{" "}
              <Link href={data.help.urgent.href} className="font-semibold text-accent underline underline-offset-4">
                incident first steps
              </Link>
              .
            </p>
            {c.demo && <DemoNote className="mt-3" />}
          </div>
        </div>
      ) : null}
    </section>
  );
}
