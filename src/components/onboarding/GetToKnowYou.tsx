"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { ABOUT_INTERESTS, ABOUT_LEARN, ABOUT_YEARS, type About, type AboutInterest, type AboutLearn, type AboutYears } from "@/lib/onboardingCourses";
import { Icon } from "../Icon";
import { dbtn, dinput, Problem } from "../discovery/parts";

/*
  Get to know you (the owner, Nov 2026), on a starting course's page in place of Get help: a few optional questions about
  someone's background, so Trilogy Care understands who they are. Saved to their record; they can change them any time,
  and administrators see them on their page in Starting courses.
*/
export function GetToKnowYou({ about }: { about: About }) {
  const [years, setYears] = useState<AboutYears | null>(about.years);
  const [before, setBefore] = useState(about.before);
  const [languages, setLanguages] = useState(about.languages);
  const [interests, setInterests] = useState<AboutInterest[]>(about.interests);
  const [learn, setLearn] = useState<AboutLearn[]>(about.learn);
  const [note, setNote] = useState(about.note);
  const [saved, setSaved] = useState<string | null>(about.updatedAt);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const toggle = <T extends string>(list: T[], v: T, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const out = await api<About>("/api/onboarding/courses", { body: { action: "about", years, before, languages, interests, learn, note } });
      setSaved(out.updatedAt);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That didn’t save.");
    } finally {
      setBusy(false);
    }
  };

  const chip = (on: boolean) =>
    cx(
      "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border px-3",
      on ? "border-[#008282] bg-[#e3f5f5] dark:bg-[#0f3a3b]" : "border-line-strong bg-surface",
    );
  return (
    <section
      aria-labelledby="about-heading"
      id="about"
      className="mt-6 scroll-mt-24 rounded-3xl bg-gradient-to-br from-[#3cb8b9]/15 via-[#3cb8b9]/8 to-[#fab53d]/15 p-5 ring-1 ring-[#3cb8b9]/30 sm:p-6"
    >
      <h2 id="about-heading" className="font-serif text-2xl font-semibold">
        Get to know you
      </h2>
      <p className="mt-1 text-ink-muted">A few questions so we understand your background. Answer as many as you like; you can change them any time.</p>
      <form onSubmit={save} className="mt-4 flex flex-col gap-5">
        <fieldset>
          <legend className="font-semibold">How long have you worked in aged care or home support?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(Object.keys(ABOUT_YEARS) as AboutYears[]).map((y) => (
              <label key={y} className={chip(years === y)}>
                <input type="radio" name="years" checked={years === y} onChange={() => setYears(y)} className="size-5 accent-[#008282]" />
                {ABOUT_YEARS[y]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="font-semibold">What did you do before, or alongside, this work?</span>
          <span className="text-sm text-ink-muted">For example: nursing, hospitality, running a cleaning business, or caring for a family member.</span>
          <input value={before} onChange={(e) => setBefore(e.target.value)} maxLength={300} className={dinput} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-semibold">Do you speak any languages other than English?</span>
          <input
            value={languages}
            onChange={(e) => setLanguages(e.target.value)}
            maxLength={120}
            placeholder="For example: Greek, Vietnamese"
            className={dinput}
          />
        </label>

        <fieldset>
          <legend className="font-semibold">What would you like to get better at?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(Object.keys(ABOUT_INTERESTS) as AboutInterest[]).map((k) => (
              <label key={k} className={chip(interests.includes(k))}>
                <input
                  type="checkbox"
                  checked={interests.includes(k)}
                  onChange={(e) => setInterests((l) => toggle(l, k, e.target.checked))}
                  className="size-5 accent-[#008282]"
                />
                {ABOUT_INTERESTS[k]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-semibold">How do you like to learn?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(Object.keys(ABOUT_LEARN) as AboutLearn[]).map((k) => (
              <label key={k} className={chip(learn.includes(k))}>
                <input
                  type="checkbox"
                  checked={learn.includes(k)}
                  onChange={(e) => setLearn((l) => toggle(l, k, e.target.checked))}
                  className="size-5 accent-[#008282]"
                />
                {ABOUT_LEARN[k]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="font-semibold">Anything else you’d like us to know?</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={600} className={cx(dinput, "py-2")} />
        </label>

        {problem && <Problem text={problem} />}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={dbtn.primary}>
            {busy ? "Saving…" : "Save"}
          </button>
          <p role="status" className="text-sm text-ink-muted">
            {saved && !busy && (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="check" className="size-4" /> Saved {formatDate(saved)}
              </span>
            )}
          </p>
        </div>
      </form>
    </section>
  );
}
