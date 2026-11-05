"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";

/*
  Speak instead of typing: the browser's own speech recognition turns the learner's voice into text
  as they talk, and the words go into the answer box, where they can be corrected before checking.
  Nothing is recorded or kept by the hub. Chrome, Edge and Safari support it; elsewhere the button
  explains that typing is the way to answer.
*/

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

const recogniser = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Joins what was there with what was said, with a space between, and a capital to start. */
function join(before: string, said: string) {
  const s = said.replace(/\s+/g, " ").trim();
  if (!s) return before;
  const spoken = before.trim() ? s : s.charAt(0).toUpperCase() + s.slice(1);
  return before.trim() ? `${before.replace(/\s+$/, "")} ${spoken}` : spoken;
}

type VoiceVariant = "box" | "hero";

export function VoiceInput({
  value,
  onChange,
  disabled,
  onListening,
  onUnsupported,
  onType,
  recordLabel = "Record your answer",
  tinted = false,
  variant = "box",
  chips,
}: {
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
  /** Recording started or stopped. */
  onListening?: (on: boolean) => void;
  /** This browser can't turn speech into text, so typing is the only way. */
  onUnsupported?: () => void;
  /** The learner would rather type. */
  onType?: () => void;
  /** The record button's words, e.g. "Record your idea". */
  recordLabel?: string;
  /** On a coloured card: notes outside the white box use the card's text colour. */
  tinted?: boolean;
  /** "box": a record button in a white box. "hero": a big round mic in the middle of the card, for cards that are mainly about speaking. */
  variant?: VoiceVariant;
  /** Hero only: short reassurances under the mic, e.g. "No wrong answers". */
  chips?: string[];
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  // The text before this recording started, and everything said that's final so far.
  const base = useRef("");
  const finals = useRef("");
  const wanted = useRef(false);

  useEffect(() => {
    // Known only in the browser, so it's checked after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(Boolean(recogniser()));
    return () => {
      wanted.current = false;
      rec.current?.abort();
    };
  }, []);

  useEffect(() => {
    onListening?.(listening);
    // Only when recording starts or stops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening]);
  useEffect(() => {
    if (supported === false) onUnsupported?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  useEffect(() => {
    if (!listening) return;
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [listening]);

  function start() {
    const Ctor = recogniser();
    if (!Ctor) return;
    setProblem(null);
    setSeconds(0);
    base.current = value;
    finals.current = "";
    wanted.current = true;
    const r = new Ctor();
    r.lang = "en-AU";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0].transcript;
        if (e.results[i].isFinal) finals.current = `${finals.current} ${piece}`;
        else interim += piece;
      }
      onChange(join(base.current, `${finals.current} ${interim}`));
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      wanted.current = false;
      setProblem(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "The microphone is blocked. Allow it in your browser’s settings for this site, or type your answer."
          : e.error === "network"
            ? "Voice needs a connection. Type your answer, or try again when you’re back online."
            : "Voice didn’t work just then. Try again, or type your answer.",
      );
    };
    // Some browsers stop after a pause: carry on until the learner presses Stop.
    r.onend = () => {
      if (wanted.current) {
        base.current = join(base.current, finals.current);
        finals.current = "";
        try {
          r.start();
          return;
        } catch {
          // Fall through and stop.
        }
      }
      setListening(false);
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setProblem("Voice didn’t start. Try again, or type your answer.");
    }
  }

  function stop() {
    wanted.current = false;
    rec.current?.stop();
    setListening(false);
  }

  if (supported === false)
    return (
      <p className={cx("flex items-start gap-2 text-sm", tinted ? "opacity-85" : "text-ink-muted")}>
        <Icon name="mic" className="mt-0.5 size-4 shrink-0" />
        Speaking your answer works in Chrome, Edge and Safari. In this browser, type it below.
      </p>
    );

  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  if (variant === "hero")
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-2 text-center">
        {/* The mic sits in two soft rings, which pulse while it's listening. */}
        <div className={cx("grid size-56 place-items-center rounded-full", tinted ? "bg-white/[0.07]" : "bg-tealtint/60", listening && "animate-pulse")}>
          <div className={cx("grid size-44 place-items-center rounded-full", tinted ? "bg-white/[0.13]" : "bg-tealtint")}>
            <button
              type="button"
              onClick={listening ? stop : start}
              disabled={disabled || supported === null}
              aria-pressed={listening}
              aria-label={listening ? "Stop recording" : recordLabel}
              className={cx(
                "fx-press grid size-32 place-items-center rounded-full shadow-[0_10px_30px_rgba(4,40,40,0.35)] disabled:opacity-60",
                tinted ? "bg-white text-[#0b6564] hover:bg-white/95" : "bg-action text-on-action hover:bg-action-hover",
              )}
            >
              {listening ? <span aria-hidden className="size-8 rounded-md bg-danger" /> : <Icon name="mic" className="size-12" />}
            </button>
          </div>
        </div>
        <p role="status" aria-live="polite" className="text-xl font-semibold leading-snug">
          {listening ? (
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="size-2.5 animate-pulse rounded-full bg-orange" /> Listening · {time}
            </span>
          ) : (
            "Tap and say it out loud"
          )}
        </p>
        {listening ? (
          <>
            <p className={cx("text-sm", tinted ? "opacity-85" : "text-ink-muted")}>Tap stop when you’ve finished. You can check the words before sharing.</p>
            {value.trim() && (
              <p className={cx("w-full rounded-2xl px-4 py-3 text-left text-[0.98rem] italic", tinted ? "bg-white/10" : "bg-muted text-ink")}>{value}</p>
            )}
          </>
        ) : (
          <>
            {chips && chips.length > 0 && (
              <ul className="flex flex-wrap justify-center gap-2" aria-label="Good to know">
                {chips.map((c) => (
                  <li key={c} className={cx("rounded-full px-3 py-1 text-sm", tinted ? "bg-white/15" : "bg-tealtint text-ink")}>
                    {c}
                  </li>
                ))}
              </ul>
            )}
            {onType && (
              <button type="button" onClick={onType} className={cx("min-h-11 text-sm font-semibold underline underline-offset-4", tinted ? "text-white" : "text-accent")}>
                Can’t talk right now? Type it instead
              </button>
            )}
          </>
        )}
        {problem && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl bg-surface p-3 text-left text-sm text-ink [text-shadow:none]">
            <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-danger" /> {problem}
          </p>
        )}
      </div>
    );

  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface p-4 text-ink ring-1 ring-line">
      <button
        type="button"
        onClick={listening ? stop : start}
        disabled={disabled || supported === null}
        aria-pressed={listening}
        className={cx(
          "fx-press inline-flex min-h-14 items-center justify-center gap-2.5 rounded-full px-6 text-lg font-semibold shadow-sm disabled:opacity-45",
          listening ? "bg-danger text-white hover:brightness-95" : "bg-action text-on-action hover:bg-action-hover",
        )}
      >
        {listening ? (
          <>
            <span aria-hidden className="size-3 animate-pulse rounded-sm bg-white" /> Stop recording
          </>
        ) : (
          <>
            <Icon name="mic" className="size-6" /> {recordLabel}
          </>
        )}
      </button>
      <p role="status" aria-live="polite" className="text-center text-sm text-ink-muted">
        {listening ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
            <span aria-hidden className="size-2 animate-pulse rounded-full bg-danger" /> Listening · {time}. Press stop when you’ve finished.
          </span>
        ) : (
          <>
            Press record and say your answer out loud.{" "}
            {onType && (
              <button type="button" onClick={onType} className="font-semibold text-accent underline underline-offset-2">
                Type it instead
              </button>
            )}
          </>
        )}
      </p>
      {/* What's been heard so far, while recording. It becomes the answer when they stop. */}
      {listening && value.trim() && <p className="w-full rounded-xl bg-muted px-3 py-2 text-[0.98rem] italic text-ink">{value}</p>}
      {problem && (
        <p role="alert" className="flex items-start gap-2 text-sm text-ink">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-danger" /> {problem}
        </p>
      )}
    </div>
  );
}

