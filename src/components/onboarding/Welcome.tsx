"use client";

import { useState } from "react";
import { roles, serviceTypes } from "@/content/onboarding";
import { commitHub } from "@/lib/store";
import { Icon } from "../Icon";
import { cx } from "@/lib/format";
import { Logo } from "../Header";

export function Welcome() {
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<string>("individual");
  const [services, setServices] = useState<string[]>([]);
  const [saving, setSaving] = useState<"idle" | "saving" | "error">("idle");

  async function finish() {
    setSaving("saving");
    try {
      await commitHub((s) => ({ ...s, onboarding: { ...s.onboarding, welcomed: true, role, services } }));
    } catch {
      setSaving("error");
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 pt-8 sm:px-6 lg:pt-12">
      <ol className="mb-6 flex gap-1.5" aria-label="Setup steps">
        {["Welcome", "Your role", "Your services"].map((s, i) => (
          <li key={s} className="flex-1" aria-current={i === step ? "step" : undefined}>
            <span className="sr-only">{s}</span>
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
          <p className="text-lg">
            Next, tell us about your role and services. We’ll create a checklist of what you need, and show what we’re checking along
            the way.
          </p>
          <p className="text-ink-muted">You can save and come back at any time.</p>
          <button type="button" onClick={() => setStep(1)} className="min-h-12 rounded-full bg-action px-6 text-lg font-semibold text-on-action hover:bg-action-hover">
            Get started
          </button>
        </section>
      )}

      {step === 1 && (
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
          <p className="flex gap-2 text-sm text-ink-muted">
            <Icon name="info" className="mt-0.5 size-4 shrink-0" />
            Your role suggests a checklist and learning path. It doesn’t change what you can access.
          </p>
          <Nav onBack={() => setStep(0)} onNext={() => setStep(2)} nextLabel="Next" />
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-5">
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Which services do you provide?</h1>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-2 text-ink-muted">Choose all that apply. Some services need extra documents.</legend>
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
          {saving === "error" && (
            <p role="alert" className="flex gap-2 rounded-2xl border border-danger/60 p-3">
              <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-danger" />
              We couldn’t save your choices. Your selections are still here. Please try again.
            </p>
          )}
          <Nav
            onBack={() => setStep(1)}
            onNext={finish}
            nextLabel={saving === "saving" ? "Creating your checklist…" : "Create my checklist"}
            disabled={!services.length || saving === "saving"}
          />
        </section>
      )}
    </div>
  );
}

function Nav({ onBack, onNext, nextLabel, disabled }: { onBack: () => void; onNext: () => void; nextLabel: string; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={onBack} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line-strong px-4 font-medium hover:bg-muted">
        <Icon name="arrow-left" className="size-4" /> Back
      </button>
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
