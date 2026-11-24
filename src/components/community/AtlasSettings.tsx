"use client";

import { useState } from "react";
import Link from "next/link";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { ATLAS_TOPICS, START_TOWNS, STATE_NAMES, STATES, type AtlasTopic, type TownId } from "@/content/communityAtlas";
import { Icon } from "../Icon";

/*
  Profile and settings → Community Atlas: the box that puts you on the map (server/communityAtlas). Off until you
  tick it. You choose the nearest town from a list, up to three topics, and whether to show your organisation;
  unticking it deletes what you'd saved.
*/

type MyAtlas = { town: TownId; topics: AtlasTopic[]; canHelp: AtlasTopic[]; askingAbout: AtlasTopic[]; showOrg: boolean };
const MAX = 3;
const EMPTY: MyAtlas = { town: "" as TownId, topics: [], canHelp: [], askingAbout: [], showOrg: false };

export function AtlasSettings() {
  const { data, error, setData } = useApi<{ atlas: MyAtlas | null }>("/api/me/atlas");
  const saved = data?.atlas ?? null;
  const [draft, setDraft] = useState<MyAtlas | null>(null);
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const joined = on ?? Boolean(saved);
  const d = draft ?? saved ?? EMPTY;
  const set = (next: Partial<MyAtlas>) => {
    setNote(null);
    setDraft({ ...d, ...next });
  };
  const toggleTopic = (t: AtlasTopic) => {
    const has = d.topics.includes(t);
    if (!has && d.topics.length >= MAX) return;
    const topics = has ? d.topics.filter((x) => x !== t) : [...d.topics, t];
    set({ topics, canHelp: d.canHelp.filter((x) => topics.includes(x)), askingAbout: d.askingAbout.filter((x) => topics.includes(x)) });
  };
  const toggleIn = (key: "canHelp" | "askingAbout", t: AtlasTopic) => set({ [key]: d[key].includes(t) ? d[key].filter((x) => x !== t) : [...d[key], t] });
  const changed = !saved || JSON.stringify(d) !== JSON.stringify(saved);

  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const out = await api<{ atlas: MyAtlas }>("/api/me/atlas", { method: "PUT", body: d });
      setData(out);
      setDraft(null);
      setNote(saved ? "Saved. The Atlas shows your changes now." : "You’re on the Atlas.");
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const leave = async () => {
    setBusy(true);
    setProblem(null);
    try {
      if (saved) await api("/api/me/atlas", { method: "DELETE" });
      setData({ atlas: null });
      setDraft(null);
      setOn(false);
      setNote(saved ? "You’re off the Atlas. Your town and topics have been deleted." : null);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="atlas" className="mt-5 scroll-mt-24 rounded-3xl border border-line bg-surface p-5" aria-labelledby="atlas-heading">
      <h2 id="atlas-heading" className="flex items-center gap-2 font-serif text-xl font-semibold">
        <Icon name="pin" className="size-5 text-accent" /> Community Atlas
      </h2>
      <p className="mt-1 text-ink-muted">
        Appear on the{" "}
        <Link href="/community#atlas" className="font-semibold text-accent hover:underline">
          Community Atlas
        </Link>{" "}
        so colleagues can find common ground with you. It shows your name, picture, role, the nearest town from a list and the topics you choose. Never an
        address, and never where your device is.
      </p>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {data && (
        <>
          <label className="mt-4 flex items-center gap-3 font-semibold">
            <input
              type="checkbox"
              className="size-5 accent-[var(--color-action)]"
              checked={joined}
              disabled={busy}
              onChange={(e) => {
                setNote(null);
                if (e.target.checked) setOn(true);
                else void leave();
              }}
            />
            Show me on the Community Atlas
          </label>

          {joined && (
            <div className="mt-4 flex flex-col gap-5">
              <label className="flex flex-col gap-1.5">
                <span className="font-semibold">Nearest town</span>
                <span className="text-sm text-ink-muted">Pick the closest one on the list. A small place is never pinned on its own.</span>
                <select
                  value={d.town}
                  onChange={(e) => set({ town: e.target.value as TownId })}
                  className="min-h-11 max-w-sm rounded-xl border border-line-strong bg-bg px-3"
                >
                  <option value="">Choose a town…</option>
                  {STATES.map((s) => {
                    const towns = START_TOWNS.filter(([, t]) => t.state === s);
                    return towns.length ? (
                      <optgroup key={s} label={STATE_NAMES[s]}>
                        {towns.map(([id, t]) => (
                          <option key={id} value={id}>
                            {t.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null;
                  })}
                </select>
              </label>

              <fieldset>
                <legend className="font-semibold">Topics you talk about</legend>
                <p className="text-sm text-ink-muted">
                  Up to {MAX}. {d.topics.length}/{MAX} chosen.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ATLAS_TOPICS.map((t) => {
                    const picked = d.topics.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={picked}
                        disabled={!picked && d.topics.length >= MAX}
                        onClick={() => toggleTopic(t)}
                        className={cx(
                          "min-h-9 rounded-full border px-3 text-sm font-medium disabled:opacity-40",
                          picked ? "border-[#008282] bg-tealtint font-semibold" : "border-line hover:border-[#008282]",
                        )}
                      >
                        {picked && <Icon name="check" className="-ml-0.5 mr-1 inline size-3.5" />}
                        {t}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {d.topics.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {(
                    [
                      ["canHelp", "I can help with"],
                      ["askingAbout", "I’d like help with"],
                    ] as const
                  ).map(([key, label]) => (
                    <fieldset key={key}>
                      <legend className="font-semibold">
                        {label} <span className="font-normal text-ink-muted">(optional)</span>
                      </legend>
                      <div className="mt-2 flex flex-col gap-1.5">
                        {d.topics.map((t) => (
                          <label key={t} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="size-4 accent-[var(--color-action)]"
                              checked={d[key].includes(t)}
                              onChange={() => toggleIn(key, t)}
                            />
                            {t}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </div>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-action)]"
                  checked={d.showOrg}
                  onChange={(e) => set({ showOrg: e.target.checked })}
                />
                Show my organisation as well
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={busy || !changed || !d.town || !d.topics.length}
                  className="min-h-11 rounded-full bg-action px-5 font-semibold text-white hover:bg-action-hover disabled:opacity-50"
                >
                  {busy ? "Saving…" : saved ? "Save changes" : "Put me on the Atlas"}
                </button>
                {!saved && (!d.town || !d.topics.length) && <span className="text-sm text-ink-muted">Choose a town and at least one topic.</span>}
              </div>
              <p className="text-xs text-ink-muted">
                Anyone signed in to the Hub can see the Atlas. Untick the box at any time and your town and topics are deleted.
              </p>
            </div>
          )}
          {problem && (
            <p role="alert" className="mt-3 rounded-xl bg-[#fdecea] px-3 py-2 text-sm text-[#8a1c12]">
              {problem}
            </p>
          )}
          {note && (
            <p role="status" className="mt-3 rounded-xl bg-tealtint px-3 py-2 text-sm">
              {note}
            </p>
          )}
        </>
      )}
    </section>
  );
}
