"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { ESSENTIAL, IN_APP_ONLY, type TopicSetting } from "@/lib/emailTopics";
import { cx } from "@/lib/format";
import { Icon } from "./Icon";

/*
  Email choices: the essential notices everyone gets (shown, locked on), then each optional topic as a
  switch that saves straight away. Used in Profile and settings (signed in) and on the page the link
  in every email opens (`token`: no sign-in needed).
*/

type Data = { topics: TopicSetting[]; email?: string; firstName?: string };

export function EmailSettings({ token, highlight }: { token?: string; highlight?: string | null }) {
  const url = token ? `/api/unsubscribe?t=${encodeURIComponent(token)}` : "/api/me/email";
  const { data, error, setData } = useApi<Data>(url);
  const [saving, setSaving] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function change(body: { topic?: string; on?: boolean; all?: boolean }, label: string) {
    setSaving(body.topic ?? "all");
    setProblem(null);
    try {
      const r = token
        ? await api<{ topics: TopicSetting[] }>("/api/unsubscribe", { body: { token, topic: body.topic, subscribe: body.on, all: body.all } })
        : await api<Data>("/api/me/email", { method: "PUT", body });
      setData({ ...(data ?? {}), topics: r.topics });
      setNote(label);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  if (error) return <p className="text-danger">{error}</p>;
  if (!data) return <p className="text-ink-muted">Loading your email settings…</p>;
  const anyOn = data.topics.some((t) => t.on);

  return (
    <div className="flex flex-col gap-5">
      {data.email && (
        <p className="text-sm text-ink-muted">
          Emails go to <span className="font-semibold text-ink">{data.email}</span>.
        </p>
      )}

      <div>
        <h3 className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Always sent</h3>
        <ul className="mt-2 flex flex-col gap-2">
          {ESSENTIAL.map((e) => (
            <li key={e.id} className="flex items-start gap-3 rounded-2xl bg-muted px-4 py-3">
              <Icon name="lock" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{e.label}</span>
                <span className="block text-sm text-ink-muted">{e.description}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-ink-muted">Can’t be turned off</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Your choice</h3>
          <button
            type="button"
            disabled={saving !== null}
            onClick={() => change({ all: true, on: !anyOn }, anyOn ? "All optional emails are off." : "All optional emails are on.")}
            className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold text-accent hover:bg-muted disabled:opacity-50"
          >
            {anyOn ? "Turn off all optional emails" : "Turn them all on"}
          </button>
        </div>
        <ul className="mt-2 flex flex-col divide-y divide-line rounded-2xl border border-line">
          {data.topics.map((t) => (
            <li key={t.id} className={cx("flex items-start gap-4 px-4 py-3.5", highlight === t.id && "bg-gold/10")}>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold" id={`topic-${t.id}`}>
                  {t.label}
                </span>
                <span className="block text-sm text-ink-muted">{t.description}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={t.on}
                aria-labelledby={`topic-${t.id}`}
                disabled={saving !== null}
                onClick={() => change({ topic: t.id, on: !t.on }, `${t.label}: ${t.on ? "off" : "on"}.`)}
                className={cx(
                  "relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
                  t.on ? "bg-[#008282]" : "bg-strong ring-1 ring-line-strong",
                )}
              >
                <span className={cx("inline-block size-5 rounded-full bg-white shadow transition-transform", t.on ? "translate-x-6" : "translate-x-1")} />
                <span className="sr-only">{t.on ? "On" : "Off"}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-ink-muted" role="status">
          {problem ? <span className="font-semibold text-danger">{problem}</span> : (note ?? "Changes save straight away.")}
        </p>
      </div>

      <p className="flex items-start gap-2 rounded-2xl bg-tealtint px-4 py-3 text-sm">
        <Icon name="inbox" className="mt-0.5 size-4 shrink-0" />
        <span>Everything still appears in your Inbox, whatever you choose here. {IN_APP_ONLY}</span>
      </p>
    </div>
  );
}
