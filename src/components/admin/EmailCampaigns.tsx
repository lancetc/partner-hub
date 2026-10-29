"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { renderEmail, type Block, type WebinarCard } from "@/lib/emailTemplate";
import { AdminShell, Badge, btn, ErrorNote, Field, input } from "./ui";
import { Icon, type IconName } from "../Icon";
import { confirmAction } from "@/lib/confirm";

/* Email campaigns (EDM): the monthly update and the quarterly newsletter. */

type Kind = "monthly" | "quarterly" | "one_off";
type Group = "partner" | "coordinator";
type Status = "draft" | "scheduled" | "sending" | "sent" | "cancelled";
type ListData = {
  plan: { kind: "monthly" | "quarterly"; label: string; due: string; campaignId: string | null; status: Status | null }[];
  campaigns: {
    id: string;
    kind: Kind;
    kindLabel: string;
    name: string;
    subject: string;
    status: Status;
    sendAt: string | null;
    sentAt: string | null;
    recipients: number;
    stats: Record<string, number>;
  }[];
  unsubscribed: number;
  provider: boolean;
};
type Detail = {
  id: string;
  kind: Kind;
  kindLabel: string;
  name: string;
  subject: string;
  preheader: string;
  blocks: Block[];
  audience: Group[];
  status: Status;
  send_at: string | null;
  sent_at: string | null;
  recipients: number;
  stats: Record<string, number>;
  catalogue: { stories: { slug: string; title: string }[]; lessons: { slug: string; title: string }[]; webinars: { id: string; title: string }[] };
  provider: boolean;
};

const STATUS: Record<Status, { label: string; tone: "neutral" | "good" | "warn" | "info" | "bad" }> = {
  draft: { label: "Draft", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "info" },
  sending: { label: "Sending", tone: "warn" },
  sent: { label: "Sent", tone: "good" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Brisbane",
  }).format(new Date(iso));

function ProviderNote({ on }: { on: boolean }) {
  if (on) return null;
  return (
    <p className="flex items-start gap-2 rounded-2xl border-2 border-dashed border-gold p-3 text-sm">
      <Icon name="info" className="mt-0.5 size-4 shrink-0" />
      <span>
        <strong>No email provider is connected,</strong> so sends are recorded as previews and nothing leaves the hub. Set <code>EMAIL_WEBHOOK_URL</code> to
        send for real.
      </span>
    </p>
  );
}

