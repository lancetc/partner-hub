"use client";

import { useState } from "react";
import Link from "next/link";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { HOUSE_RULES, REPLY_LENGTHS, type MemberChatSettings } from "@/lib/memberChat";
import { AdminShell, btn, ErrorNote, Field, input } from "./ui";
import { Portrait } from "../community/DigitalMemberProfile";
import { Icon } from "../Icon";

/*
  Admin → Digital Member chat (server/memberChat): the switch, who may chat and how much, which members take chats,
  extra instructions on top of the fixed house rules, and a preview of exactly what the AI is told for any member.
  Use counts only: nobody's chat is stored.
*/

type Admin = {
  settings: MemberChatSettings;
  version: string;
  provider: { name: string; model: string } | null;
  members: { id: string; name: string; portrait: string; chats: number; messages: number }[];
  totals: { chats: number; messages: number; people: number };
};

export function MemberChatAdmin() {
  const { data, error, setData } = useApi<Admin>("/api/admin/member-chat");
  const [draft, setDraft] = useState<MemberChatSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState("");
  const preview = useApi<{ rules: string; context: string }>(previewId ? `/api/admin/member-chat?preview=${encodeURIComponent(previewId)}` : null);

  if (error) return <AdminShell title="Digital Member chat">{<ErrorNote text={error} />}</AdminShell>;
  if (!data)
    return (
      <AdminShell title="Digital Member chat">
        <p className="text-ink-muted">Loading…</p>
      </AdminShell>
    );
  // The working copy: the saved settings until something is changed.
  const d = draft ?? data.settings;
  const changed = JSON.stringify(d) !== JSON.stringify(data.settings);
  const set = <K extends keyof MemberChatSettings>(k: K, v: MemberChatSettings[K]) => setDraft({ ...d, [k]: v });
  const save = async () => {
    setSaving(true);
    setProblem(null);
    setNote(null);
    try {
      const next = await api<Admin>("/api/admin/member-chat", { body: d });
      setData(next);
      setDraft(null);
      setNote("Saved. The chat uses these settings from the next message.");
      if (previewId) preview.reload();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell title="Digital Member chat">
      <div className="flex max-w-4xl flex-col gap-6">
        <p className="text-ink-muted">
          On{" "}
          <Link href="/community#digital" className="font-semibold text-accent hover:underline">
            Community → Digital Members
          </Link>
          , learners can have a short chat with one of the fictional people they’ll meet in training. An AI plays the person from their introduction only, under
          the house rules below. Nothing anyone writes is stored: only that a message was sent, for the hourly limit and the counts here.
        </p>

        {/* The switch, and what's connected. */}
        <section className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-3 text-lg font-semibold">
              <input
                type="checkbox"
                className="size-5 accent-[var(--color-action)]"
                checked={d.enabled}
                onChange={(e) => set("enabled", e.target.checked)}
              />
              Chat is {d.enabled ? "on" : "off"}
            </label>
            <p className="text-sm text-ink-muted">
              {data.provider ? (
                <>
                  <Icon name="check" className="mr-1 inline size-4 text-[#1f8a52]" />
                  {data.provider.name} · {data.provider.model}
                </>
              ) : (
                <span className="font-semibold text-danger">OpenAI isn’t connected: add OPENAI_API_KEY to the server and restart it.</span>
              )}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-3 text-center">
            {[
              ["Chats", data.totals.chats],
              ["Messages", data.totals.messages],
              ["People", data.totals.people],
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-muted p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{k}</dt>
                <dd className="font-serif text-2xl font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-ink-muted">In the last 30 days. Rules version {data.version}.</p>
        </section>

        {/* Who, and how much. */}
        <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5 sm:grid-cols-2">
          <h2 className="font-serif text-xl font-semibold sm:col-span-2">Who can chat, and how much</h2>
          <Field label="Who can chat" hint="Authors only lets you try it before opening it to everyone.">
            <select className={input} value={d.who} onChange={(e) => set("who", e.target.value as MemberChatSettings["who"])}>
              <option value="everyone">Everyone signed in</option>
              <option value="authors">Authors only</option>
            </select>
          </Field>
          <Field label="How long replies are">
            <select className={input} value={d.replyLength} onChange={(e) => set("replyLength", e.target.value as MemberChatSettings["replyLength"])}>
              {(Object.keys(REPLY_LENGTHS) as MemberChatSettings["replyLength"][]).map((k) => (
                <option key={k} value={k}>
                  {REPLY_LENGTHS[k].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Messages in one chat" hint="Between 2 and 30. Then the learner starts a new chat.">
            <input type="number" min={2} max={30} className={input} value={d.turnsPerChat} onChange={(e) => set("turnsPerChat", Number(e.target.value))} />
          </Field>
          <Field label="Messages per person per hour" hint="Between 5 and 200, across all members.">
            <input type="number" min={5} max={200} className={input} value={d.perHour} onChange={(e) => set("perHour", Number(e.target.value))} />
          </Field>
          <Field label="The note under the chat" className="sm:col-span-2">
            <input className={input} maxLength={300} value={d.notice} onChange={(e) => set("notice", e.target.value)} />
          </Field>
        </section>

        {/* Extra instructions, on top of the house rules. */}
        <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
          <h2 className="font-serif text-xl font-semibold">Extra instructions</h2>
          <p className="text-sm text-ink-muted">
            Added after the house rules for every member, for anything you want the chat to do differently. They can add to the rules but can’t switch them off.
          </p>
          <textarea
            className={cx(input, "min-h-40 py-2")}
            maxLength={4000}
            value={d.instructions}
            onChange={(e) => set("instructions", e.target.value)}
            placeholder={
              "For example:\n- If someone asks what to do in a real situation, suggest the Partner Hub topic that covers it.\n- Mention Thursday bowls when chatting as Dot."
            }
          />
          <p className="text-right text-xs text-ink-muted">{d.instructions.length} / 4000</p>
          <details className="rounded-2xl bg-muted p-4 text-sm">
            <summary className="cursor-pointer font-semibold">The house rules (fixed)</summary>
            <p className="mt-2 text-ink-muted">Every chat follows these, whatever the settings. Changing them is a code change, reviewed like any other.</p>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed">{HOUSE_RULES}</pre>
          </details>
        </section>

        {/* Which members take chats. */}
        <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
          <h2 className="font-serif text-xl font-semibold">Who takes chats</h2>
          <p className="text-sm text-ink-muted">Untick anyone who shouldn’t chat yet, for example while their story is being reviewed.</p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.members.map((m) => {
              const on = !d.excluded.includes(m.id);
              return (
                <li key={m.id}>
                  <label
                    className={cx("flex items-center gap-2.5 rounded-2xl border p-2", on ? "border-line bg-bg" : "border-dashed border-line-strong opacity-70")}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-action)]"
                      checked={on}
                      onChange={(e) => set("excluded", e.target.checked ? d.excluded.filter((x) => x !== m.id) : [...d.excluded, m.id])}
                    />
                    <Portrait name={m.name} src={m.portrait} className="size-9 text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{m.name}</span>
                      <span className="block text-xs text-ink-muted">
                        {m.chats} {m.chats === 1 ? "chat" : "chats"} · {m.messages} {m.messages === 1 ? "message" : "messages"}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Exactly what the AI is told. */}
        <section className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
          <h2 className="font-serif text-xl font-semibold">What the AI is told</h2>
          <Field label="Preview for" hint="The saved settings: save first to see a change here.">
            <select className={input} value={previewId} onChange={(e) => setPreviewId(e.target.value)}>
              <option value="">Choose a member…</option>
              {data.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          {preview.data && (
            <pre className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-muted p-4 font-sans text-sm leading-relaxed">
              {`${preview.data.rules}\n\n---\n\n${preview.data.context}`}
            </pre>
          )}
          {preview.error && <ErrorNote text={preview.error} />}
        </section>

        {problem && <ErrorNote text={problem} />}
        {note && (
          <p role="status" className="rounded-2xl bg-tealtint p-3 text-sm">
            {note}
          </p>
        )}
        <div className="sticky bottom-4 flex items-center gap-3 self-start rounded-full bg-surface p-1.5 shadow-lg">
          <button type="button" className={btn.primary} disabled={!changed || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save settings"}
          </button>
          {changed && (
            <button type="button" className={btn.quiet} onClick={() => setDraft(null)} disabled={saving}>
              Undo changes
            </button>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
