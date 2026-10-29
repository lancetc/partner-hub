"use client";

import Link from "next/link";
import { formatDate, formatDuration } from "@/lib/format";
import { Icon } from "./Icon";
import "./certificate.css";

/*
  A certificate of completion for a learning path. It prints on one landscape A4 page with
  nothing else from the site, so "Save as PDF" in the print dialog gives a clean file.
*/
export function Certificate({
  pathId,
  pathName,
  person,
  completedAt,
  lessons,
  minutes,
  outcomes,
  reference,
}: {
  pathId: string;
  pathName: string;
  person: string;
  completedAt: string;
  lessons: number;
  minutes: number;
  outcomes: string[];
  reference: string;
}) {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <div className="certificate-controls mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/paths/${encodeURIComponent(pathId)}`} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-accent hover:underline">
          <Icon name="arrow-left" className="size-4" /> Back to the path
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-muted">Choose “Save as PDF” in the print window to keep a copy.</p>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
          >
            <Icon name="doc" className="size-4" /> Print or save as PDF
          </button>
        </div>
      </div>

      <article id="certificate" aria-label={`Certificate of completion: ${pathName}`} className="certificate">
        <div className="certificate-inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/trilogy-logo.svg" alt="Trilogy Care" className="certificate-logo" />
          <p className="certificate-kicker">Certificate of completion</p>
          <p className="certificate-lead">This is to certify that</p>
          <p className="certificate-name">{person}</p>
          <p className="certificate-lead">has completed the learning path</p>
          <p className="certificate-path">{pathName}</p>
          <p className="certificate-meta">
            {lessons} topics · {formatDuration(minutes).replace(/^About/, "about")} of learning · completed {formatDate(completedAt)}
          </p>
          {outcomes.length > 0 && (
            <ul className="certificate-outcomes">
              {outcomes.slice(0, 6).map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          )}
          <div className="certificate-foot">
            <span>Trilogy Care Partner Hub</span>
            <span>Reference {reference}</span>
          </div>
        </div>
      </article>
    </div>
  );
}