export function CampaignList() {
  const { data, error } = useApi<ListData>("/api/admin/campaigns");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function create(kind: Kind) {
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/api/admin/campaigns", { body: { kind } });
      router.push(`/admin/email/${r.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <AdminShell title="Email campaigns">
      <p className="max-w-3xl text-ink-muted">
        A monthly update and a quarterly newsletter to service partners and coordinators. Each is built from blocks, filled with the latest news, topics and
        webinars, and includes an unsubscribe link.
      </p>
      {(error || err) && (
        <div className="mt-4">
          <ErrorNote text={(error || err)!} />
        </div>
      )}
      {!data ? (
        <p className="mt-6 text-ink-muted">Loading…</p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          <ProviderNote on={data.provider} />
          <section aria-label="Plan" className="grid gap-4 md:grid-cols-2">
            {data.plan.map((p) => (
              <div key={p.kind} className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
                <div className="flex items-center gap-2">
                  <span className="grid size-10 place-items-center rounded-full bg-tealtint text-accent">
                    <Icon name={p.kind === "monthly" ? "news" : "book"} className="size-5" />
                  </span>
                  <div>
                    <h2 className="font-serif text-xl font-semibold">{p.label}</h2>
                    <p className="text-sm text-ink-muted">{p.kind === "monthly" ? "First Tuesday of each month" : "First Tuesday of Jan, Apr, Jul and Oct"}</p>
                  </div>
                </div>
                <p>
                  Next due <strong>{when(p.due)}</strong>
                  {p.status && <span className="ml-2 align-middle">{<Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>}</span>}
                </p>
                {p.campaignId ? (
                  <Link href={`/admin/email/${p.campaignId}`} className={cx(btn.secondary, "self-start")}>
                    Open it <Icon name="arrow-right" className="size-4" />
                  </Link>
                ) : (
                  <button type="button" className={cx(btn.primary, "self-start")} disabled={busy} onClick={() => create(p.kind)}>
                    <Icon name="plus" className="size-4" /> Start the {p.kind === "monthly" ? "monthly update" : "quarterly newsletter"}
                  </button>
                )}
              </div>
            ))}
          </section>

          <section aria-labelledby="all">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="all" className="font-mulish text-sm font-extrabold uppercase tracking-[0.14em]">
                All campaigns
              </h2>
              <button type="button" className={btn.quiet} disabled={busy} onClick={() => create("one_off")}>
                <Icon name="plus" className="size-4" /> One-off email
              </button>
            </div>
            {!data.campaigns.length ? (
              <p className="rounded-3xl border border-dashed border-line-strong p-6 text-center text-ink-muted">No campaigns yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line rounded-3xl border border-line bg-surface">
                {data.campaigns.map((c) => (
                  <li key={c.id} className="relative flex flex-wrap items-center gap-3 p-4 hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/email/${c.id}`} className="font-semibold after:absolute after:inset-0 after:content-[''] hover:underline">
                          {c.name}
                        </Link>
                        <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                      </p>
                      <p className="truncate text-sm text-ink-muted">{c.subject}</p>
                    </div>
                    <p className="text-sm text-ink-muted">
                      {c.status === "sent" && c.sentAt
                        ? `Sent ${when(c.sentAt)} · ${Object.values(c.stats).reduce((a, b) => a + b, 0)} people${c.stats.not_configured ? " (previews)" : ""}`
                        : c.sendAt
                          ? `${c.status === "scheduled" ? "Sends" : "Planned for"} ${when(c.sendAt)} · ${c.recipients} people`
                          : `${c.recipients} people`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {data.unsubscribed > 0 && (
              <p className="mt-2 text-sm text-ink-muted">{data.unsubscribed} people have unsubscribed from newsletters and are left out automatically.</p>
            )}
          </section>
        </div>
      )}
    </AdminShell>
  );
}

const BLOCKS: { type: Block["type"]; label: string; icon: IconName }[] = [
  { type: "heading", label: "Heading", icon: "doc" },
  { type: "text", label: "Text", icon: "list" },
  { type: "story", label: "News story", icon: "news" },
  { type: "lesson", label: "Topic", icon: "book" },
  { type: "webinar", label: "Webinar", icon: "play" },
  { type: "button", label: "Button", icon: "arrow-right" },
  { type: "image", label: "Image", icon: "image" },
  { type: "divider", label: "Divider", icon: "minus" },
];

export function CampaignEditor({ id }: { id: string }) {
  const { data, error, reload } = useApi<Detail>(`/api/admin/campaigns/${id}`);
  if (error || !data)
    return (
      <AdminShell title="Email campaign" back={{ href: "/admin/email", label: "Email campaigns" }}>
        {error ? <ErrorNote text={error} /> : <p className="text-ink-muted">Loading…</p>}
      </AdminShell>
    );
  return <Editor key={`${data.id}:${data.status}`} detail={data} reload={reload} />;
}

