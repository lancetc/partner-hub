"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import type { Risk, ThemeStatus } from "@/lib/problemDesk";

export type Act = (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>;

/** One change at a time: post it, read the view again, and show what went wrong in words. */
export function useAct(reload: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act: Act = async (body) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<Record<string, unknown>>("/api/admin/problems", { body });
      reload();
      return r;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { act, error, busy, clear: () => setError(null) };
}

export const box = "rounded-2xl border border-line bg-surface p-4";
export const area = "min-h-20 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[0.98rem]";
export const riskTone = (r: Risk) => (r === "safety" ? "bad" : r === "elevated" ? "warn" : "neutral");
export const statusTone = (s: ThemeStatus) => (s === "closed" || s === "addressed" ? "good" : s === "immediate" ? "bad" : s === "plan" ? "info" : "neutral");
export const dateText = (d: string) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";

/** A headline number. "Not measured" is said in words: it is never shown as zero. */
export function Tile({ label, value, detail }: { label: string; value: number | string | null; detail?: string }) {
  return (
    <div className={cx(box, "min-w-0")}>
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <p className={cx("mt-1 font-serif font-semibold tabular-nums", value === null ? "text-lg text-ink-muted" : "text-3xl")}>
        {value === null ? "Not measured" : typeof value === "number" ? value.toLocaleString("en-AU") : value}
      </p>
      {detail && <p className="mt-0.5 text-xs text-ink-muted">{detail}</p>}
    </div>
  );
}

export function Section({ title, hint, children, aside }: { title: string; hint?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-xl font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 max-w-3xl text-sm text-ink-muted">{hint}</p>}
        </div>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
