"use client";

import type { CardVisual as Visual } from "@/content/lessons";
import { StoryVisual, toneColours } from "../StoryVisual";
import { Icon, type IconName } from "../Icon";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/lib/format";

/**
  `onComplete` fires when a video has played to the end (or can't report it, so nobody gets stuck).
  It's how "Required completion" knows a video card is done.
*/
export function CardVisual({ visual, className, onComplete }: { visual: Visual; className?: string; onComplete?: () => void }) {
  if (visual.kind === "none") return null;

  if (visual.kind === "illustration") {
    const credit = visual.photo?.credit;
    if (!credit) return <StoryVisual {...visual} animated className={cx("rounded-3xl", className)} iconSize="size-10" />;
    // Stock photos carry the photographer's credit in the corner.
    return (
      <div className={cx("relative overflow-hidden rounded-3xl", className)}>
        <StoryVisual {...visual} animated className="size-full rounded-[inherit]" iconSize="size-10" />
        <PhotoCredit credit={credit} className="absolute bottom-2 right-2" />
      </div>
    );
  }

  if (visual.kind === "triangle") return <Triangle visual={visual} className={className} />;
  if (visual.kind === "orbit") return <Orbit visual={visual} className={className} />;

  const t = toneColours[visual.tone];

  if (visual.kind === "words") return <Words visual={visual} tone={t} className={className} />;

  if (visual.video?.provider === "youtube") {
    // YouTube's privacy-enhanced player: no tracking cookies until the learner presses play.
    const portrait = visual.video.orientation === "portrait";
    return (
      <div
        className={cx(
          "relative overflow-hidden rounded-3xl bg-black",
          className ?? (portrait ? "mx-auto aspect-[9/16] w-full max-w-[min(18rem,33.75svh)]" : "aspect-video"),
        )}
      >
        <YouTubeFrame id={visual.video.id} title={visual.video.title} onComplete={onComplete} />
      </div>
    );
  }

  if (visual.video?.orientation === "portrait" && visual.video.src) {
    return (
      <PortraitVideo
        video={{ ...visual.video, src: visual.video.src }}
        synthetic={visual.synthetic}
        name={visual.name}
        className={className}
        onComplete={onComplete}
      />
    );
  }

  if (visual.video?.provider === "elevenlabs") {
    // An AI presenter whose video hasn't been made yet: the presenter's photo, and the script is read aloud.
    return (
      <div className={cx("relative overflow-hidden rounded-3xl bg-muted", className ?? "aspect-[9/16]")}>
        {visual.video.poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={visual.video.poster} alt={visual.alt} className="absolute inset-0 size-full object-cover object-[center_15%]" />
        )}
        <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 font-mulish text-[0.7rem] font-bold text-white backdrop-blur-sm">
          AI presenter · {visual.name}
        </span>
      </div>
    );
  }

  if (visual.video) {
    // Synthesia's player supplies its own poster, controls and captions; it doesn't autoplay.
    const portrait = visual.video.orientation === "portrait";
    return (
      // A vertical video stays narrow and centred, and never taller than about 60% of the screen.
      <figure className={cx("flex flex-col gap-1.5", portrait && "mx-auto w-full max-w-[min(18rem,33.75svh)] items-center")}>
        <div className={cx("relative w-full overflow-hidden rounded-3xl bg-black", portrait ? "aspect-[9/16]" : className)}>
          <iframe
            src={`https://share.synthesia.io/embeds/videos/${visual.video.id}`}
            title={visual.video.title}
            loading="lazy"
            allow="encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 size-full border-0"
          />
        </div>
        {visual.synthetic && (
          <figcaption className="font-mulish text-xs font-semibold text-ink-muted">Synthetic presenter video, made with Synthesia</figcaption>
        )}
      </figure>
    );
  }

  if (visual.photo) {
    // The photo is supporting imagery, so the badge names the narrator rather than the person pictured.
    return (
      <div className={cx("relative flex items-end overflow-hidden rounded-3xl bg-muted", className)}>
        <Image src={visual.photo.src} alt={visual.alt} fill priority sizes="(min-width: 640px) 30rem, 100vw" className="object-cover" />
        <span className="relative m-3 rounded-full bg-black/55 px-3 py-1 font-mulish text-xs font-bold text-white">
          Narrated by {visual.name}
          {visual.synthetic ? ", a synthetic presenter" : ""}
        </span>
      </div>
    );
  }

  // Presenter poster. Video is not bundled in the prototype; narration is spoken by the browser.
  return (
    <div
      role="img"
      aria-label={`${visual.alt}: ${visual.name}${visual.synthetic ? ", synthetic presenter" : ""}`}
      className={cx("relative flex items-end overflow-hidden rounded-3xl", className)}
      style={{ background: t.bg }}
    >
      <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 size-full" aria-hidden>
        <circle cx="330" cy="60" r="90" fill={t.a} opacity="0.35" />
        <circle cx="60" cy="260" r="70" fill={t.b} opacity="0.3" />
        <circle cx="200" cy="120" r="52" fill="#F2D3BD" />
        <circle cx="182" cy="122" r="4.5" fill="#102a43" />
        <circle cx="218" cy="122" r="4.5" fill="#102a43" />
        <path d="M184 142 q16 12 32 0" fill="none" stroke="#102a43" strokeWidth="4" strokeLinecap="round" />
        <path d="M148 112c0-34 24-56 54-56s52 20 52 54c-8-14-26-24-52-24s-42 8-54 26z" fill={t.c === "#FFFFFF" ? "#102a43" : t.c} />
        <path d="M100 300c6-70 46-110 100-110s94 40 100 110z" fill={t.a} />
      </svg>
      {visual.synthetic && (
        <span className="relative m-3 rounded-full bg-black/45 px-3 py-1 font-mulish text-xs font-bold text-white">Synthetic presenter · {visual.name}</span>
      )}
    </div>
  );
}

