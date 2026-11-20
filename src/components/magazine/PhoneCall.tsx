"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { ACTION_KINDS, ENDINGS, PHONE_NOTICE, SIMULATED, URGENT_TEXT, type PhoneCase, type PhoneResult, type PhoneToolsView } from "@/lib/phonecall";
import { MAX_REPLY, type TurnResult } from "@/lib/roleplay";
import { Icon } from "../Icon";

/*
  The phone-specific parts of a Tough Phone Call (docs/tough-phone-call.md), used by the shared roleplay screen:
  the case tools beside the call, and the debrief. Every rating is in words as well as a number, nothing relies
  on colour, and every highlight quotes the learner's own corrected words.
*/

const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60";
const box = "rounded-2xl bg-bg p-4 ring-1 ring-line";
const warn = "rounded-2xl bg-[#fff1cc] p-4 text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]";
const urgentTone = "rounded-2xl bg-[#fde2e0] p-4 text-[#5c1410] dark:bg-[#3d1512] dark:text-[#ffb4ab]";
const showDate = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`))
    : "";

/** Before the call: who's calling, about whom, and how long it takes. */
export function PhoneBrief({ phone }: { phone: PhoneCase }) {
  return (
    <>
      <p className="mt-1">
        <span className="font-semibold">On the line:</span> {phone.claims}. The call is about {phone.client}.
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        About {phone.minutes} minutes. {PHONE_NOTICE}
      </p>
    </>
  );
}

/** The case tools beside the call: who the caller is cleared for, the lookups and what each revealed, and the policy pack. */
export function CaseTools({
  phone,
  view,
  busy,
  finished,
  onLookup,
}: {
  phone: PhoneCase;
  view: PhoneToolsView;
  busy: boolean;
  finished: boolean;
  onLookup: (id: string) => void;
}) {
  const ids = useId();
  return (
    <aside aria-label="Case tools" className="flex flex-col gap-3">
      {view.urgent && (
        <div role="alert" className={urgentTone}>
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="alert" className="size-4" /> Immediate wellbeing check
          </p>
          <p className="mt-1 text-sm">{URGENT_TEXT}</p>
        </div>
      )}
      <div className={box}>
        <p className="font-semibold">Caller</p>
        <p className="text-sm">{phone.claims}</p>
        <p className="mt-1 text-sm">
          <span className="font-semibold">What they may be told: </span>
          {view.permission ? view.permission.label : "Not checked yet"}
        </p>
        {view.permission && <p className="mt-1 text-sm text-ink-muted">{view.permission.detail}</p>}
      </div>
      <div className={box}>
        <p className="font-semibold" id={`${ids}-tools`}>
          Case tools
        </p>
        <p className="text-xs text-ink-muted">Simulated lookups, between your replies. Nothing real is opened or changed.</p>
        <ul aria-labelledby={`${ids}-tools`} className="mt-2 flex flex-col gap-2">
          {view.actions.map((a) => (
            <li key={a.id}>
              {a.done ? (
                <div className={cx("rounded-xl p-3 text-sm", a.kind === "escalate" ? "bg-[#fde2e0] dark:bg-[#3d1512]" : "bg-muted")}>
                  <p className="flex items-center gap-1.5 font-semibold">
                    <Icon name="check" className="size-4" /> {a.label}
                  </p>
                  <ul className="mt-1 list-disc pl-5">
                    {a.facts.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <button
                  type="button"
                  className={cx(secondary, "w-full justify-start text-left text-sm", a.kind === "escalate" && "border-[#b3261e] text-[#b3261e]")}
                  disabled={busy || finished}
                  onClick={() => onLookup(a.id)}
                >
                  <Icon
                    name={a.kind === "permission" ? "lock" : a.kind === "escalate" ? "alert" : a.kind === "complaint" ? "flag" : "doc"}
                    className="size-4"
                  />
                  {a.label}
                  <span className="sr-only"> ({ACTION_KINDS[a.kind]})</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      <details className={box}>
        <summary className="min-h-11 cursor-pointer py-2 font-semibold">Policy excerpts</summary>
        <ul className="flex flex-col gap-3 text-sm">
          {phone.sources.map((s) => (
            <li key={s.id}>
              <p className="font-semibold">{s.title}</p>
              <p>{s.excerpt}</p>
              <p className="text-xs text-ink-muted">
                {s.version} · effective {showDate(s.effectiveFrom)}
                {s.url && (
                  <>
                    {" · "}
                    <a href={s.url} target="_blank" rel="noreferrer" className="font-semibold text-accent underline">
                      Source<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      </details>
    </aside>
  );
}

type Rewritten = {
  n: number;
  left: number;
  unclear: boolean;
  safety: { label: string; guidance: string } | null;
  moves: { quote: string; text: string }[];
  risks: { quote: string; text: string }[];
};

/**
  The phone call's debrief: the recommendation and how the call ended, any critical issue, the six dimensions
  (0 to 3, or "Insufficient evidence"), the call timeline with the learner's own words, and rewriting a line.
*/
export function PhoneDebrief({
  result: r,
  turns,
  opening,
  person,
  onRewrite,
}: {
  result: PhoneResult;
  turns: TurnResult[];
  opening: string;
  person: string;
  onRewrite?: (n: number, text: string) => Promise<Rewritten>;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className="mt-5 border-t border-line pt-4">
      <h4 ref={heading} tabIndex={-1} className="font-serif text-xl font-semibold outline-none">
        {r.recommendation === "Practised" ? "Practised" : "Needs another attempt"}
      </h4>
      <p className="mt-1">
        <span className="font-semibold">How the call ended: </span>
        {ENDINGS[r.ending]}.
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        A practice recommendation, not a pass mark or an assessment of you. A caller can stay unhappy after a sound call, and calm down after an unsafe one.
      </p>

      {r.critical.map((c) => (
        <div key={c.text} role="alert" className={cx(urgentTone, "mt-3")}>
          <p className="font-semibold">{c.text}</p>
          {c.quote && (
            <p className="mt-1 text-sm">
              Reply {c.turn}: “{c.quote}”
            </p>
          )}
          <p className="mt-1">{c.caution}</p>
        </div>
      ))}

      <h5 className="mt-4 font-semibold">Six things a good call does</h5>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {r.dims.map((d) => (
          <li key={d.id} className={box}>
            <p className="font-semibold">{d.label}</p>
            <p className="mt-0.5 text-sm">
              {d.score === null ? (
                d.rating
              ) : (
                <>
                  <span className="font-semibold">{d.rating}</span> ({d.score} of 3)
                </>
              )}
            </p>
            {d.score !== null && (
              <span aria-hidden className="mt-1 flex gap-1">
                {[1, 2, 3].map((i) => (
                  <span key={i} className={cx("h-1.5 flex-1 rounded-full", i <= d.score! ? "bg-ink" : "bg-line-strong")} />
                ))}
              </span>
            )}
            {d.score === null && <p className="mt-1 text-xs text-ink-muted">This call didn’t test it, so nothing is said about it.</p>}
            {d.evidence.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {d.evidence.map((e, i) => (
                  <li key={i}>
                    <span className="font-semibold">{e.good ? "Showed: " : "Careful: "}</span>
                    reply {e.turn}, “{e.quote}”
                  </li>
                ))}
              </ul>
            )}
            {d.suggestion && d.score !== null && d.score < 3 && <p className="mt-2 text-sm text-ink-muted">To try: {d.suggestion}</p>}
          </li>
        ))}
      </ul>

      <h5 className="mt-4 font-semibold">The call, line by line</h5>
      <ol className="mt-2 flex flex-col gap-3">
        <li className="text-sm text-ink-muted">
          {person}: “{opening}”
        </li>
        {turns.map((t) => {
          const marks = r.highlights.filter((h) => h.turn === t.n);
          const looked = r.lookups.filter((l) => l.afterTurn === t.n - 1);
          return (
            <li key={t.n} className={box}>
              {looked.length > 0 && <p className="text-xs text-ink-muted">Before this reply you used: {looked.map((l) => l.label).join(", ")}.</p>}
              <p>
                <span className="font-semibold">Reply {t.n}: </span>“{t.text}”
              </p>
              {marks.map((h, i) => (
                <div
                  key={i}
                  className={cx("mt-2 rounded-xl p-3 text-sm", h.good ? "bg-tealtint" : "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]")}
                >
                  <p>
                    <span className="font-semibold">{h.good ? "Worth keeping" : "Careful"}:</span> “{h.quote}”
                  </p>
                  <p className="mt-0.5">
                    {SIMULATED}, this {h.good ? "showed" : "was"}: {h.what.charAt(0).toLowerCase() + h.what.slice(1)}.
                  </p>
                  {h.alternative && <p className="mt-1">One alternative: {h.alternative}</p>}
                  {h.source && (
                    <p className="mt-1 text-xs">
                      Source: {h.source.title} ({h.source.version})
                    </p>
                  )}
                </div>
              ))}
              <p className="mt-2 text-sm text-ink-muted">
                {person}: “{t.reply}”
              </p>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-sm text-ink-muted">
        Highlights are evidence of what your words did in this simulated call, not proof of how a real person would react. Only your words were assessed:
        nothing about your voice.
      </p>
      {onRewrite && turns.length > 0 && <Rewrite turns={turns} onRewrite={onRewrite} />}
    </div>
  );
}

function Rewrite({ turns, onRewrite }: { turns: TurnResult[]; onRewrite: (n: number, text: string) => Promise<Rewritten> }) {
  const ids = useId();
  const [n, setN] = useState(turns[0].n);
  const [text, setText] = useState("");
  const [out, setOut] = useState<Rewritten | null>(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className={cx(warn, "mt-4 bg-bg text-ink ring-1 ring-line dark:bg-bg dark:text-ink")}>
      <h5 className="font-semibold">Rewrite a line</h5>
      <p className="text-sm text-ink-muted">Try one of your replies another way, and see how it reads at that point in the call. It isn’t added to the call.</p>
      <label className="mt-2 flex flex-col gap-1 text-sm">
        <span className="font-semibold">Which reply?</span>
        <select className="min-h-11 rounded-xl border border-line-strong bg-surface px-3" value={n} onChange={(e) => setN(Number(e.target.value))}>
          {turns.map((t) => (
            <option key={t.n} value={t.n}>
              Reply {t.n}: {t.text.slice(0, 60)}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${ids}-rw`} className="mt-2 block text-sm font-semibold">
        What you’d say instead
      </label>
      <textarea
        id={`${ids}-rw`}
        className="mt-1 min-h-20 w-full rounded-xl border border-line-strong bg-surface px-3 py-2"
        maxLength={MAX_REPLY}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        type="button"
        className={cx(secondary, "mt-2")}
        disabled={busy || text.trim().length < 2}
        onClick={async () => {
          setBusy(true);
          setProblem("");
          try {
            setOut(await onRewrite(n, text));
          } catch (e) {
            setProblem(e instanceof Error ? e.message : "That didn’t work.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Reading it…" : "See how it reads"}
      </button>
      {problem && (
        <p role="alert" className="mt-2">
          {problem}
        </p>
      )}
      {out && (
        <div role="status" className="mt-3 text-sm">
          {out.safety ? (
            <p className="font-semibold">
              {out.safety.label}: {out.safety.guidance}
            </p>
          ) : out.unclear ? (
            <p>It couldn’t tell what this line does from the words alone.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {out.moves.map((m, i) => (
                <li key={`m${i}`}>
                  <span className="font-semibold">Worth keeping:</span> “{m.quote}”: {m.text.charAt(0).toLowerCase() + m.text.slice(1)}.
                </li>
              ))}
              {out.risks.map((x, i) => (
                <li key={`r${i}`}>
                  <span className="font-semibold">Careful:</span> “{x.quote}”: {x.text.charAt(0).toLowerCase() + x.text.slice(1)}.
                </li>
              ))}
              {!out.moves.length && !out.risks.length && <li>Nothing in it stood out either way.</li>}
            </ul>
          )}
          <p className="mt-1 text-ink-muted">
            {out.left} {out.left === 1 ? "rewrite" : "rewrites"} left for this call.
          </p>
        </div>
      )}
    </div>
  );
}