function Editor({ detail: d, reload }: { detail: Detail; reload: () => void }) {
  const router = useRouter();
  const locked = d.status === "sent" || d.status === "sending";
  const [name, setName] = useState(d.name);
  const [subject, setSubject] = useState(d.subject);
  const [preheader, setPreheader] = useState(d.preheader);
  const [audience, setAudience] = useState<Group[]>(d.audience);
  const [blocks, setBlocks] = useState<Block[]>(d.blocks);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  const [width, setWidth] = useState<"phone" | "desktop">("phone");
  const [sendAt, setSendAt] = useState(() => {
    const at = d.send_at ? new Date(d.send_at) : new Date(Date.now() + 86400000);
    const local = new Date(at.getTime() - at.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  });

  const change = (fn: () => void) => {
    fn();
    setDirty(true);
    setNote(null);
  };
  const setBlock = (i: number, patch: Partial<Block>) => change(() => setBlocks((bs) => bs.map((b, j) => (j === i ? ({ ...b, ...patch } as Block) : b))));
  const move = (i: number, by: number) =>
    change(() =>
      setBlocks((bs) => {
        const n = [...bs];
        [n[i], n[i + by]] = [n[i + by], n[i]];
        return n;
      }),
    );
  const add = (type: Block["type"]) => {
    let n = blocks.length + 1;
    while (blocks.some((b) => b.id === `b${n}`)) n++;
    const id = `b${n}`;
    const c = d.catalogue;
    const b: Block =
      type === "heading"
        ? { id, type, text: "" }
        : type === "text"
          ? { id, type, text: "" }
          : type === "story"
            ? { id, type, slug: c.stories[0]?.slug ?? "" }
            : type === "lesson"
              ? { id, type, slug: c.lessons[0]?.slug ?? "" }
              : type === "webinar"
                ? { id, type, webinarId: c.webinars[0]?.id ?? "" }
                : type === "button"
                  ? { id, type, label: "Open the Partner Hub", url: "/" }
                  : type === "image"
                    ? { id, type, src: "/images/team.jpeg", alt: "" }
                    : { id, type: "divider" };
    change(() => setBlocks((bs) => [...bs, b]));
  };

  // The preview uses the same template as the real send, with your name in it.
  const preview = useMemo(() => {
    const webinars = new Map<string, WebinarCard>(
      d.catalogue.webinars.map((w) => [w.id, { id: w.id, title: w.title, summary: "", presenter: "", minutes: 0, thumbnail: "/images/presenter-intro.jpg" }]),
    );
    return renderEmail(
      { subject, preheader, blocks },
      { firstName: "Jordan", baseUrl: typeof window === "undefined" ? "" : window.location.origin, unsubscribeUrl: "#unsubscribe", webinars },
    ).html;
  }, [subject, preheader, blocks, d.catalogue.webinars]);

  async function run(fn: () => Promise<unknown>, ok?: string, after?: () => void) {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      if (ok) setNote({ text: ok, tone: "ok" });
      after?.();
    } catch (e) {
      setNote({ text: (e as Error).message, tone: "bad" });
    } finally {
      setBusy(false);
    }
  }
  const save = () => api(`/api/admin/campaigns/${d.id}`, { method: "PUT", body: { name, subject, preheader, blocks, audience } }).then(() => setDirty(false));

  return (
    <AdminShell title={name || "Email campaign"} back={{ href: "/admin/email", label: "Email campaigns" }}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">{d.kindLabel}</Badge>
        <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
        {d.status === "scheduled" && d.send_at && <span className="text-sm text-ink-muted">Sends {when(d.send_at)}</span>}
        {d.status === "sent" && d.sent_at && (
          <span className="text-sm text-ink-muted">
            Sent {when(d.sent_at)} ·{" "}
            {Object.entries(d.stats)
              .map(([k, v]) => `${v} ${k === "accepted" ? "accepted by the provider" : k === "not_configured" ? "kept as previews" : k}`)
              .join(", ")}
          </span>
        )}
      </div>
      <div className="mt-3">
        <ProviderNote on={d.provider} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <fieldset disabled={locked || busy} className="flex min-w-0 flex-col gap-5">
          <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5">
            <Field label="Campaign name" hint="Only you see this.">
              <input className={input} value={name} onChange={(e) => change(() => setName(e.target.value))} />
            </Field>
            <Field label="Subject line">
              <input className={input} value={subject} maxLength={150} onChange={(e) => change(() => setSubject(e.target.value))} />
            </Field>
            <Field label="Preview text" hint="Shown after the subject in most inboxes.">
              <input className={input} value={preheader} maxLength={200} onChange={(e) => change(() => setPreheader(e.target.value))} />
            </Field>
            <fieldset>
              <legend className="text-sm font-semibold">Send to</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {(["partner", "coordinator"] as const).map((g) => (
                  <label
                    key={g}
                    className={cx(
                      "flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4",
                      audience.includes(g) ? "border-action bg-tealtint" : "border-line-strong",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--action)]"
                      checked={audience.includes(g)}
                      onChange={(e) => change(() => setAudience(e.target.checked ? [...audience, g] : audience.filter((x) => x !== g)))}
                    />
                    {g === "partner" ? "Service partners" : "Care coordinators"}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {dirty ? "Save to update the count." : `${d.recipients} people, not counting anyone who has unsubscribed.`}
              </p>
            </fieldset>
          </section>

          <section className="rounded-3xl border border-line bg-surface p-5">
            <h2 className="mb-3 font-serif text-xl font-semibold">Content</h2>
            <p className="mb-3 text-sm text-ink-muted">
              Use <code>{"{{first_name}}"}</code> in text to greet each person by name.
            </p>
            <ol className="flex flex-col gap-3">
              {blocks.map((b, i) => {
                const meta = BLOCKS.find((x) => x.type === b.type)!;
                return (
                  <li key={b.id} className="rounded-2xl border border-line p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Icon name={meta.icon} className="size-4 text-accent" />
                      <span className="text-sm font-semibold">{meta.label}</span>
                      <span className="ml-auto flex gap-0.5">
                        <button type="button" className={btn.quiet} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                          <Icon name="arrow-left" className="size-4 rotate-90" />
                        </button>
                        <button type="button" className={btn.quiet} disabled={i === blocks.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                          <Icon name="arrow-right" className="size-4 rotate-90" />
                        </button>
                        <button
                          type="button"
                          className={btn.quiet}
                          onClick={() => change(() => setBlocks(blocks.filter((_, j) => j !== i)))}
                          aria-label="Remove"
                        >
                          <Icon name="trash" className="size-4" />
                        </button>
                      </span>
                    </div>
                    {b.type === "heading" && (
                      <input className={input} value={b.text} placeholder="Heading" onChange={(e) => setBlock(i, { text: e.target.value })} />
                    )}
                    {b.type === "text" && (
                      <textarea
                        rows={4}
                        className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2"
                        value={b.text}
                        placeholder="Write a paragraph. Leave a blank line between paragraphs."
                        onChange={(e) => setBlock(i, { text: e.target.value })}
                      />
                    )}
                    {b.type === "story" && (
                      <select className={input} value={b.slug} onChange={(e) => setBlock(i, { slug: e.target.value })} aria-label="News story">
                        {d.catalogue.stories.map((s) => (
                          <option key={s.slug} value={s.slug}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                    )}
                    {b.type === "lesson" && (
                      <select className={input} value={b.slug} onChange={(e) => setBlock(i, { slug: e.target.value })} aria-label="Topic">
                        {d.catalogue.lessons.map((l) => (
                          <option key={l.slug} value={l.slug}>
                            {l.title}
                          </option>
                        ))}
                      </select>
                    )}
                    {b.type === "webinar" &&
                      (d.catalogue.webinars.length ? (
                        <select className={input} value={b.webinarId} onChange={(e) => setBlock(i, { webinarId: e.target.value })} aria-label="Webinar">
                          {d.catalogue.webinars.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.title}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-sm text-ink-muted">Publish a webinar first.</p>
                      ))}
                    {b.type === "button" && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input className={input} value={b.label} placeholder="Button text" onChange={(e) => setBlock(i, { label: e.target.value })} />
                        <input className={input} value={b.url} placeholder="/learning or https://…" onChange={(e) => setBlock(i, { url: e.target.value })} />
                      </div>
                    )}
                    {b.type === "image" && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input className={input} value={b.src} placeholder="/images/… or https://…" onChange={(e) => setBlock(i, { src: e.target.value })} />
                        <input className={input} value={b.alt} placeholder="Describe the image" onChange={(e) => setBlock(i, { alt: e.target.value })} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-4">
              {BLOCKS.map((b) => (
                <button key={b.type} type="button" className={cx(btn.secondary, "min-h-9 px-3 text-sm")} onClick={() => add(b.type)}>
                  <Icon name="plus" className="size-3.5" /> {b.label}
                </button>
              ))}
            </div>
          </section>
        </fieldset>

        <aside className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-24 xl:self-start">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Preview</p>
            <div className="flex gap-1" role="group" aria-label="Preview width">
              {(["phone", "desktop"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={width === w}
                  onClick={() => setWidth(w)}
                  className={cx("min-h-9 rounded-full px-3 text-sm", width === w ? "bg-action text-on-action" : "hover:bg-muted")}
                >
                  {w === "phone" ? "Phone" : "Desktop"}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line bg-[#eef4f9]">
            <div className="border-b border-line bg-surface px-4 py-2 text-sm">
              <p className="font-semibold">{subject || "No subject"}</p>
              <p className="truncate text-ink-muted">{preheader}</p>
            </div>
            <iframe
              title="Email preview"
              srcDoc={preview}
              sandbox=""
              className={cx("mx-auto block h-[42rem] border-0 bg-[#eef4f9]", width === "phone" ? "w-[375px] max-w-full" : "w-full")}
            />
          </div>

          {!locked && (
            <div className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-4">
              {note && (
                <p role="status" className={cx("rounded-xl p-2 text-sm", note.tone === "ok" ? "bg-tealtint" : "bg-orange/10")}>
                  {note.text}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btn.primary} disabled={busy || !dirty} onClick={() => run(save, "Saved.", reload)}>
                  {dirty ? "Save" : "Saved"}
                </button>
                <button
                  type="button"
                  className={btn.secondary}
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      if (dirty) await save();
                      const r = await api<{ status: string; to: string; error: string | null }>(`/api/admin/campaigns/${d.id}`, { body: { action: "test" } });
                      if (r.status !== "accepted") throw new Error(`Test kept as a preview: ${r.error ?? r.status}`);
                    }, "Test sent to your email.")
                  }
                >
                  Send me a test
                </button>
              </div>
              <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
                {d.status === "scheduled" ? (
                  <button
                    type="button"
                    className={btn.secondary}
                    disabled={busy}
                    onClick={() => run(() => api(`/api/admin/campaigns/${d.id}`, { body: { action: "unschedule" } }), "Back to draft.", reload)}
                  >
                    Unschedule
                  </button>
                ) : (
                  <>
                    <Field label="Send on">
                      <input type="datetime-local" className={input} value={sendAt} onChange={(e) => setSendAt(e.target.value)} />
                    </Field>
                    <button
                      type="button"
                      className={btn.secondary}
                      disabled={busy}
                      onClick={() =>
                        run(
                          async () => {
                            if (dirty) await save();
                            await api(`/api/admin/campaigns/${d.id}`, { body: { action: "schedule", sendAt: new Date(sendAt).toISOString() } });
                          },
                          "Scheduled.",
                          reload,
                        )
                      }
                    >
                      <Icon name="clock" className="size-4" /> Schedule
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className={cx(btn.primary, "ml-auto")}
                  disabled={busy}
                  onClick={async () => {
                    if (!(await confirmAction(`“${subject}” goes to ${d.recipients} people now.`, { title: "Send now?", confirmLabel: "Send now" }))) return;
                    run(
                      async () => {
                        if (dirty) await save();
                        await api(`/api/admin/campaigns/${d.id}`, { body: { action: "send" } });
                      },
                      "Sent.",
                      reload,
                    );
                  }}
                >
                  Send now
                </button>
              </div>
              {d.status === "draft" && (
                <button
                  type="button"
                  className={cx(btn.quiet, "self-start")}
                  disabled={busy}
                  onClick={async () =>
                    (await confirmAction("This draft is deleted for good.", { title: "Delete this draft?", confirmLabel: "Delete", danger: true })) &&
                    run(
                      () => api(`/api/admin/campaigns/${d.id}`, { method: "DELETE" }),
                      undefined,
                      () => router.push("/admin/email"),
                    )
                  }
                >
                  <Icon name="trash" className="size-4" /> Delete draft
                </button>
              )}
            </div>
          )}
          {locked && (
            <p className="text-sm text-ink-muted">This campaign has gone out, so it can’t be changed. Start a new one from the Email campaigns page.</p>
          )}
          <p className="text-xs text-ink-muted">
            Every email says who it’s from and has a one-click unsubscribe link. Unsubscribed people are always left out.
          </p>
        </aside>
      </div>
    </AdminShell>
  );
}
