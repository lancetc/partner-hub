"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { btn, ErrorNote } from "./ui";
import { Icon } from "../Icon";

/*
  A QR code for a learning path or lesson: scan it with a phone camera to open it. Shows the code
  and link, downloads it (PNG for screens and email, SVG for print), prints a card to hand out,
  and for a path emails the code to everyone assigned to it.
*/

type Info = { url: string; title: string; kind: string; localOnly: boolean; network?: boolean };

export function QrShare({
  kind,
  id,
  assigned,
  className,
}: {
  /** "open": a path's public link, which anyone can open without signing in. */
  kind: "path" | "lesson" | "open";
  id: string;
  /** People assigned to the path, for "Email it to them". */
  assigned?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className ?? btn.secondary} onClick={() => setOpen(true)}>
        <Icon name="qr" className="size-4" /> QR code
      </button>
      {open && <QrDialog kind={kind} id={id} assigned={assigned} onClose={() => setOpen(false)} />}
    </>
  );
}

function QrDialog({ kind, id, assigned, onClose }: { kind: "path" | "lesson" | "open"; id: string; assigned?: number; onClose: () => void }) {
  const q = `${kind}=${encodeURIComponent(id)}`;
  const { data: info, error } = useApi<Info>(`/api/admin/qr?${q}`);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  function printCard() {
    if (!info) return;
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    // A card to print and hand out or pin up: the code, what it opens, and the link for anyone without a camera.
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(info.title)}</title>
<style>
  @page { size: A6; margin: 10mm; }
  body { font-family: Arial, sans-serif; color: #102a43; text-align: center; margin: 0; padding: 24px; }
  .kind { font-size: 11px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: #2d4875; }
  h1 { font-size: 22px; margin: 6px 0 16px; }
  img { width: 62mm; height: 62mm; }
  p { font-size: 13px; margin: 12px 0 4px; }
  .url { font-size: 10px; color: #5b6b7f; word-break: break-all; }
  .brand { margin-top: 18px; font-size: 11px; font-weight: 700; }
</style></head><body>
<div class="kind">${esc(info.kind)}</div><h1>${esc(info.title)}</h1>
<img src="${location.origin}/api/qr?${q}&format=svg" alt="">
<p>Scan with your phone’s camera to start.${kind === "open" ? " No sign in needed." : ""}</p><div class="url">${esc(info.url)}</div>
<div class="brand">Trilogy Care Partner Hub</div>
<script>document.querySelector("img").addEventListener("load", () => { window.print(); });</script>
</body></html>`);
    w.document.close();
  }

  async function email() {
    setSending(true);
    setSendError(null);
    try {
      const r = await api<{ sent: number; notConfigured: number; failed: number; people: number }>(`/api/admin/learning-paths/${id}/qr-email`, { body: {} });
      setSent(
        r.notConfigured
          ? `Email isn’t set up on this hub yet, so nothing was sent to the ${r.people} ${r.people === 1 ? "person" : "people"} assigned. Download or print the code instead.`
          : `Sent to ${r.sent} of ${r.people} ${r.people === 1 ? "person" : "people"}${r.failed ? `; ${r.failed} couldn’t be sent` : ""}.`,
      );
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  // Drawn at the top of the page, so no sticky or clipped container can hide it.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-title"
      className="fixed inset-0 z-50 grid place-items-center bg-[rgb(10_26_46/0.55)] p-4"
      onClick={onClose}
    >
      <div className="w-[min(26rem,100%)] rounded-3xl bg-surface p-5 text-ink shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{info?.kind ?? "QR code"}</p>
            <h2 id="qr-title" className="font-serif text-xl font-semibold leading-snug">
              {info?.title ?? "Loading…"}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-muted">
            <Icon name="close" className="size-5" />
          </button>
        </div>
        {error && <ErrorNote text={error} />}
        {info && (
          <div className="mt-3 flex flex-col gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/qr?${q}&format=svg`}
              alt={`QR code that opens ${info.title}`}
              className="mx-auto size-56 rounded-2xl border border-line bg-white p-2"
            />
            <p className="text-center text-sm text-ink-muted">
              Scan with a phone camera to open it.{kind === "open" && " Anyone with the code can open it, without signing in."}
            </p>
            {info.network && (
              <p className="flex gap-2 rounded-2xl bg-gold/15 p-3 text-sm">
                <Icon name="info" className="mt-0.5 size-4 shrink-0 text-warm" />
                <span>
                  For now this code uses <strong>this computer’s network address</strong> ({new URL(info.url).host}), so it only opens on phones on the same
                  network, while this computer is running the hub. Once the hub has its web address, set HUB_PUBLIC_URL and the code will use it.
                </span>
              </p>
            )}
            {info.localOnly && (
              <p className="flex gap-2 rounded-2xl bg-gold/15 p-3 text-sm">
                <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-warm" />
                <span>
                  This code points to <strong>this computer</strong> ({new URL(info.url).host}), so phones can’t open it yet. Once the hub has its web address,
                  set HUB_PUBLIC_URL and the codes will use it.
                </span>
              </p>
            )}
            <div className="flex items-center gap-2 rounded-xl border border-line-strong p-1 pl-3">
              <span className="min-w-0 flex-1 truncate text-sm">{info.url}</span>
              <button
                type="button"
                className="min-h-9 shrink-0 rounded-lg px-3 text-sm font-semibold text-accent hover:bg-muted"
                onClick={async () => {
                  await navigator.clipboard?.writeText(info.url).catch(() => {});
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a className={btn.secondary} href={`/api/qr?${q}&size=1024&download=1`} download>
                <Icon name="image" className="size-4" /> PNG
              </a>
              <a className={btn.secondary} href={`/api/qr?${q}&format=svg&download=1`} download title="Sharp at any size, for print">
                <Icon name="file" className="size-4" /> SVG
              </a>
              <button type="button" className={btn.secondary} onClick={printCard}>
                <Icon name="doc" className="size-4" /> Print a card
              </button>
            </div>
            {kind === "path" && (
              <div className="border-t border-line pt-3">
                <button type="button" className={cx(btn.primary, "w-full")} onClick={email} disabled={sending || !assigned}>
                  {sending
                    ? "Sending…"
                    : assigned
                      ? `Email it to the ${assigned} ${assigned === 1 ? "person" : "people"} assigned`
                      : "Assign people to email it to them"}
                </button>
                <p className="mt-1.5 text-xs text-ink-muted">
                  Each person gets the code and a link to the path. Pressing again the same day doesn’t send twice.
                </p>
                {sent && (
                  <p role="status" className="mt-2 rounded-xl bg-tealtint p-2.5 text-sm">
                    {sent}
                  </p>
                )}
                {sendError && <ErrorNote text={sendError} />}
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
