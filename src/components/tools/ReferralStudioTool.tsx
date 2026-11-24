"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import type { KitFields } from "@/lib/referralKit";
import type { PracticeView, StudioHome } from "@/server/referralStudio";
import { Icon } from "../Icon";
import { ReferralPractice } from "../referral/ReferralPractice";
import { OutreachKit } from "../referral/OutreachKit";
import { newKey, type Driver } from "../referral/practiceDriver";

/*
  The Local Referral Studio Work Tool (docs/local-referral-studio.md): practise a conversation, make the approved
  one-pager, pitch card and email drafts, and keep your business's saved drafts and relationship notes. Only for the
  business owner and the people they authorise; nothing here is shared outside the business, and nothing is sent.
*/

type Home = Extract<StudioHome, { kit: unknown }>;
const URL_ = "/api/tools/referral-studio";
const tabs = [
  { id: "practise", label: "Practise a conversation", icon: "chat" },
  { id: "kit", label: "Create an approved one-pager", icon: "doc" },
  { id: "saved", label: "Saved drafts and notes", icon: "bookmark" },
] as const;
type Tab = (typeof tabs)[number]["id"];

const field = "min-h-11 w-full rounded-xl border border-line-strong bg-bg px-3 py-2 text-base";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";

/**
  A pitch card opened from Favourites (?card=) lands on the saved list. It's read once, in the browser: nothing it
  changes is drawn until the tool's data has loaded, so the server's markup and the first client render agree.
*/
const cardParam = () => {
  if (typeof window === "undefined") return "";
  const c = new URLSearchParams(window.location.search).get("card") ?? "";
  return /^ra-[\w-]{1,40}$/.test(c) ? c : "";
};

export function ReferralStudioTool() {
  const loaded = useApi<StudioHome>(URL_);
  const [focus] = useState(cardParam);
  const [tab, setTab] = useState<Tab>(focus ? "saved" : "practise");
  const [kitFrom, setKitFrom] = useState<Partial<KitFields> | null>(null);
  const home = loaded.data && "kit" in loaded.data ? (loaded.data as Home) : null;
  if (loaded.error) return <p role="alert">{loaded.error}</p>;
  if (!loaded.data) return <p className="mt-6 text-ink-muted">Loading…</p>;
  if (!home)
    return (
      <div className={cx(box, "mt-6")}>
        <p className="font-semibold">The Local Referral Studio is for the business owner and the people they’ve authorised.</p>
        <p className="mt-1 text-ink-muted">
          If you run a Care Partner business, ask Trilogy Care to set up your business planning access. Anyone can practise in the Magazine’s referral
          conversation.
        </p>
      </div>
    );
  return (
    <div className="mt-6 space-y-5">
      <p className="text-sm text-ink-muted">
        Private to <span className="font-semibold text-ink">{home.access.orgName}</span>. Practice, drafts and notes are never shared outside your business, and
        nothing here is sent.
      </p>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Local Referral Studio">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={cx(
              "inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold ring-1 ring-line",
              tab === t.id ? "bg-action text-on-action" : "bg-surface hover:bg-muted",
            )}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} className="size-4" /> {t.label}
          </button>
        ))}
      </div>
      <div hidden={tab !== "practise"}>
        <PracticeTab
          practice={home.practice}
          onMakeKit={(p) => {
            setKitFrom({ stage: p.stage, audience: p.audience as KitFields["audience"] });
            setTab("kit");
          }}
        />
      </div>
      {tab === "kit" && <OutreachKit key={JSON.stringify(kitFrom)} home={home} initial={kitFrom ?? undefined} onSaved={() => loaded.reload()} />}
      {tab === "saved" && <Saved home={home} focus={focus} reload={loaded.reload} onRemake={(f) => (setKitFrom(f), setTab("kit"))} />}
    </div>
  );
}

/** The practice, driven by the Work Tool's API. The driver is made once, from the first load: later views come from its own calls. */
function PracticeTab({ practice, onMakeKit }: { practice: PracticeView; onMakeKit: React.ComponentProps<typeof ReferralPractice>["onMakeKit"] }) {
  const [driver] = useState<Driver>(() => ({ load: async () => practice, act: (body) => api<PracticeView>(URL_, { body }) }));
  return <ReferralPractice driver={driver} initial={practice} onMakeKit={onMakeKit} />;
}

