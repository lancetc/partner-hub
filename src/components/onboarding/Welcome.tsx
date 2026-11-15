"use client";

import { useState } from "react";
import { roles, serviceTypes } from "@/content/onboarding";
import { api, useApi, type Me } from "@/lib/api";
import { setHub, useHub } from "@/lib/store";
import { Icon } from "../Icon";
import { cx } from "@/lib/format";
import { Logo } from "../Header";
import { ProfilePicture } from "../ProfilePicture";
import { LearnStep } from "./LearnStep";

/*
  First-run setup: a welcome, then the basics (your name, a profile picture, how you work with us),
  then "What would you like to learn?", which builds a short sample topic and adds it to their
  learning. Every step after the welcome can be skipped. Documents and checks will join later.
*/

const STEPS = ["Welcome", "Your name", "Your picture", "Your work", "Your learning"] as const;

export function Welcome() {
  const meApi = useApi<Me>("/api/me");
  const me = meApi.data;
  const saved = useHub((s) => s.onboarding);
  const [step, setStep] = useState(0);
  // The name box starts with the name we already have, once it's loaded.
  const [name, setName] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [nameProblem, setNameProblem] = useState<string | null>(null);
  const [role, setRole] = useState<string>(saved.role ?? "individual");
  const [services, setServices] = useState<string[]>(saved.services);
  const shownName = name ?? me?.user.name ?? "";
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  async function saveName() {
    const clean = shownName.replace(/\s+/g, " ").trim();
    if (!me || clean === me.user.name) return next();
    if (!clean) return setNameProblem("Enter the name you’d like to use, or skip this step.");
    setSavingName(true);
    setNameProblem(null);
    try {
      const r = await api<{ name: string }>("/api/me/preferences", { body: { name: clean } });
      meApi.setData({ ...me, user: { ...me.user, name: r.name } });
      setName(r.name);
      next();
    } catch (e) {
      setNameProblem((e as Error).message);
    } finally {
      setSavingName(false);
    }
  }

  /** Done: the answers are kept on this device, and the page moves on to "You're all set". */
  function finish() {
    setHub((s) => ({ ...s, onboarding: { ...s.onboarding, welcomed: true, role, services } }));
  }

  return (
    <div className="mx-auto max-w-xl px-4 pt-8 sm:px-6 lg:pt-12">
      <ol className="mb-6 flex gap-1.5" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1" aria-current={i === step ? "step" : undefined}>
            <span className="sr-only">
              {s}
              {i < step ? " (done)" : ""}
            </span>
            <span aria-hidden className={cx("block h-1.5 rounded-full", i <= step ? "bg-action" : "bg-strong")} />
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="flex flex-col gap-5">
          <div className="rounded-3xl bg-muted p-6">
            <Logo className="h-10 w-auto" />
          </div>
          <h1 className="font-serif text-4xl font-semibold tracking-tight">Welcome to Trilogy Care</h1>
          <p className="text-lg">
            We support people to live well at home, with support their way. As a Care Partner, you’re a big part of that.
          </p>
          <p className="text-lg">A few quick questions to set you up, then we’ll build you a short topic on something you’d like to learn.</p>
          <p className="text-ink-muted">It takes about two minutes. You can skip any step.</p>
          <button type="button" onClick={next} className="min-h-12 rounded-full bg-action px-6 text-lg font-semibold text-on-action hover:bg-action-hover">
            Get started
          </button>
        </section>
      )}

      {step === 1 && (
        <section className="flex flex-col gap-5">
          <h1 className="font-serif text-3xl font-semibold tracking-tight">What should we call you?</h1>
          <div className="flex flex-col gap-2">
            <label htmlFor="onboarding-name" className="font-semibold">
              Your name
            </label>
            <input
              id="onboarding-name"
              type="text"
              autoComplete="name"
              maxLength={80}
              value={shownName}
              disabled={!me}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void saveName()}
              className="min-h-12 w-full rounded-2xl border border-line-strong bg-surface px-3 text-lg"
            />
            <p className="text-sm text-ink-muted">Shown on your profile, in the Community and on your certificates.</p>
          </div>
          {nameProblem && (
            <p role="alert" className="flex gap-2 rounded-2xl border border-danger/60 p-3">
              <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-danger" />
              {nameProblem}
            </p>
          )}
          <Nav onBack={back} onSkip={next} onNext={saveName} nextLabel={savingName ? "Saving…" : "Next"} disabled={!me || savingName} />
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-5">
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Add a profile picture</h1>
          <p className="text-lg">It helps the team and the Community put a face to your name.</p>
          {me ? (
            <ProfilePicture me={me} onChange={(avatar) => meApi.setData({ ...me, user: { ...me.user, avatar } })} />
          ) : (
            <p className="text-ink-muted">Loading…</p>
          )}
          <Nav onBack={back} onSkip={me?.user.avatar ? undefined : next} onNext={next} nextLabel="Next" disabled={!me} />
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-col gap-5">
          <h1 className="font-serif text-3xl font-semibold tracking-tight">How do you work with us?</h1>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Your role</legend>
            {roles.map((r) => (
              <label
                key={r.id}
                className={cx(
                  "flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3",
                  role === r.id ? "border-action bg-tealtint" : "border-line",
                )}
              >
                <input type="radio" name="role" value={r.id} checked={role === r.id} onChange={() => setRole(r.id)} className="size-5 accent-[var(--action)]" />
                <span>
                  <span className="block font-semibold">{r.label}</span>
                  <span className="block text-sm text-ink-muted">{r.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-2 font-semibold">
              Which services do you provide? <span className="font-normal text-ink-muted">Choose any that apply.</span>
            </legend>
            {serviceTypes.map((s) => {
              const on = services.includes(s.id);
              return (
                <label
                  key={s.id}
                  className={cx("flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border-2 px-4", on ? "border-action bg-tealtint" : "border-line")}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setServices((cur) => (on ? cur.filter((x) => x !== s.id) : [...cur, s.id]))}
                    className="size-5 accent-[var(--action)]"
                  />
                  <span className="font-medium">{s.label}</span>
                </label>
              );
            })}
          </fieldset>
          <p className="flex gap-2 text-sm text-ink-muted">
            <Icon name="info" className="mt-0.5 size-4 shrink-0" />
            This helps us suggest learning. It doesn’t change what you can access.
          </p>
          <Nav onBack={back} onSkip={next} onNext={next} nextLabel="Next" />
        </section>
      )}

      {step === 4 && (
        <>
          <LearnStep onBuilt={finish} onSkip={finish} skipLabel="Skip and finish" />
          <button type="button" onClick={back} className="mt-4 inline-flex min-h-11 items-center gap-2 font-medium text-ink-muted hover:text-ink">
            <Icon name="arrow-left" className="size-4" /> Back
          </button>
        </>
      )}
    </div>
  );
}

function Nav({ onBack, onSkip, onNext, nextLabel, disabled }: { onBack: () => void; onSkip?: () => void; onNext: () => void; nextLabel: string; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={onBack} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line-strong px-4 font-medium hover:bg-muted">
        <Icon name="arrow-left" className="size-4" /> Back
      </button>
      {onSkip && (
        <button type="button" onClick={onSkip} className="inline-flex min-h-12 items-center rounded-full px-4 font-medium text-ink-muted hover:bg-muted hover:text-ink">
          Skip
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        className="ml-auto inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-action px-6 text-lg font-semibold text-on-action hover:bg-action-hover disabled:opacity-45 sm:flex-none"
      >
        {nextLabel}
      </button>
    </div>
  );
}
