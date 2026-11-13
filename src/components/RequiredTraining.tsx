"use client";

import Link from "next/link";
import { cx, formatDate } from "@/lib/format";
import type { RegisterStatus } from "@/lib/complianceRegister";
import { Icon } from "./Icon";

export type RequiredItem = {
  slug: string;
  title: string;
  minutes: number;
  status: RegisterStatus;
  label: string;
  completedAt: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
  missing: string[];
};

/** When it needs doing, in a few words. */
function when(t: RequiredItem) {
  if (t.status === "expired") return t.expiresAt ? `Expired ${formatDate(t.expiresAt)}. Refresh it now.` : "Expired. Refresh it now.";
  if (t.status === "due_soon")
    return `Refresh by ${formatDate(t.expiresAt!)}${t.daysLeft !== null ? ` (${t.daysLeft} ${t.daysLeft === 1 ? "day" : "days"})` : ""}`;
  if (t.status === "refresher") return "The topic has changed since you did it. Do it again.";
  if (t.status === "approval") return "Your quiz result is waiting for the compliance team to approve.";
  if (t.status === "in_progress") return "You’ve started this. Pick up where you left off.";
  if (t.status === "not_trained") return `Required. About ${t.minutes} minutes.`;
  if (t.status === "evidence")
    return t.missing.includes("an assessment record")
      ? `Completed ${formatDate(t.completedAt!)}, but there’s no quiz result on record. Do it again to record one.`
      : `Completed ${formatDate(t.completedAt!)}. A manager still needs to sign it off.`;
  return t.expiresAt ? `Done ${formatDate(t.completedAt!)} · next refresh ${formatDate(t.expiresAt)}` : `Done ${formatDate(t.completedAt!)}`;
}

/** Required training that needs the person to do something: expired, due soon, changed, not done, or missing its quiz result. */
export const requiredToDo = (items: RequiredItem[]) =>
  items.filter(
    (t) => t.status === "expired" || t.status === "due_soon" || t.status === "refresher" || t.status === "not_trained" || t.missing.includes("an assessment record"),
  );

/**
  The person's required (compliance register) training, as a card in the "Your learning" panel
  (HomeLearning): what's due first, each linking to its topic.
*/
export function RequiredTraining({ items, className }: { items: RequiredItem[]; className?: string }) {
  if (!items.length) return null;
  const action = requiredToDo(items).length;
  return (
    <section aria-labelledby="required-training" className={cx("flex flex-col gap-1 rounded-2xl border border-line p-4", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="required-training" className="flex items-center gap-1.5 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">
          <Icon name="shield" className="size-4 text-accent" /> Your required training
        </h3>
        <span className={cx("text-sm", action ? "font-semibold text-danger" : "text-ink-muted")}>{action ? `${action} to do` : "All up to date"}</span>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {items.map((t) => {
          const urgent = t.status === "expired" || t.status === "due_soon";
          return (
            <li key={t.slug}>
              <Link href={`/topics/${encodeURIComponent(t.slug)}`} className="flex min-h-14 items-center justify-between gap-3 py-2.5 hover:text-accent">
                <span className="min-w-0">
                  <span className="block font-semibold">{t.title}</span>
                  <span className={cx("block text-sm", t.status === "expired" ? "font-semibold text-danger" : "text-ink-muted")}>{when(t)}</span>
                </span>
                <span
                  className={cx(
                    "shrink-0 rounded-full border px-2.5 py-0.5 font-mulish text-xs font-bold",
                    t.status === "current"
                      ? "border-success bg-success/10"
                      : urgent
                        ? t.status === "expired"
                          ? "border-danger bg-danger/10"
                          : "border-gold bg-gold/15"
                        : "border-line-strong text-ink-muted",
                  )}
                >
                  {t.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
