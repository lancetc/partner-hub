"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { AID_TEMPLATES } from "@/lib/playbook";
import type { ResolvedSnippet } from "@/server/playbooks";
import { aidEvent } from "../favourites/favApi";
import { SaveNotice } from "../favourites/SaveNotice";
import { Icon } from "../Icon";

/*
  A Job Aid where it's placed in learning (docs/job-aids.md): a Magazine page or a Topic card. A specially styled
  section, part of the page. It shows when to use the tool and its essential action without anything to expand,
  and links to the full aid. It holds no copy: the aid is read by reference, so every placement shows the same
  current approved release, and a withdrawal reaches all of them at once.

  Someone whose role may not see the aid gets nothing here: no title, no excerpt.
*/

const showDate = (d: string) =>
  d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";

export function AidSection({ snippetId, why, preview, place }: { snippetId: string; why?: string; preview?: boolean; place: string }) {
  const url = `/api/playbooks/${snippetId}`;
  const loaded = useApi<ResolvedSnippet>(url);
  const [notice, setNotice] = useState<{ first: boolean } | null>(null);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const v = loaded.data;
  if (!v) return loaded.error ? null : <div aria-hidden className="h-40 w-full animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" />;
  if (!v.permitted) return null;

  const save = async () => {
    if (busy || preview) return;
    setBusy(true);
    setFailed("");
    try {
      const r = await api<{ saved: boolean; first: boolean }>(url, { body: { action: "save", on: !v.saved } });
      setNotice((n) => (r.saved ? { first: r.first || Boolean(n?.first) } : null));
      loaded.reload();
    } catch (e) {
      // Not saved, and it says so: the button stays as it was.
      setFailed(e instanceof Error ? e.message : "That couldn’t be saved. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const down = v.readiness === "fallback" || !v.release;
  const now = (v.release?.steps ?? []).filter((s) => s.kind === "now" && s.text.trim());
  const safety = v.risk === "safety_critical";

  return (
    <section
      aria-label={`Work tool: ${v.title}`}
      className="w-full rounded-3xl border-2 border-teal bg-[color-mix(in_srgb,var(--surface-teal)_55%,var(--surface))] p-5 sm:p-6 print:border-black"
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">
        <Icon name="clipboard" className="size-4" /> Work tool
        <span className="font-semibold normal-case tracking-normal text-ink-muted">
          · {AID_TEMPLATES[v.template].label}
          {v.minutes > 0 && ` · about ${v.minutes} min`}
        </span>
      </p>
      <h3 className="mt-1 font-serif text-2xl font-semibold leading-snug">{v.title}</h3>
      {v.trigger && (
        <p className="mt-2">
          <span className="font-semibold">Use when:</span> {v.trigger}
        </p>
      )}
      {down ? (
        <div className="mt-3 rounded-2xl bg-[#fff1cc] p-4 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]" role="status">
          <p className="font-semibold">Temporarily unavailable</p>
          <p className="mt-1">{v.fallback.text}</p>
          {v.fallback.contacts.length > 0 && (
            <ul className="mt-2 text-sm">
              {v.fallback.contacts.map((c) => (
                <li key={c.key}>
                  <span className="font-semibold">{c.label}:</span> {c.route}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          {v.release!.quick && <p className="mt-2 text-lg leading-relaxed">{v.release!.quick}</p>}
          {/* A safety or escalation step is never behind a button: the "do now" steps are always on the page. */}
          {(safety || !v.release!.quick) && now.length > 0 && (
            <ol className="mt-2 list-decimal space-y-1 pl-6 text-lg">
              {now.map((s) => (
                <li key={s.id}>{s.text}</li>
              ))}
            </ol>
          )}
          {safety && <p className="mt-2 font-semibold text-[#8f1d17] dark:text-[#ffb4a6]">If someone is in immediate danger, call 000.</p>}
        </>
      )}
      {why && (
        <p className="mt-3 text-ink-muted">
          <span className="font-semibold text-ink">Why now:</span> {why}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/tools/${v.id}?from=placement`}
          onClick={() => !preview && aidEvent({ event: "job_aid_opened_from_placement", snippetId: v.id, place })}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-4 font-semibold text-on-action"
        >
          Open full Job Aid <Icon name="arrow-right" className="size-4" />
        </Link>
        <button
          type="button"
          aria-pressed={v.saved}
          disabled={busy || preview}
          onClick={() => void save()}
          className={cx(
            "inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted",
            busy && "opacity-70",
          )}
        >
          <Icon name={v.saved ? "bookmark-filled" : "bookmark"} className="size-4" /> {v.saved ? "In your Favourites" : "Save to Favourites"}
        </button>
      </div>
      {failed && (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger">
          {failed}
        </p>
      )}
      {notice && <SaveNotice first={notice.first} onClose={() => setNotice(null)} />}
      {!down && (
        <p className="mt-3 text-sm text-ink-muted">
          Approved source · {v.ownerTeam} · effective {showDate(v.release!.effectiveOn)} · release {v.release!.number}
          {v.readiness === "review_due" && " · due for review"}
        </p>
      )}
    </section>
  );
}