function Saved({ home, focus, reload, onRemake }: { home: Home; focus: string; reload: () => void; onRemake: (f: Partial<KitFields>) => void }) {
  const [form, setForm] = useState({
    metOn: home.kit.today,
    category: "gp",
    area: home.kit.template.serviceAreas[0]?.id ?? "",
    assetId: "",
    theme: "admin",
    followUpOn: "",
    owner: "owner",
  });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const save = async () => {
    setError("");
    try {
      await api(URL_, { body: { action: "activity", idem: newKey("act"), ...form } });
      setMsg("Recorded. This is relationship activity, not an introduction or a referral.");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t save.");
    }
  };
  return (
    <div className="space-y-6">
      <section aria-labelledby="saved-h">
        <h2 id="saved-h" className="font-serif text-xl font-semibold">
          Saved drafts and pitch cards
        </h2>
        {!home.assets.length ? (
          <p className="mt-2 text-ink-muted">Nothing saved yet. Make a one-pager or a pitch card first.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {home.assets.map((a) => (
              <li key={a.id} className={cx(box, focus === a.id && "ring-2 ring-action")}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">
                    {a.kind === "pitchcard" ? "Pitch card" : "One-pager and emails"}: {a.audienceLabel}, {a.stageLabel.toLowerCase()}
                  </p>
                  <p className="text-sm font-semibold">
                    {a.standing === "approved" ? "Current approved" : a.standing === "outdated" ? "Marked for review" : "Draft: review required"}
                  </p>
                </div>
                <p className="text-sm text-ink-muted">
                  {a.templateVersion} · made {a.createdAt.slice(0, 10)} · {a.downloaded ? "printed" : "not printed"} ·{" "}
                  {a.copied ? "an email copied" : "no email copied"} · never sent
                </p>
                {a.reasons.length > 0 && <p className="mt-1 text-sm">{a.reasons.join(" ")}</p>}
                <button
                  type="button"
                  className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline"
                  onClick={() => onRemake(a.fields)}
                >
                  {a.standing === "outdated" ? "Make a replacement" : "Open in the kit"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="notes-h" className="space-y-3">
        <h2 id="notes-h" className="font-serif text-xl font-semibold">
          Relationship notes
        </h2>
        <p className="text-sm text-ink-muted">
          A meeting or follow-up, by hand: no names, no patient details, no free text. It’s relationship activity: never counted as an introduction or a
          referral.
        </p>
        <form className={cx(box, "grid gap-3 sm:grid-cols-2")} onSubmit={(e) => (e.preventDefault(), void save())}>
          <label className="block">
            <span className="font-semibold">Date you met</span>
            <input
              type="date"
              className={cx(field, "mt-1")}
              value={form.metOn}
              max={home.kit.today}
              onChange={(e) => setForm({ ...form, metOn: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="font-semibold">Kind of organisation</span>
            <select className={cx(field, "mt-1")} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {home.options.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-semibold">Area</span>
            <select className={cx(field, "mt-1")} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
              {home.kit.template.serviceAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-semibold">Draft you used (optional)</span>
            <select className={cx(field, "mt-1")} value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })}>
              <option value="">None</option>
              {home.assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.kind === "pitchcard" ? "Pitch card" : "One-pager"} · {a.audienceLabel} · {a.templateVersion}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-semibold">Broad question theme</span>
            <select className={cx(field, "mt-1")} value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })}>
              {home.options.themes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-semibold">Next follow-up (optional)</span>
            <input type="date" className={cx(field, "mt-1")} value={form.followUpOn} onChange={(e) => setForm({ ...form, followUpOn: e.target.value })} />
          </label>
          <label className="block">
            <span className="font-semibold">Who owns it</span>
            <select className={cx(field, "mt-1")} value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}>
              {home.options.owners.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action">
              Record the note
            </button>
          </div>
        </form>
        {msg && <p role="status">{msg}</p>}
        {error && (
          <p role="alert" className="font-semibold text-[#b3261e]">
            {error}
          </p>
        )}
        {home.activity.length > 0 && (
          <ul className="space-y-2">
            {home.activity.map((r) => (
              <li key={r.id} className={box}>
                <p className="font-semibold">
                  {r.metOn} · {r.category} · {r.area}
                </p>
                <p className="text-sm text-ink-muted">
                  {r.theme} · owner: {r.owner}
                  {r.followUpOn ? ` · follow up ${r.followUpOn}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
