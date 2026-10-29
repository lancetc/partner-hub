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

export function VoiceInput({
  value,
  onChange,
  disabled,
  onListening,
  onUnsupported,
  onType,
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
      <p className="flex items-start gap-2 text-sm text-ink-muted">
        <Icon name="mic" className="mt-0.5 size-4 shrink-0" />
        Speaking your answer works in Chrome, Edge and Safari. In this browser, type it below.
      </p>
    );

  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
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
            <Icon name="mic" className="size-6" /> Record your answer
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
}: {
  id: string;
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
  rows?: number;
  placeholder?: string;
  describedBy?: string;
  after?: React.ReactNode;
}) {
  const [listening, setListening] = useState(false);
  const [typing, setTyping] = useState(false);
  const [voiceWorks, setVoiceWorks] = useState(true);
  const set = (t: string) => onChange(t.slice(0, 2000));
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
      />
    );

  return (
    <>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold">
          Your answer
        </label>
        {voiceWorks && (
          <button
            type="button"
            onClick={() => {
              set("");
              setTyping(false);
            }}
            className="inline-flex items-center gap-1 text-sm font-semibold text-accent underline underline-offset-2"
          >
            <Icon name="mic" className="size-4" /> {value.trim() ? "Record again" : "Record instead"}
          </button>
        )}
      </div>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={2000}
        placeholder={placeholder}
        onChange={(e) => set(e.target.value)}
        className="rounded-2xl border border-line-strong bg-surface p-3 text-[1.05rem] text-ink"
        aria-describedby={describedBy}
      />
      {after}
    </>
  );
}
