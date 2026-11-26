"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { LANGUAGES } from "@/lib/languages";
import { ROLE_CHOICES, TEXT_SIZES, type ReadMode, type Segment, type TextSize } from "@/lib/onboardingCourses";
import type { MyCourses } from "@/server/onboardingCourses";
import type { Setup } from "@/server/onboarding";
import { Icon } from "../Icon";
import { Chip, dbtn, dinput, Problem } from "../discovery/parts";
import { setTranslation } from "../SiteTranslator";
import { DemoNote, HelpForm, WhenTag } from "./CourseParts";

/*
  The first sign-in (docs/onboarding.md, "Starting courses"): three short steps, each saved on the server so a phone
  call or a dropped connection doesn't lose the place. First how to use the Hub (language, read or listen, text
  size; audio isn't a choice here, it starts by itself as everywhere on the Hub), before any long instructions; then which of the four roles best describes them (their pick counts straight away); then one action:
  Continue to the first course. Nothing here grants a permission.
*/

const STEPS = ["language", "you", "ready"] as const;
type Step = (typeof STEPS)[number];

export function FirstRun({ start }: { start?: string }) {
  const { data, error, reload, setData } = useApi<MyCourses>("/api/onboarding/courses");
  const [step, setStep] = useState<Step | null>(() => STEPS.find((s) => s === start) ?? null);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  // Start where they left off, on this or another device.
  const current: Step = step ?? STEPS.find((s) => s === data?.firstRun.step) ?? "language";
  useEffect(() => {
    // Focus the new step's heading when they move, so a screen reader starts at the top of it.
    if (moved.current) heading.current?.focus();
  }, [current]);
  if (error) return <Problem text={error} onRetry={reload} />;
  if (!data) return <p className="mx-auto max-w-2xl px-4 py-10 text-ink-muted">Loading…</p>;

  const go = async (next: Step) => {
    moved.current = true;
    setStep(next);
    try {
      await api("/api/onboarding/courses", { body: { action: "prefs", step: next } });
    } catch {
      // Saving the place is a convenience: the step still changes.
    }
  };
  const n = STEPS.indexOf(current) + 1;
  const large = data.prefs.textSize === "large";

  return (
    <div className={cx("mx-auto max-w-2xl px-4 pt-6 pb-16 sm:px-6", large && "text-lg")}>
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">
        Getting started · step {n} of {STEPS.length}
      </p>
      <ol aria-hidden className="mt-2 flex gap-1.5">
        {STEPS.map((s, i) => (
          <li key={s} className={cx("h-1.5 flex-1 rounded-full", i < n ? "bg-[#008282] dark:bg-[#3cb8b9]" : "bg-muted")} />
        ))}
      </ol>
      {current === "language" && (
        <LanguageStep data={data} headingRef={heading} onDone={() => go("you")} onSaved={(p) => setData({ ...data, prefs: { ...data.prefs, ...p } })} />
      )}
      {current === "you" && <YouStep data={data} headingRef={heading} onBack={() => go("language")} onDone={() => go("ready")} onChanged={setData} />}
      {current === "ready" && <ReadyStep data={data} headingRef={heading} onBack={() => go("you")} />}
    </div>
  );
}

type StepProps = { data: MyCourses; headingRef: React.RefObject<HTMLHeadingElement | null> };

