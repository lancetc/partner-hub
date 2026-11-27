"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { REFERRER_ROLES, ROLE_ORDER, STAGE_ORDER, STAGES, type Stage } from "@/lib/referralStudio";
import { buildKit, cleanKitFields, FREE_FIELDS, NOT_SENT, plain, type KitFields, type KitLine } from "@/lib/referralKit";
import type { StudioHome } from "@/server/referralStudio";
import { newKey } from "./practiceDriver";
import { Icon } from "../Icon";

/*
  The approved outreach kit (docs/local-referral-studio.md, PRD section 9): pick the referrer and stage, fill only the
  restricted fields, and preview the co-branded one-pager, the pitch card and three email drafts. Locked text comes from
  the template and the claim register; fields you fill are marked. Everything is "Draft — review required" until the
  template and every claim it uses are approved. Printing or copying records use, never sending.
*/

type Home = Extract<StudioHome, { kit: unknown }>;
type Asset = Home["assets"][number];

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const field = "min-h-11 w-full rounded-xl border border-line-strong bg-bg px-3 py-2 text-base";
const kicker = "font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent";
const badTone = "rounded-2xl bg-[#fde2e0] p-4 text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]";
const warnTone = "rounded-2xl bg-[#fff1cc] p-4 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const goodTone = "rounded-2xl bg-[#e3f4ea] p-4 text-[#0f5b3a] dark:bg-[#12392a] dark:text-[#8fe0b5]";

/** Copies text: the Clipboard API where the page is secure, otherwise a hidden field and the browser’s copy command. */
async function copyText(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const t = document.createElement("textarea");
  t.value = text;
  t.setAttribute("readonly", "");
  t.style.position = "fixed";
  t.style.opacity = "0";
  document.body.appendChild(t);
  t.select();
  const ok = document.execCommand("copy");
  t.remove();
  if (!ok) throw new Error("Copying isn’t available in this browser. Select the draft and copy it yourself.");
}

/** Prints the one-pager alone, with the Hub's print rule for a sheet (globals.css). */
function printSheet() {
  document.body.classList.add("printing-growth-sheet");
  const done = () => {
    document.body.classList.remove("printing-growth-sheet");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

function Lines({ lines }: { lines: KitLine[] }) {
  return (
    <>
      {lines.map((l, i) =>
        l.locked ? (
          <span key={i}>{l.text}</span>
        ) : (
          <mark
            key={i}
            className="rounded bg-[#e6f4f4] px-0.5 text-inherit underline decoration-dotted underline-offset-2 dark:bg-[#123a3a]"
            title="A field you filled in"
          >
            {l.text}
          </mark>
        ),
      )}
    </>
  );
}

export function OutreachKit({ home, initial, onSaved }: { home: Home; initial?: Partial<KitFields>; onSaved: (a: Asset) => void }) {
  const t = home.kit.template;
  const [f, setF] = useState<KitFields>(() =>
    cleanKitFields({ serviceArea: t.serviceAreas[0]?.id, contactRoute: t.contactRoutes[0]?.id, audience: "gp", stage: "unknown", ...initial }),
  );
  const [saved, setSaved] = useState<{ key: string; asset: Asset } | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<number[]>([]);
  const kit = useMemo(() => buildKit(t, home.kit.register, f, { businessName: home.kit.businessName, today: home.kit.today }), [t, home.kit, f]);
  const fieldsKey = JSON.stringify(f);
  const set = (patch: Partial<KitFields>) => {
    setF((x) => ({ ...x, ...patch }));
    setMsg("");
  };

  /** Saves this draft once (idempotent), so a print or a copy is recorded against the version that was used. */
  const ensureSaved = async (kind: "kit" | "pitchcard") => {
    if (saved && saved.key === `${kind}:${fieldsKey}`) return saved.asset;
    const r = await api<{ asset: Asset }>("/api/tools/referral-studio", { body: { action: "asset", idem: newKey("kit"), kind, fields: f } });
    setSaved({ key: `${kind}:${fieldsKey}`, asset: r.asset });
    onSaved(r.asset);
    return r.asset;
  };
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setError("");
    try {
      setMsg(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t work. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const blocked = kit.problems.length > 0 || kit.status === "blocked";

  return (
    <div className="space-y-5">
      <div className={kit.status === "approved" ? goodTone : kit.status === "blocked" ? badTone : warnTone} role="status">
        <p className="font-semibold">
          {kit.status === "approved" ? "Approved for use" : kit.status === "blocked" ? "Blocked: a claim it needs isn’t current" : kit.mark}
        </p>
        {kit.reasons.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {kit.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-sm">{NOT_SENT}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <form className="min-w-0 space-y-3" onSubmit={(e) => e.preventDefault()} aria-label="Personalise the kit">
          <p className={kicker}>Only these can change</p>
          <label className="block">
            <span className="font-semibold">Referrer</span>
            <select className={cx(field, "mt-1")} value={f.audience} onChange={(e) => set({ audience: e.target.value as KitFields["audience"] })}>
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {REFERRER_ROLES[r].label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-semibold">The older person’s stage</span>
            <select className={cx(field, "mt-1")} value={f.stage} onChange={(e) => set({ stage: e.target.value as Stage })}>
              {STAGE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STAGES[s]}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-sm text-ink-muted">{kit.next.step}</span>
          </label>
          <label className="block">
            <span className="font-semibold">Your verified service area</span>
            <select className={cx(field, "mt-1")} value={f.serviceArea} onChange={(e) => set({ serviceArea: e.target.value })}>
              {t.serviceAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-semibold">Approved contact route</span>
            <select className={cx(field, "mt-1")} value={f.contactRoute} onChange={(e) => set({ contactRoute: e.target.value })}>
              {t.contactRoutes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          {(["introduction", "recipient", "meeting", "commitment"] as const).map((k) => (
            <label key={k} className="block">
              <span className="font-semibold">{FREE_FIELDS[k].label}</span>
              <input className={cx(field, "mt-1")} value={f[k]} maxLength={FREE_FIELDS[k].max + 20} onChange={(e) => set({ [k]: e.target.value })} />
              <span className="block text-xs text-ink-muted">
                {f[k].length} of {FREE_FIELDS[k].max}
                {k !== "introduction" ? " · stays a placeholder until you fill it in" : " · one sentence, no claims"}
              </span>
            </label>
          ))}
          <label className="block">
            <span className="font-semibold">A reviewed practical example (optional)</span>
            <select className={cx(field, "mt-1")} value={f.example} onChange={(e) => set({ example: e.target.value })}>
              <option value="">None</option>
              {t.examples.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.text.slice(0, 70)}…
                </option>
              ))}
            </select>
          </label>
          {kit.problems.length > 0 && (
            <ul className={cx(badTone, "list-disc space-y-1 pl-8 text-sm")} role="alert">
              {kit.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </form>

        <div className="min-w-0 space-y-5">
          <p className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
            <span className="inline-flex items-center gap-1">
              <Icon name="lock" className="size-4" /> Locked: approved wording
            </span>
            <mark className="rounded bg-[#e6f4f4] px-1 text-inherit underline decoration-dotted dark:bg-[#123a3a]">Your field</mark>
          </p>
          <article
            className={cx(box, "growth-sheet mx-auto max-w-[210mm] bg-white text-[#102a43] dark:bg-white dark:text-[#102a43]")}
            aria-label="One-pager preview"
          >
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#b3261e]">{kit.mark}</p>
            <h3 className="mt-1 font-serif text-2xl font-semibold leading-snug">
              <Lines lines={kit.onePager.title} />
            </h3>
            {kit.onePager.sections.map((s) => (
              <section key={s.id} className="mt-3">
                <h4 className="font-semibold">{s.heading}</h4>
                <p className="text-base leading-relaxed">
                  <Lines lines={s.lines} />
                </p>
              </section>
            ))}
            <section className="mt-3 rounded-xl bg-[#f1f6f9] p-3">
              <h4 className="font-semibold">What to do next</h4>
              <p>
                <Lines lines={kit.onePager.cta} />
              </p>
              {kit.onePager.handoff.length > 0 && (
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-base">
                  {kit.onePager.handoff.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ol>
              )}
            </section>
            <section className="mt-3">
              <h4 className="font-semibold">Contact</h4>
              <p>
                <Lines lines={kit.onePager.contact} />
              </p>
            </section>
            <footer className="mt-4 border-t border-[#c9d6df] pt-2 text-xs text-[#486581]">
              {kit.onePager.footer.map((x) => (
                <p key={x}>{x}</p>
              ))}
            </footer>
          </article>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primary}
              disabled={busy || blocked}
              onClick={() =>
                void run(async () => {
                  const a = await ensureSaved("kit");
                  await api("/api/tools/referral-studio", { body: { action: "asset-event", assetId: a.id, event: "downloaded" } });
                  printSheet();
                  return "Opened the print dialog: choose “Save as PDF” for an A4 file. Nothing has been sent.";
                })
              }
            >
              <Icon name="print" className="size-4" /> Print or save as PDF
            </button>
            <button
              type="button"
              className={secondary}
              disabled={busy || blocked}
              onClick={() => void run(async () => (await ensureSaved("kit"), "Saved as a draft for your business."))}
            >
              <Icon name="bookmark" className="size-4" /> Save this draft
            </button>
          </div>

          <section className={box} aria-labelledby="card-h">
            <h3 id="card-h" className="font-serif text-lg font-semibold">
              My pitch card
            </h3>
            <p className="text-sm text-ink-muted">Short enough to read before you walk into a meeting.</p>
            <dl className="mt-2 space-y-2">
              <div>
                <dt className="font-semibold">Who</dt>
                <dd>{kit.pitchCard.persona}</dd>
              </div>
              <div>
                <dt className="font-semibold">Your opening</dt>
                <dd>
                  <Lines lines={kit.pitchCard.script} />
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Likely objection</dt>
                <dd>{kit.pitchCard.objection}</dd>
              </div>
              <div>
                <dt className="font-semibold">Approved answer</dt>
                <dd>
                  <Lines lines={kit.pitchCard.answer} />
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Next step</dt>
                <dd>
                  {kit.pitchCard.next} Contact: {kit.pitchCard.contact}.
                </dd>
              </div>
            </dl>
            <button
              type="button"
              className={cx(secondary, "mt-3")}
              disabled={busy || blocked}
              onClick={() =>
                void run(async () => {
                  const a = await ensureSaved("pitchcard");
                  await api("/api/tools/referral-studio", { body: { action: "card", assetId: a.id, pin: true } });
                  return "Saved to your Favourites and pinned. It loses its “current” label if a claim it uses changes.";
                })
              }
            >
              <Icon name="bookmark-filled" className="size-4" /> Save and pin to Favourites
            </button>
          </section>

          <section aria-labelledby="emails-h" className="space-y-3">
            <h3 id="emails-h" className="font-serif text-lg font-semibold">
              Three follow-up email drafts
            </h3>
            <p className="text-sm">A relationship sequence, not a mass send. You send them yourself, from your own business, if and when it’s right.</p>
            <fieldset className={box}>
              <legend className="font-semibold">Before you send any of them</legend>
              {kit.checklist.map((c, i) => (
                <label key={c} className="flex min-h-11 items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-5 shrink-0"
                    checked={checks.includes(i)}
                    onChange={(e) => setChecks(e.target.checked ? [...checks, i] : checks.filter((x) => x !== i))}
                  />
                  <span>{c}</span>
                </label>
              ))}
            </fieldset>
            {kit.emails.map((e) => (
              <div key={e.id} className={box}>
                <p className={kicker}>{e.label}</p>
                <p className="mt-1">
                  <span className="font-semibold">Subject:</span> {e.subject}
                </p>
                <p className="mt-2 whitespace-pre-line break-words text-base">
                  <Lines lines={e.body} />
                </p>
                <button
                  type="button"
                  className={cx(secondary, "mt-2")}
                  disabled={busy || blocked}
                  onClick={() =>
                    void run(async () => {
                      const a = await ensureSaved("kit");
                      await copyText(`Subject: ${e.subject}\n\n${plain(e.body)}`);
                      await api("/api/tools/referral-studio", { body: { action: "asset-event", assetId: a.id, event: "copied", part: e.id } });
                      return `Copied “${e.label}”. Nothing has been sent.`;
                    })
                  }
                >
                  <Icon name="copy" className="size-4" /> Copy this draft
                </button>
              </div>
            ))}
          </section>
          {msg && (
            <p className={goodTone} role="status">
              {msg}
            </p>
          )}
          {error && (
            <p className={badTone} role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
