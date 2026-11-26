"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { LANGUAGES } from "@/lib/languages";
import { READ_MODES, TEXT_SIZES, type ReadMode, type TextSize } from "@/lib/onboardingCourses";
import type { MyCourses } from "@/server/onboardingCourses";
import { Icon } from "../Icon";
import { Chip, dbtn, dinput, Problem } from "../discovery/parts";
import { setTranslation } from "../SiteTranslator";
import { DemoNote, HelpForm, UrgentNote, WhyBox } from "./CourseParts";

/*
  The first sign-in (docs/onboarding.md, "Starting courses"): three short steps, each saved on the server so a phone
  call or a dropped connection doesn't lose the place. First how to use the Hub (language, read or listen, text
  size), before any long instructions; then who the Hub has them as, with a way to say it's wrong; then one action:
  Continue to the first course. Nothing here can change a role.
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
  const [mode, setMode] = useState<ReadMode>(data.prefs.mode);
  const [size, setSize] = useState<TextSize>(data.prefs.textSize);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const reviewed = data.primary?.reviewedLanguages ?? ["en"];
  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await api("/api/onboarding/courses", { body: { action: "prefs", mode, textSize: size, step: "you" } });
      onSaved({ mode, textSize: size });
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
        <legend className="font-semibold">Read or listen</legend>
        <p className="text-sm text-ink-muted">Audio never starts by itself, and the words are always on the screen too.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {(Object.keys(READ_MODES) as ReadMode[]).map((m) => (
            <label
              key={m}
              className={cx(
                "flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-3",
                mode === m ? "border-[#008282] bg-[#3cb8b9]/12" : "border-line-strong",
              )}
            >
              <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="size-5 accent-[#008282]" />
              <span className="font-medium">{READ_MODES[m]}</span>
            </label>
          ))}
        </div>
      </fieldset>

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
  const [wrong, setWrong] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
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
      <p className="mt-3 font-semibold">The Hub has you as:</p>
      <ul className="mt-2 flex flex-col gap-2">
        {data.person.roles.map((r) => (
          <li key={r.label} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <p className="font-serif text-xl font-semibold">{r.segmentLabel}</p>
            <p className="text-ink-muted">
              {r.work ? `Providing ${r.work} · ` : ""}
              {r.organisation}
            </p>
          </li>
        ))}
      </ul>
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
          Thanks. An administrator will check it and fix your details. Nothing changes until they do, and you can keep using the Hub.
        </p>
      ) : wrong ? (
        <form onSubmit={send} className="mt-4 flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="font-semibold">What’s wrong?</span>
            <span className="text-sm text-ink-muted">For example: “I’m a gardener, not a cleaner”, or “I work for a different business”.</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className={cx(dinput, "py-2")} maxLength={600} />
          </label>
          {problem && <Problem text={problem} />}
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
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={onBack} className={dbtn.secondary}>
          <Icon name="arrow-left" className="size-4" /> Back
        </button>
        <button type="button" onClick={onDone} className={dbtn.primary}>
          {sent || data.confirm ? "Continue" : "Yes, that’s me"} <Icon name="arrow-right" className="size-4" />
        </button>
        {!wrong && !sent && (
          <button type="button" onClick={() => setWrong(true)} className={dbtn.quiet}>
            This isn’t my role
          </button>
        )}
      </div>
    </section>
  );
}

function ReadyStep({ data, headingRef, onBack }: StepProps & { onBack: () => void }) {
  const router = useRouter();
  const c = data.primary;
  const finish = async (href: string) => {
    try {
      await api("/api/onboarding/courses", { body: { action: "prefs", done: true, step: "ready" } });
    } catch {
      // The course still opens; the welcome will simply be offered again.
    }
    router.push(href);
  };
  const todo = c ? c.steps.filter((s) => s.state !== "done" && s.state !== "unavailable") : [];
  return (
    <section aria-labelledby="fr-ready" className="mt-5">
      <h1 id="fr-ready" ref={headingRef} tabIndex={-1} className="font-serif text-3xl font-semibold tracking-tight outline-none sm:text-4xl">
        {c ? c.title : "You’re all set"}
      </h1>
      {c ? (
        <>
          <p className="mt-2 text-lg">
            {todo.length === 1 ? "One step to do now." : `${Math.min(2, todo.length)} steps to do now.`} You can stop and come back.
          </p>
          {c.gains.length > 0 && (
            <>
              <h2 className="mt-4 font-semibold">What you’ll gain</h2>
              <ul className="mt-1 list-disc pl-5">
                {c.gains.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-3 flex flex-wrap gap-2">
            <Chip>About {c.minutes} minutes in all</Chip>
            {c.due ? <Chip tone={c.due.overdue ? "warn" : "neutral"}>{c.due.text}</Chip> : <Chip>No due date</Chip>}
          </p>
          <div className="mt-4">
            <WhyBox why={c.why} />
          </div>
          {data.prefs.mode !== "read" && (
            <p className="mt-3 text-sm text-ink-muted">You chose to listen. Steps with audio have a Listen button; press it when you’re ready.</p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" onClick={() => finish(`/onboarding/course/${c.id}`)} className={cx(dbtn.primary, "min-h-12 text-lg")}>
              Continue: {c.title} <Icon name="arrow-right" className="size-5" />
            </button>
          </div>
          {c.demo && <DemoNote className="mt-4" />}
        </>
      ) : (
        <p className="mt-2">Nothing is assigned to you right now. You can look around the Hub, and anything assigned later will show on your homepage.</p>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={onBack} className={dbtn.secondary}>
          <Icon name="arrow-left" className="size-4" /> Back
        </button>
        <Link href={data.help.jobAids} className={dbtn.secondary}>
          Find a Job Aid
        </Link>
        {!c && (
          <button type="button" onClick={() => finish("/")} className={dbtn.primary}>
            Go to the homepage
          </button>
        )}
      </div>
      <div className="mt-5">
        <UrgentNote text={data.help.urgent.text} href={data.help.urgent.href} />
      </div>
    </section>
  );
}