/**
  An answer learners say rather than type, for the Answer and Reflect cards. First just the record
  button; once a recording stops, the answer box with the words to check and correct, and "Record
  again". `after` (word count, check buttons) shows with the answer box. Typing is always possible.
*/
export function SpokenAnswer({
  id,
  value,
  onChange,
  disabled,
  rows = 5,
  placeholder = "Your words appear here as you speak, or type your answer.",
  describedBy,
  after,
  label = "Your answer",
  recordLabel,
  maxLength = 2000,
  tinted = false,
  variant,
  chips,
}: {
  id: string;
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
  rows?: number;
  placeholder?: string;
  describedBy?: string;
  after?: React.ReactNode;
  /** The heading over the words once recorded, e.g. "Your post". */
  label?: string;
  recordLabel?: string;
  maxLength?: number;
  /** On a coloured card (like the insight wall): links and notes use the card's text colour. */
  tinted?: boolean;
  variant?: VoiceVariant;
  chips?: string[];
}) {
  const [listening, setListening] = useState(false);
  const [typing, setTyping] = useState(false);
  const [voiceWorks, setVoiceWorks] = useState(true);
  const set = (t: string) => onChange(t.slice(0, maxLength));
  const showAnswer = typing || (Boolean(value.trim()) && !listening);

  if (!showAnswer && voiceWorks)
    return (
      <VoiceInput
        value={value}
        onChange={set}
        disabled={disabled}
        onListening={setListening}
        onUnsupported={() => {
          setVoiceWorks(false);
          setTyping(true);
        }}
        onType={() => setTyping(true)}
        recordLabel={recordLabel}
        tinted={tinted}
        variant={variant}
        chips={chips}
      />
    );

  return (
    <>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        {voiceWorks && (
          <button
            type="button"
            onClick={() => {
              set("");
              setTyping(false);
            }}
            className={cx("inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-2", tinted ? "text-white" : "text-accent")}
          >
            <Icon name="mic" className="size-4" /> {value.trim() ? "Record again" : "Record instead"}
          </button>
        )}
      </div>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => set(e.target.value)}
        className="rounded-2xl border border-line-strong bg-surface p-3 text-[1.05rem] text-ink [text-shadow:none] placeholder:text-ink-muted/70"
        aria-describedby={describedBy}
      />
      {after}
    </>
  );
}
