"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { Icon } from "./Icon";

/*
  Beside "Enrol in this topic / path": a QR code anyone can point their phone camera at to open it
  straight away, without signing in. Handy for showing a client, or picking up on your own phone.
  The link behind it is made the first time it's shown.
*/

export function PublicQr({ kind, id, className }: { kind: "topic" | "path"; id: string; className?: string }) {
  const [link, setLink] = useState<{ url: string; qr: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    api<{ url: string; qr: string }>("/api/public-link", { body: { kind, id } }).then(
      (r) => live && setLink(r),
      (e: Error) => live && setProblem(e.message),
    );
    return () => {
      live = false;
    };
  }, [kind, id]);

  // A mission or a path with nothing published can't be opened publicly: then there's simply no code.
  if (problem) return null;
  const what = kind === "path" ? "learning path" : "topic";

  return (
    <div className={cx("flex items-center gap-4 rounded-2xl bg-muted p-3 pr-4", className)}>
      <div className="grid size-28 shrink-0 place-items-center overflow-hidden rounded-xl bg-white p-1.5 ring-1 ring-line sm:size-32">
        {link ? (
          // eslint-disable-next-line @next/next/no-img-element -- a generated image from this hub's own QR endpoint
          <img src={link.qr} alt={`QR code that opens this ${what} without signing in`} className="size-full" />
        ) : (
          <span className="size-full animate-pulse rounded-lg bg-muted" aria-hidden />
        )}
      </div>
      <div className="min-w-0 text-sm">
        <p className="flex items-center gap-1.5 font-semibold">
          <Icon name="qr" className="size-4" /> Open it on a phone
        </p>
        <p className="mt-1 text-ink-muted">Point a phone camera at the code to start this {what} straight away. No sign-in needed, and nothing about the person is kept.</p>
        {link && (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link.url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {}
            }}
            className="mt-1.5 inline-flex min-h-9 items-center gap-1.5 font-semibold text-accent hover:underline"
          >
            <Icon name={copied ? "check" : "copy"} className="size-4" /> {copied ? "Link copied" : "Copy the link"}
          </button>
        )}
      </div>
    </div>
  );
}
