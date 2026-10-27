"use client";

import { useId, useState } from "react";
import type { Card } from "@/content/lessons";
import { Icon } from "../Icon";
import { formatMoney } from "@/lib/format";

type Calc = Extract<Card, { type: "calculator" }>["calc"];

/** Reviewed formula from the lesson data: total = minutes ÷ 60 × hourly rate, rounded to the dollar. */
export function totalFor(minutes: number, rate: number) {
  return Math.round((minutes / 60) * rate);
}

export function Calculator({ calc, value, onChange }: { calc: Calc; value: number; onChange: (minutes: number) => void }) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(calc.max, Math.max(calc.min, n));
  const total = totalFor(value, calc.rate);
  const base = totalFor(calc.initial, calc.rate);
  const fill = ((value - calc.min) / (calc.max - calc.min)) * 100;

  const step = (dir: 1 | -1) => onChange(clamp(value + dir * calc.step));

  return (
    <div className="rounded-3xl bg-muted p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-surface px-3 py-1 font-mulish text-xs font-bold text-ink-muted">Illustrative figures</span>
        <span className="font-mulish text-sm text-ink-muted">{formatMoney(calc.rate)} an hour</span>
      </div>

      <output htmlFor={`${id}-range ${id}-num`} aria-live="polite" className="mt-4 block text-center">
        <span className="block font-serif text-6xl font-semibold tracking-tight text-ink">{formatMoney(total)}</span>
        <span className="mt-1 block text-ink-muted">
          for a {value} minute visit
          {value !== calc.initial && (
            <>
              {" "}
              · {value > calc.initial ? "+" : "−"}
              {formatMoney(Math.abs(total - base))} on the planned visit
            </>
          )}
        </span>
      </output>

      <label htmlFor={`${id}-range`} className="mt-5 block font-medium">
        Visit length
      </label>
      <input
        id={`${id}-range`}
        type="range"
        min={calc.min}
        max={calc.max}
        step={calc.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={`${value} minutes, ${formatMoney(total)}`}
        className="brand-range w-full"
        style={{ ["--fill" as string]: `${fill}%` }}
      />
      <div className="flex justify-between font-mulish text-xs text-ink-muted" aria-hidden>
        <span>{calc.min} min</span>
        <span>{calc.max} min</span>
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={value <= calc.min}
          aria-label={`Decrease by ${calc.step} minutes`}
          className="inline-flex size-12 items-center justify-center rounded-full border border-line-strong bg-surface disabled:opacity-40"
        >
          <Icon name="minus" />
        </button>
        <label htmlFor={`${id}-num`} className="sr-only">
          Minutes
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`${id}-num`}
            type="number"
            inputMode="numeric"
            min={calc.min}
            max={calc.max}
            step={calc.step}
            value={draft ?? value}
            onChange={(e) => {
              setDraft(e.target.value);
              const n = Number(e.target.value);
              if (e.target.value !== "" && n >= calc.min && n <= calc.max) onChange(n);
            }}
            onBlur={() => setDraft(null)}
            className="h-12 w-20 rounded-xl border border-line-strong bg-surface text-center text-lg font-semibold"
          />
          <span className="text-ink-muted">minutes</span>
        </div>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={value >= calc.max}
          aria-label={`Increase by ${calc.step} minutes`}
          className="inline-flex size-12 items-center justify-center rounded-full border border-line-strong bg-surface disabled:opacity-40"
        >
          <Icon name="plus" />
        </button>
      </div>
      {draft !== null && (Number(draft) < calc.min || Number(draft) > calc.max || draft === "") && (
        <p className="mt-2 text-center text-sm font-medium text-ink" role="alert">
          <Icon name="alert" className="mr-1 inline size-4 text-danger" />
          Enter a number from {calc.min} to {calc.max}.
        </p>
      )}

      <details className="mt-4 text-sm text-ink-muted">
        <summary className="min-h-11 cursor-pointer content-center font-semibold text-accent">How this is calculated</summary>
        <p className="mt-1">
          <span className="font-mono text-ink">{calc.formula}</span>
        </p>
        <p className="mt-1">{calc.assumptions}</p>
      </details>
    </div>
  );
}