function LanguageStep({ data, headingRef, onDone, onSaved }: StepProps & { onDone: () => void; onSaved: (p: { mode: ReadMode; textSize: TextSize }) => void }) {
  const [language, setLanguage] = useState(data.prefs.language);
  const [size, setSize] = useState<TextSize>(data.prefs.textSize);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const reviewed = data.primary?.reviewedLanguages ?? ["en"];
  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await api("/api/onboarding/courses", { body: { action: "prefs", textSize: size, step: "you" } });
      onSaved({ mode: data.prefs.mode, textSize: size });
      if (language !== data.prefs.language) {
        await api("/api/me/preferences", { body: { language } });
        // Google Translate applies on a fresh load; the next step has been saved, so they land on it.
        setTranslation(language);
        location.reload();
        return;
      }
      onDone();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That didn’t save.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="fr-language" className="mt-5">
      <h1 id="fr-language" ref={headingRef} tabIndex={-1} className="font-serif text-3xl font-semibold tracking-tight outline-none sm:text-4xl">
        How would you like to use the Hub?
      </h1>
      <p className="mt-2 text-ink-muted">You can change these any time.</p>

      <label className="mt-5 flex flex-col gap-1">
        <span className="font-semibold">Language</span>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className={dinput}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.code === "en" ? l.label : `${l.native} (${l.label})`}
            </option>
          ))}
        </select>
      </label>
      {language !== "en" && (
        <div className="mt-3 rounded-2xl bg-muted/70 p-4 text-sm">
          <p>
            Pages in this language are <strong>machine-translated by Google Translate</strong>. A person hasn’t checked them, so they aren’t approved guidance.
            If anything is unclear, ask us.
          </p>
          <p className="mt-2">
            {reviewed.includes(language)
              ? "Your first course has a reviewed translation in this language."
              : "Your first course doesn’t have a reviewed translation in this language yet."}
          </p>
          <details className="mt-2">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-accent">Ask for help in my language</summary>
            <div className="mt-2">
              <HelpForm initial="language" />
            </div>
          </details>
        </div>
      )}

      <fieldset className="mt-6">
        <legend className="font-semibold">Text size on these pages</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(Object.keys(TEXT_SIZES) as TextSize[]).map((s) => (
            <label
              key={s}
              className={cx(
                "flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-3",
                size === s ? "border-[#008282] bg-[#3cb8b9]/12" : "border-line-strong",
              )}
            >
              <input type="radio" name="size" value={s} checked={size === s} onChange={() => setSize(s)} className="size-5 accent-[#008282]" />
              <span className={cx("font-medium", s === "large" && "text-lg")}>{TEXT_SIZES[s]}</span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-sm text-ink-muted">Your phone or browser’s own zoom works everywhere on the Hub.</p>
      </fieldset>

      {problem && (
        <div className="mt-4">
          <Problem text={problem} />
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={busy} className={dbtn.primary}>
          {busy ? "Saving…" : "Continue"} <Icon name="arrow-right" className="size-4" />
        </button>
      </div>
    </section>
  );
}

function YouStep({ data, headingRef, onBack, onDone, onChanged }: StepProps & { onBack: () => void; onDone: () => void; onChanged: (d: MyCourses) => void }) {
  const account = data.person.roles[0];
  const [role, setRole] = useState<Segment | null>(account?.segment ?? null);
  const [wrong, setWrong] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const others = data.person.roles.slice(1);
  const next = async () => {
    if (!role) return setProblem("Choose the role that best describes you.");
    if (role === account?.segment) return onDone();
    setBusy(true);
    setProblem(null);
    try {
      onChanged(await api<MyCourses>("/api/onboarding/courses", { body: { action: "role", segment: role } }));
      onDone();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That didn’t save.");
    } finally {
      setBusy(false);
    }
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      onChanged(await api<MyCourses>("/api/onboarding/courses", { body: { action: "mismatch", message } }));
      setSent(true);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That didn’t send.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-labelledby="fr-you" className="mt-5">
      <h1 id="fr-you" ref={headingRef} tabIndex={-1} className="font-serif text-3xl font-semibold tracking-tight outline-none sm:text-4xl">
        Welcome, {data.person.firstName}
      </h1>
      {/* Self-identified (the owner, Nov 2026): what they see and their starting course follow the pick straight away. */}
      <fieldset className="mt-4">
        <legend className="font-semibold">Which best describes you?</legend>
        <p className="text-sm text-ink-muted">This sets what you see first and your starting course. You can change it here later.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {ROLE_CHOICES.map((c) => (
            <label
              key={c.segment}
              className={cx(
                "flex cursor-pointer items-start gap-3 rounded-2xl border p-4",
                role === c.segment ? "border-[#008282] bg-[#3cb8b9]/12" : "border-line-strong",
              )}
            >
              <input
                type="radio"
                name="role"
                value={c.segment}
                checked={role === c.segment}
                onChange={() => setRole(c.segment)}
                className="mt-1 size-5 shrink-0 accent-[#008282]"
              />
              <span>
                <span className="block font-serif text-lg font-semibold">{c.label}</span>
                <span className="block text-sm text-ink-muted">{c.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {account?.organisation && <p className="mt-3 text-sm text-ink-muted">Your organisation: {account.organisation}</p>}
      {others.length > 0 && <p className="mt-1 text-sm text-ink-muted">Also on your account: {others.map((r) => r.label).join(", ")}</p>}
      {data.confirm && (
        <p className="mt-3 rounded-2xl bg-[#fab53d]/15 p-4 ring-1 ring-[#fab53d]/50">
          <strong>We need to confirm your work type.</strong>{" "}
          {data.confirm.reason === "disputed"
            ? "You’ve told us something isn’t right, and someone is checking it."
            : "Your account doesn’t say what work you do yet. An administrator will confirm it with you."}{" "}
          Until then we won’t guess, so no starting course is shown.
        </p>
      )}
      {sent ? (
        <p role="status" className="mt-4 rounded-2xl bg-muted p-4">
          Thanks. An administrator will check it and fix your details. You can keep using the Hub meanwhile.
        </p>
      ) : wrong ? (
        <form onSubmit={send} className="mt-4 flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="font-semibold">What’s wrong?</span>
            <span className="text-sm text-ink-muted">For example: “I’m a gardener, not a cleaner”, or “I work for a different business”.</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className={cx(dinput, "py-2")} maxLength={600} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={dbtn.primary}>
              {busy ? "Sending…" : "Send to an administrator"}
            </button>
            <button type="button" onClick={() => setWrong(false)} className={dbtn.secondary}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {problem && (
        <div className="mt-4">
          <Problem text={problem} />
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={onBack} className={dbtn.secondary}>
          <Icon name="arrow-left" className="size-4" /> Back
        </button>
        <button type="button" onClick={next} disabled={busy} className={dbtn.primary}>
          {busy && !wrong ? "Saving…" : "Continue"} <Icon name="arrow-right" className="size-4" />
        </button>
        {!wrong && !sent && (
          <button type="button" onClick={() => setWrong(true)} className={dbtn.quiet}>
            My work or organisation is wrong
          </button>
        )}
      </div>
    </section>
  );
}

/**
  Your setup, inside Getting started (the owner, Nov 2026): once setup requirements have been released for the Hub, the
  things still to send or waiting on someone, with a way into the list. Nothing shows while there's no setup to do.
*/
function SetupCard() {
  const { data } = useApi<Setup>("/api/onboarding");
  if (!data?.configured) return null;
  const todo = data.tasks.filter((t) => t.mine && !t.ok && t.status !== "submitted");
  const waiting = data.tasks.filter((t) => t.status === "submitted");
  const done = data.state === "ready" || data.state === "active";
  return (
    <Link href="/onboarding" className="mt-5 flex items-center gap-4 rounded-2xl bg-surface p-4 ring-1 ring-line transition hover:ring-[#008282]">
      <Icon name="checklist" className="size-6 shrink-0 text-accent" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Your setup</span>
        <span className="block text-sm text-ink-muted">
          {done
            ? "Everything required has been approved."
            : todo.length
              ? `${todo.length} ${todo.length === 1 ? "thing" : "things"} to send before you can start work${waiting.length ? `, and ${waiting.length} being checked` : ""}.`
              : waiting.length
                ? `${waiting.length} ${waiting.length === 1 ? "thing is" : "things are"} being checked. Nothing for you to do right now.`
                : "Nothing for you to do right now."}
        </span>
      </span>
      <Icon name="arrow-right" className="size-5 shrink-0 text-accent" />
    </Link>
  );
}

/*
  The last step (the owner, Nov 2026): the courses and training allocated to them, each with its steps, and no pressure to
  start now: they're on the homepage dashboard ("Your courses and training") whenever they're ready. Going to the
  homepage is the main way on; starting the first course straight away is there for anyone who wants to.
*/
function ReadyStep({ data, headingRef, onBack }: StepProps & { onBack: () => void }) {
  const router = useRouter();
  const courses = data.courses;
  const c = data.primary;
  const finish = async (href: string) => {
    try {
      await api("/api/onboarding/courses", { body: { action: "prefs", done: true, step: "ready" } });
    } catch {
      // The page still opens; the welcome will simply be offered again.
    }
    router.push(href);
  };
  return (
    <section aria-labelledby="fr-ready" className="mt-5">
      <h1 id="fr-ready" ref={headingRef} tabIndex={-1} className="font-serif text-3xl font-semibold tracking-tight outline-none sm:text-4xl">
        {courses.length ? "Your courses and training" : "You’re all set"}
      </h1>
      {courses.length ? (
        <>
          <p className="mt-2 text-lg">
            These are your allocated courses and training. No need to start now: they’ll be on your homepage dashboard whenever you’re ready.
          </p>
          {courses.some((x) => x.steps.some((s) => s.later)) && (
            <p className="mt-2 text-ink-muted">Start with the ones marked Today. The ones marked Later can wait until you’re settled in.</p>
          )}
          <ul className="mt-5 flex flex-col gap-3">
            {courses.map((course) => (
              <li key={course.id} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
                <p className="font-serif text-xl font-semibold">{course.title}</p>
                <p className="mt-1 flex flex-wrap gap-2">
                  <Chip>About {course.minutes} minutes in all</Chip>
                  {course.due ? <Chip tone={course.due.overdue ? "warn" : "neutral"}>{course.due.text}</Chip> : <Chip>No due date</Chip>}
                </p>
                <ol className="mt-3 flex flex-col gap-2.5 text-[0.95rem]">
                  {course.steps.map((s, i) => (
                    <li key={s.id} className="flex items-center gap-3">
                      {s.poster ? (
                        // eslint-disable-next-line @next/next/no-img-element -- the item's own picture, as its tile shows it
                        <img src={s.poster} alt="" className="aspect-video w-28 shrink-0 rounded-xl bg-muted object-cover sm:w-36" />
                      ) : (
                        <span
                          aria-hidden
                          className="grid aspect-video w-28 shrink-0 place-items-center rounded-xl bg-muted font-semibold text-ink-muted sm:w-36"
                        >
                          {i + 1}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium leading-snug">{s.title}</span>
                          <WhenTag later={s.later} />
                        </span>
                        <span className="block text-sm text-ink-muted">
                          {s.kindLabel}
                          {s.minutes ? ` · about ${s.minutes} min` : ""}
                          {!s.required ? " · optional" : ""}
                          {s.state === "done" ? " · done" : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {/* Start now takes them to their homepage dashboard, where these are waiting (the owner, Nov 2026). */}
            <button type="button" onClick={() => finish("/")} className={cx(dbtn.primary, "min-h-12 text-lg")}>
              Start now <Icon name="arrow-right" className="size-5" />
            </button>
          </div>
          {c?.demo && <DemoNote className="mt-4" />}
        </>
      ) : (
        <p className="mt-2">Nothing is assigned to you right now. You can look around the Hub, and anything assigned later will show on your homepage.</p>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={onBack} className={dbtn.secondary}>
          <Icon name="arrow-left" className="size-4" /> Back
        </button>
        {!courses.length && (
          <button type="button" onClick={() => finish("/")} className={dbtn.primary}>
            Go to the homepage
          </button>
        )}
      </div>
      <SetupCard />
    </section>
  );
}