const nodes: { id: "client" | "coordinator" | "trilogy"; label: string; icon: IconName; x: number; y: number }[] = [
  { id: "client", label: "Client", icon: "heart", x: 200, y: 70 },
  { id: "coordinator", label: "You, the coordinator", icon: "people", x: 92, y: 180 },
  { id: "trilogy", label: "Trilogy Care", icon: "shield", x: 308, y: 180 },
];

/**
  One reusable relationship diagram; each card highlights a different part of the partnership.
  As an explainer it animates: the three people pop in, the shared edges flow, the highlighted
  person pulses and small dots travel towards them. Reduced-motion users see it still.
*/
function Triangle({ visual, className }: { visual: Extract<Visual, { kind: "triangle" }>; className?: string }) {
  const isOn = (id: string) => visual.highlight === "all" || id === visual.highlight;
  const target = nodes.find((n) => n.id === visual.highlight);
  // Dots travel to the highlighted person, or around the triangle when all three are highlighted.
  const trips = target
    ? nodes.filter((n) => n !== target).map((n) => ({ from: n, to: target }))
    : nodes.map((n, i) => ({ from: n, to: nodes[(i + 1) % nodes.length] }));
  return (
    <div role="img" aria-label={visual.alt} className={cx("flex flex-col overflow-hidden rounded-3xl bg-[#e8eef6] text-[#102a43]", className)}>
      <svg viewBox="0 0 400 250" className="min-h-0 w-full flex-1" aria-hidden>
        <polygon points={nodes.map((n) => `${n.x},${n.y}`).join(" ")} fill="#FFFFFF" fillOpacity="0.6" stroke="none" />
        <polygon
          points={nodes.map((n) => `${n.x},${n.y}`).join(" ")}
          fill="none"
          stroke="#3d5068"
          strokeOpacity="0.4"
          strokeWidth="3"
          strokeDasharray="6 6"
          className="tri-flow"
        />
        {trips.map((t, i) => (
          <circle
            key={i}
            r="5"
            fill="#0e7c7b"
            className="tri-dot"
            style={
              {
                "--fx": `${t.from.x}px`,
                "--fy": `${t.from.y}px`,
                "--tx": `${t.to.x}px`,
                "--ty": `${t.to.y}px`,
                animationDelay: `${0.9 + i * 1.2}s`,
              } as React.CSSProperties
            }
          />
        ))}
        {nodes.map((n, i) => {
          const on = isOn(n.id);
          const r = on ? 40 : 30;
          return (
            <g key={n.id} opacity={on ? 1 : 0.6} className="tri-pop" style={{ animationDelay: `${i * 0.18}s` }}>
              {on && <circle cx={n.x} cy={n.y} r={r + 9} fill="#4cc3c9" className="tri-halo" style={{ animationDelay: `${i * 0.4}s` }} />}
              <circle cx={n.x} cy={n.y} r={r} fill={on ? "#0e7c7b" : "#FFFFFF"} stroke={on ? "#FFFFFF" : "#3d5068"} strokeWidth="3" />
              <foreignObject x={n.x - 14} y={n.y - 14} width="28" height="28">
                <Icon name={n.icon} className={cx("size-7", on ? "text-white" : "text-[#102a43]")} />
              </foreignObject>
              <text
                x={n.x}
                y={n.id === "client" ? n.y - r - 12 : n.y + r + 22}
                textAnchor="middle"
                fontSize={on ? 17 : 15}
                fontWeight={on ? 700 : 500}
                fill="#102a43"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>
      {visual.labels && (
        <ul className="flex flex-wrap justify-center gap-2 px-3 pb-3" aria-hidden>
          {visual.labels.map((l, i) => (
            <li
              key={l}
              className="animate-card-in rounded-full bg-[#0e7c7b] px-3 py-1 font-mulish text-xs font-bold text-white"
              style={{ animationDelay: `${600 + i * 1500}ms` }}
            >
              {l}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
  Person-centred diagram. Dashed lines flow towards the person, the centre ring pulses and a
  highlight moves around the people supporting them. Motion stops for reduced-motion users.
*/
function Orbit({ visual, className }: { visual: Extract<Visual, { kind: "orbit" }>; className?: string }) {
  const n = visual.nodes.length;
  const points = visual.nodes.map((_, i) => {
    const a = ((-90 + (360 / n) * i) * Math.PI) / 180;
    return { x: 50 + 36 * Math.cos(a), y: 50 + 38 * Math.sin(a) };
  });
  const cycle = n * 1.6;
  return (
    <div role="img" aria-label={visual.alt} className={cx("relative overflow-hidden rounded-3xl bg-[#e8eef6] text-[#102a43]", className)}>
      <div aria-hidden className="absolute inset-[8%] rounded-full bg-[#ddf2f3]" />
      <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
        {points.map((p, i) => (
          <line
            key={i}
            x1={p.x}
            y1={p.y}
            x2={50}
            y2={50}
            stroke="#0e7c7b"
            strokeOpacity="0.55"
            strokeWidth="1.5"
            strokeDasharray="3 5"
            vectorEffect="non-scaling-stroke"
            className="orbit-flow"
          />
        ))}
      </svg>

      {/* The person */}
      <div aria-hidden className="absolute left-1/2 top-1/2 flex h-[40%] aspect-square -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        <span className="orbit-ring absolute inset-0 rounded-full bg-[#0e7c7b]" />
        <span className="orbit-ring absolute inset-0 rounded-full bg-[#0e7c7b] [animation-delay:1.5s]" />
        <div className="relative flex size-full flex-col items-center justify-center rounded-full bg-[#0e7c7b] text-white shadow-[0_0_0_4px_#fff]">
          <Icon name="user" className="size-[22%]" />
          <span className="mt-0.5 text-center font-serif text-[0.8rem] font-semibold leading-none min-[400px]:text-[0.95rem] sm:text-lg">{visual.centre}</span>
          {visual.centreNote && (
            <span className="mt-1 hidden px-2 text-center text-[0.6rem] leading-tight opacity-90 min-[400px]:block sm:text-[0.65rem]">{visual.centreNote}</span>
          )}
        </div>
      </div>

      {/* The people around them */}
      {visual.nodes.map((node, i) => (
        <div
          key={node.label}
          aria-hidden
          className="orbit-float absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${points[i].x}%`, top: `${points[i].y}%`, animationDelay: `${i * 0.7}s` }}
        >
          <div
            className="orbit-node flex w-[5.2rem] flex-col min-[400px]:w-[6.4rem] items-center gap-0.5 rounded-xl border border-[#b8e3e6] bg-white px-1.5 py-1 text-center shadow-sm"
            style={{ animationDuration: `${cycle}s`, animationDelay: `${i * 1.6}s` }}
          >
            <Icon name={node.icon} className="size-4" />
            <span className="text-[0.58rem] font-semibold leading-tight min-[400px]:text-[0.62rem]">{node.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
  Key words that animate on: each line rises in from a blur, one after another. A leading
  number (such as "7 standards") counts up and is echoed by that many markers popping in.
*/
function Words({
  visual,
  tone,
  className,
}: {
  visual: Extract<Visual, { kind: "words" }>;
  tone: (typeof toneColours)[keyof typeof toneColours];
  className?: string;
}) {
  const lead = visual.words[0]?.match(/^(\d{1,2})(\s.*)$/);
  const target = lead ? Number(lead[1]) : 0;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!target) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now() + (still ? 0 : 250);
    const tick = (now: number) => {
      const p = still ? 1 : Math.min(1, Math.max(0, (now - start) / 900));
      setCount(Math.round(p * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return (
    <div
      role="img"
      aria-label={visual.alt}
      className={cx("flex flex-col items-start justify-center gap-2 overflow-hidden rounded-3xl p-6", className)}
      style={{ background: tone.bg, color: tone.icon }}
    >
      {visual.words.map((w, i) => (
        <span
          key={w}
          aria-hidden
          className="words-in font-serif text-3xl font-semibold leading-tight sm:text-4xl"
          style={{ animationDelay: `${150 + i * 550}ms`, opacity: i === visual.words.length - 1 && visual.words.length > 2 ? 0.85 : undefined }}
        >
          {i === 0 && lead ? (
            <>
              <span className="tabular-nums">{count}</span>
              {lead[2]}
            </>
          ) : (
            w
          )}
        </span>
      ))}
      {target > 0 && target <= 12 && (
        <span aria-hidden className="mt-2 flex gap-1.5">
          {Array.from({ length: target }, (_, i) => (
            <span
              key={i}
              className="marker-pop inline-flex size-7 items-center justify-center rounded-full font-mulish text-xs font-bold"
              style={{ animationDelay: `${300 + i * 130}ms`, background: tone.icon, color: tone.bg }}
            >
              {i + 1}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

type Captions = { spoken: string; words: { from: number; to: number; start: number; end: number }[] };

/** Short caption lines: a new line at the end of a sentence or clause, or after about seven words. */
function captionLines(c: Captions) {
  const lines: { words: { text: string; start: number; end: number }[]; start: number; end: number }[] = [];
  let line: { text: string; start: number; end: number }[] = [];
  c.words.forEach((w, i) => {
    const text = c.spoken.slice(w.from, w.to);
    line.push({ text, start: w.start, end: w.end });
    const last = i === c.words.length - 1;
    if (last || line.length >= 7 || /[.!?;:,]["”’)]?$/.test(text)) {
      lines.push({ words: line, start: line[0].start, end: c.words[i + 1]?.start ?? w.end + 1 });
      line = [];
    }
  });
  return lines;
}

/** The caption for this moment of the video, with the word being spoken picked out. */
function CaptionLine({ captions, time }: { captions: Captions; time: number }) {
  const lines = useMemo(() => captionLines(captions), [captions]);
  const line = lines.find((l) => time >= l.start && time < l.end) ?? (time < (lines[0]?.start ?? 0) ? null : lines[lines.length - 1]);
  if (!line) return null;
  return (
    // Sits above the video's own controls. Screen readers get the transcript elsewhere, so this is visual only.
    <p aria-hidden className="pointer-events-none absolute inset-x-3 bottom-16 text-center">
      <span className="inline rounded-lg bg-black/60 box-decoration-clone px-2 py-0.5 text-lg font-semibold leading-relaxed text-white/80 backdrop-blur-sm">
        {line.words.map((w, i) => (
          <span key={i} className={cx("transition-colors", time >= w.start && time < w.end + 0.15 ? "text-[#ffc72c]" : time >= w.start ? "text-white" : "")}>
            {w.text}
            {i < line.words.length - 1 ? " " : ""}
          </span>
        ))}
      </span>
    </p>
  );
}

/**
  A vertical presenter video that fills the card, like a phone story: poster, one big play button,
  then the browser's own controls once it's playing. Nothing loads until the learner presses play.
*/
function PortraitVideo({
  video,
  synthetic,
  name,
  className,
  onComplete,
}: {
  video: { title: string; src: string; poster?: string; captions?: Captions };
  synthetic: boolean;
  name: string;
  className?: string;
  onComplete?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"idle" | "playing" | "paused" | "ended">("idle");
  const [time, setTime] = useState(0);
  const [showCaptions, setShowCaptions] = useState(true);
  // Smooth captions: follow the video every frame while it plays (timeupdate only fires a few times a second).
  useEffect(() => {
    if (state !== "playing" || !video.captions) return;
    let raf = 0;
    const tick = () => {
      setTime(ref.current?.currentTime ?? 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state, video.captions]);
  const play = () => {
    const v = ref.current;
    if (!v) return;
    if (state === "ended") v.currentTime = 0;
    v.play().catch(() => setState("paused"));
  };
  const showButton = state !== "playing";
  return (
    <div className={cx("relative overflow-hidden rounded-3xl bg-muted", className)}>
      <video
        ref={ref}
        src={video.src}
        poster={video.poster}
        preload="none"
        playsInline
        controls={state === "playing" || state === "paused"}
        onPlay={() => setState("playing")}
        onPause={(e) => setState(e.currentTarget.ended ? "ended" : "paused")}
        onEnded={() => {
          setState("ended");
          onComplete?.();
        }}
        onError={() => onComplete?.()}
        aria-label={`${video.title}${synthetic ? `, presented by ${name}, a synthetic presenter` : ""}`}
        // On short screens the frame crops; keep the presenter's face in view.
        className="absolute inset-0 size-full object-cover object-[center_15%]"
      />
      {synthetic && (
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/40 px-2.5 py-1 font-mulish text-[0.7rem] font-bold text-white backdrop-blur-sm">
          AI presenter
        </span>
      )}
      {video.captions && state !== "idle" && (
        <>
          <button
            type="button"
            onClick={() => setShowCaptions((s) => !s)}
            aria-pressed={showCaptions}
            aria-label={showCaptions ? "Hide captions" : "Show captions"}
            className="absolute right-3 top-3 rounded-md bg-black/45 px-2 py-0.5 font-mulish text-xs font-extrabold text-white backdrop-blur-sm hover:bg-black/60"
          >
            CC
          </button>
          {showCaptions && <CaptionLine captions={video.captions} time={time} />}
        </>
      )}
      {showButton && (
        <button
          type="button"
          onClick={play}
          aria-label={state === "ended" ? `Play again: ${video.title}` : `Play video: ${video.title}`}
          className="absolute left-1/2 top-[62%] inline-flex size-[4.5rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#102a43] shadow-lg transition-transform hover:scale-105 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {state === "ended" ? (
            <Icon name="refresh" className="size-7" />
          ) : (
            <svg viewBox="0 0 24 24" className="ml-1 size-7" aria-hidden>
              <path d="M7 4.5v15l13-7.5z" fill="currentColor" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}

/**
  YouTube's privacy-enhanced player, listening for its own "ended" message so a required video card
  can unlock. If the player never reports back (blocked, or YouTube changes), the card isn't locked.
*/
function YouTubeFrame({ id, title, onComplete }: { id: string; title: string; onComplete?: () => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const done = useRef(onComplete);
  useEffect(() => {
    done.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    let heard = false;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      done.current?.();
    };
    const onMessage = (e: MessageEvent) => {
      if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin) || e.source !== ref.current?.contentWindow) return;
      let data: { event?: string; info?: number | { playerState?: number } } | null = null;
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      heard = true;
      const state = typeof data?.info === "number" ? (data.event === "onStateChange" ? data.info : undefined) : data?.info?.playerState;
      if (state === 0) finish(); // 0 = ended
    };
    window.addEventListener("message", onMessage);
    const subscribe = () => ref.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id, channel: "widget" }), "*");
    const iframe = ref.current;
    iframe?.addEventListener("load", subscribe);
    const retry = window.setInterval(subscribe, 1000);
    // No word from the player at all: don't hold anyone up.
    const giveUp = window.setTimeout(() => !heard && finish(), 10000);
    const stopRetry = window.setTimeout(() => window.clearInterval(retry), 8000);
    return () => {
      window.removeEventListener("message", onMessage);
      iframe?.removeEventListener("load", subscribe);
      window.clearInterval(retry);
      window.clearTimeout(giveUp);
      window.clearTimeout(stopRetry);
    };
  }, [id]);
  return (
    <iframe
      ref={ref}
      src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1&modestbranding=1&enablejsapi=1`}
      title={title}
      loading="lazy"
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
      className="absolute inset-0 size-full border-0"
    />
  );
}

/** "Photo: name / Pexels" (or "GIF: name / GIPHY"), linking to where it came from. */
export function PhotoCredit({ credit, className }: { credit: { name: string; url: string; source: string; page?: string }; className?: string }) {
  return (
    <a
      href={credit.page ?? credit.url}
      target="_blank"
      rel="noreferrer"
      onPointerDown={(e) => e.stopPropagation()}
      className={cx(
        "max-w-[70%] truncate rounded-full bg-black/55 px-2 py-0.5 text-[0.65rem] font-medium text-white/90 backdrop-blur-sm hover:bg-black/70",
        className,
      )}
    >
      {credit.source === "GIPHY" ? "GIF" : "Photo"}: {credit.name} / {credit.source}
    </a>
  );
}
