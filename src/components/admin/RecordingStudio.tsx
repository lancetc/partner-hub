"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { cx } from "@/lib/format";
import type { VideoRecording } from "@/lib/magazine";
import { splitCues, toVtt, type Cue } from "@/lib/captions";
import { Icon } from "../Icon";
import { btn } from "./ui";

/*
  The Magazine's recording studio: record a video for a page without leaving the editor.
  - Talking head (the camera) or Screen + webcam (a tab, window or screen with you in a circle in the corner).
  - Choose the camera and microphone, watch the microphone level, and read from a teleprompter, with a
    script Claude can draft from the page.
  - A 3, 2, 1 countdown, then pause, resume and stop; retake as often as needed.
  - Captions are written as you speak (the browser's speech recognition, where it has it), to correct afterwards.
  - Review: trim the start and end, pick the thumbnail, correct the captions and transcript, and confirm
    that everyone and everything shown may be shared. Nothing is uploaded until Save, and nothing is published.
*/

export type StudioSaved = {
  src: string;
  poster?: string;
  captions?: string;
  transcript: string;
  trim?: { start: number; end: number };
  recording: VideoRecording;
  /**
    Vertical (9:16): the part of the frame to show, as the horizontal centre in % of the width. Not re-encoded:
    the recording is kept whole and the player shows this window of it, so the crop can be moved later.
  */
  crop?: { aspect: "9:16"; x: number };
};
type Mode = VideoRecording["mode"];
type Shape = "wide" | "vertical";
/** A 9:16 window's width as a share of a 16:9 frame: (9/16) / (16/9). */
const VERTICAL_SHARE = 81 / 256;
type Stage = "setup" | "countdown" | "recording" | "paused" | "review" | "saving";
type Clip = { blob: Blob; url: string; seconds: number };
type Device = { id: string; label: string };

/** Aim for 30 seconds to 3 minutes; recording stops at 5, which keeps the file under the 80 MB upload limit. */
const AIM_SECONDS = 180;
const MAX_SECONDS = 300;
const TYPES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
const SCRIPT_LENGTHS = [
  { s: 30, label: "30 seconds" },
  { s: 60, label: "1 minute" },
  { s: 120, label: "2 minutes" },
  { s: 180, label: "3 minutes" },
];

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// The browser's speech recognition, where it has one (Chrome, Edge and Safari).
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
const recogniser = () => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/**
  A steady clock for drawing Screen + webcam frames. Timers in a page are slowed when the author switches to
  the tab they're sharing; a worker's aren't, so the recording keeps moving.
*/
function ticker(fps: number, tick: () => void) {
  const url = URL.createObjectURL(
    new Blob(["let t;onmessage=(e)=>{clearInterval(t);if(e.data)t=setInterval(()=>postMessage(0),e.data)}"], { type: "text/javascript" }),
  );
  const w = new Worker(url);
  w.onmessage = tick;
  w.postMessage(Math.round(1000 / fps));
  return () => {
    w.postMessage(0);
    w.terminate();
    URL.revokeObjectURL(url);
  };
}

const deviceError = (e: unknown) => {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "The camera or microphone is blocked. Allow them from the icon in the browser’s address bar, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera or microphone was found. Plug one in, or choose another below.";
  if (name === "NotReadableError") return "The camera or microphone is being used by another app. Close it there, then try again.";
  return "The camera or microphone didn’t start. Try again, or upload a video instead.";
};

export function RecordingStudio({
  guideId,
  blockId,
  initialScript = "",
  vertical = false,
  upload,
  onSaved,
  onClose,
}: {
  /** Offer a vertical (9:16) shape for camera recordings, cropped from the frame (Topic cards fill the screen with one). */
  vertical?: boolean;
  /** A Magazine course and block: Claude can draft the script from its page. Without them (a Topic card) the script is typed or pasted. */
  guideId?: string;
  blockId?: string;
  /** What the teleprompter starts with, such as a Topic card's own words. */
  initialScript?: string;
  upload: (file: File, kind: "video" | "captions" | "image") => Promise<string>;
  onSaved: (saved: StudioSaved) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("camera");
  const [stage, setStage] = useState<Stage>("setup");
  const [problem, setProblem] = useState<string | null>(null);
  const [cams, setCams] = useState<Device[]>([]);
  const [mics, setMics] = useState<Device[]>([]);
  const [camId, setCamId] = useState("");
  const [micId, setMicId] = useState("");
  const [ready, setReady] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [count, setCount] = useState(3);
  const [, setTick] = useState(0);
  const [clip, setClip] = useState<Clip | null>(null);

  // Captions as they're spoken, then the ones to keep.
  const [live, setLive] = useState("");
  const [cues, setCues] = useState<Cue[]>([]);
  const [transcript, setTranscript] = useState("");
  const [captionNote, setCaptionNote] = useState<string | null>(
    recogniser() ? null : "This browser can’t write captions as you speak. Chrome or Edge can; or add a captions file afterwards.",
  );

  // Review.
  const [trim, setTrim] = useState({ start: 0, end: 0 });
  // Vertical: framed with a guide while recording, then the window moved left or right in review.
  const [shape, setShape] = useState<Shape>("wide");
  const [cropX, setCropX] = useState(50);
  const isVertical = vertical && shape === "vertical" && mode === "camera";
  const [poster, setPoster] = useState<{ blob: Blob; url: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [saveStep, setSaveStep] = useState("");

  // Teleprompter.
  const [script, setScript] = useState(initialScript);
  const [length, setLength] = useState(60);
  const [notes, setNotes] = useState("");
  const [writing, setWriting] = useState(false);
  const [textSize, setTextSize] = useState(26);
  const [speed, setSpeed] = useState(3);

  const preview = useRef<HTMLVideoElement>(null);
  const review = useRef<HTMLVideoElement>(null);
  const prompter = useRef<HTMLDivElement>(null);
  const meter = useRef<HTMLSpanElement>(null);
  const cam = useRef<MediaStream | null>(null);
  const screen = useRef<MediaStream | null>(null);
  const canvasStream = useRef<MediaStream | null>(null);
  const stopDrawing = useRef<(() => void) | null>(null);
  const stopMeter = useRef<(() => void) | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const acc = useRef(0);
  const since = useRef(0);
  const running = useRef(false);
  const recognition = useRef<Recognition | null>(null);
  const wantCaptions = useRef(false);
  const segStart = useRef<number | null>(null);
  const found = useRef<Cue[]>([]);

  const elapsed = () => (acc.current + (running.current ? performance.now() - since.current : 0)) / 1000;

  // ---- Devices -------------------------------------------------------------------------------------

  const stopStream = (s: MediaStream | null) => s?.getTracks().forEach((t) => t.stop());
  const stopAll = () => {
    stopDrawing.current?.();
    stopDrawing.current = null;
    stopMeter.current?.();
    stopMeter.current = null;
    stopStream(cam.current);
    stopStream(screen.current);
    stopStream(canvasStream.current);
    cam.current = screen.current = canvasStream.current = null;
    setSharing(false);
    setReady(false);
  };

  /** The microphone's level, drawn straight onto the meter (no re-render per frame). */
  function startMeter(stream: MediaStream) {
    stopMeter.current?.();
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    const ac = new AudioContext();
    const analyser = ac.createAnalyser();
    analyser.fftSize = 512;
    ac.createMediaStreamSource(new MediaStream([track])).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const draw = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      if (meter.current) meter.current.style.width = `${Math.min(100, (peak / 64) * 100)}%`;
      frame = requestAnimationFrame(draw);
    };
    draw();
    stopMeter.current = () => {
      cancelAnimationFrame(frame);
      void ac.close();
    };
  }

  async function startDevices(nextCam = camId, nextMic = micId) {
    setProblem(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setProblem("This browser can’t record video. Try Chrome or Edge, or upload a video instead.");
      return;
    }
    stopDrawing.current?.();
    stopStream(cam.current);
    try {
      cam.current = await navigator.mediaDevices.getUserMedia({
        video: { ...(nextCam ? { deviceId: { exact: nextCam } } : { facingMode: "user" }), width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { ...(nextMic && { deviceId: { exact: nextMic } }), echoCancellation: true, noiseSuppression: true },
      });
      const all = await navigator.mediaDevices.enumerateDevices();
      const list = (kind: MediaDeviceKind, what: string) =>
        all.filter((d) => d.kind === kind && d.deviceId).map((d, i) => ({ id: d.deviceId, label: d.label || `${what} ${i + 1}` }));
      setCams(list("videoinput", "Camera"));
      setMics(list("audioinput", "Microphone"));
      setCamId(cam.current.getVideoTracks()[0]?.getSettings().deviceId ?? nextCam);
      setMicId(cam.current.getAudioTracks()[0]?.getSettings().deviceId ?? nextMic);
      startMeter(cam.current);
      if (mode === "screen" && screen.current) compose();
      else if (preview.current) {
        preview.current.srcObject = cam.current;
        await preview.current.play().catch(() => {});
      }
      setReady(true);
    } catch (e) {
      setReady(false);
      setProblem(deviceError(e));
    }
  }

  /** Screen + webcam: the shared screen fitted to 1280×720, with the camera in a circle in the corner. */
  function compose() {
    stopDrawing.current?.();
    if (!screen.current || !cam.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const g = canvas.getContext("2d")!;
    const sv = document.createElement("video");
    const cv = document.createElement("video");
    for (const [v, s] of [
      [sv, screen.current],
      [cv, cam.current],
    ] as const) {
      v.muted = true;
      v.playsInline = true;
      v.srcObject = s;
      void v.play().catch(() => {});
    }
    const draw = () => {
      g.fillStyle = "#0b1626";
      g.fillRect(0, 0, 1280, 720);
      if (sv.videoWidth) {
        const k = Math.min(1280 / sv.videoWidth, 720 / sv.videoHeight);
        const w = sv.videoWidth * k;
        const h = sv.videoHeight * k;
        g.drawImage(sv, (1280 - w) / 2, (720 - h) / 2, w, h);
      }
      if (cv.videoWidth) {
        const d = 220;
        const x = 1280 - d - 28;
        const y = 720 - d - 28;
        const s = Math.min(cv.videoWidth, cv.videoHeight);
        g.save();
        g.beginPath();
        g.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2);
        g.clip();
        g.drawImage(cv, (cv.videoWidth - s) / 2, (cv.videoHeight - s) / 2, s, s, x, y, d, d);
        g.restore();
        g.lineWidth = 5;
        g.strokeStyle = "#ffffff";
        g.beginPath();
        g.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2);
        g.stroke();
      }
    };
    const stop = ticker(30, draw);
    stopStream(canvasStream.current);
    canvasStream.current = canvas.captureStream(30);
    if (preview.current) {
      preview.current.srcObject = canvasStream.current;
      void preview.current.play().catch(() => {});
    }
    stopDrawing.current = () => {
      stop();
      sv.srcObject = cv.srcObject = null;
    };
  }

  async function shareScreen() {
    setProblem(null);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setProblem("This browser can’t record the screen. Try Chrome or Edge on a computer.");
      return;
    }
    try {
      stopStream(screen.current);
      screen.current = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      // "Stop sharing" in the browser ends the recording, or goes back to choosing.
      screen.current.getVideoTracks()[0].onended = () => {
        if (recorder.current && recorder.current.state !== "inactive") stop();
        else {
          stopDrawing.current?.();
          screen.current = null;
          setSharing(false);
          if (preview.current && cam.current) preview.current.srcObject = cam.current;
        }
      };
      setSharing(true);
      compose();
    } catch (e) {
      if ((e as { name?: string })?.name !== "NotAllowedError") setProblem("Screen sharing didn’t start. Try again.");
    }
  }

  // Start with the camera; tidy everything away on close.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starting the camera is the point of opening the studio
    void startDevices();
    return () => {
      wantCaptions.current = false;
      recognition.current?.stop();
      if (recorder.current?.state !== "inactive") recorder.current?.stop();
      stopAll();
    };
    // Once, when the studio opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => void (clip && URL.revokeObjectURL(clip.url)), [clip]);
  useEffect(() => () => void (poster && URL.revokeObjectURL(poster.url)), [poster]);

  // The timer, and the automatic stop at the limit.
  useEffect(() => {
    if (stage !== "recording") return;
    const t = window.setInterval(() => {
      setTick((n) => n + 1);
      if (elapsed() >= MAX_SECONDS) stop();
    }, 250);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // The teleprompter scrolls while recording.
  useEffect(() => {
    if (stage !== "recording") return;
    const t = window.setInterval(() => prompter.current?.scrollBy({ top: speed * 0.6 }), 50);
    return () => window.clearInterval(t);
  }, [stage, speed]);

  // Leaving with a recording that isn't saved asks first.
  useEffect(() => {
    if (!clip && stage !== "recording" && stage !== "paused") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [clip, stage]);

  // ---- Captions as they speak ----------------------------------------------------------------------

  function startCaptions() {
    const R = recogniser();
    if (!R) return;
    wantCaptions.current = true;
    const r = new R();
    r.lang = "en-AU";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const last = found.current.at(-1)?.end ?? 0;
        if (segStart.current === null) segStart.current = Math.max(last, elapsed() - 1);
        const text = res[0].transcript.trim();
        if (res.isFinal) {
          if (text)
            found.current.push({ start: segStart.current, end: Math.max(elapsed(), segStart.current + 1), text: text.charAt(0).toUpperCase() + text.slice(1) });
          segStart.current = null;
        }
        setLive(text);
      }
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wantCaptions.current = false;
        setCaptionNote("Captions couldn’t be written as you spoke (speech recognition is blocked). You can type them in afterwards.");
      }
    };
    // Recognition stops itself after a silence; keep it going while recording.
    r.onend = () => {
      if (!wantCaptions.current) return;
      try {
        r.start();
      } catch {
        /* already running */
      }
    };
    try {
      r.start();
      recognition.current = r;
    } catch {
      /* not available right now */
    }
  }
  function stopCaptions() {
    wantCaptions.current = false;
    recognition.current?.stop();
    recognition.current = null;
    segStart.current = null;
  }

  // ---- Recording -----------------------------------------------------------------------------------

  function begin() {
    if (!cam.current || (mode === "screen" && !canvasStream.current)) return;
    setStage("countdown");
    setCount(3);
    let n = 3;
    const step = () => {
      n -= 1;
      if (n === 0) return startRecorder();
      setCount(n);
      window.setTimeout(step, 1000);
    };
    window.setTimeout(step, 1000);
  }

  function startRecorder() {
    const video = mode === "screen" ? canvasStream.current!.getVideoTracks() : cam.current!.getVideoTracks();
    const stream = new MediaStream([...video, ...cam.current!.getAudioTracks()]);
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    let r: MediaRecorder;
    try {
      r = new MediaRecorder(stream, { ...(type && { mimeType: type }), videoBitsPerSecond: 2_000_000 });
    } catch {
      setStage("setup");
      setProblem("This browser couldn’t start recording. Try Chrome or Edge, or upload a video instead.");
      return;
    }
    chunks.current = [];
    found.current = [];
    setLive("");
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      const blob = new Blob(chunks.current, { type: (r.mimeType || type || "video/webm").split(";")[0] });
      const seconds = Math.round(elapsed() * 10) / 10;
      setClip({ blob, url: URL.createObjectURL(blob), seconds });
      setTrim({ start: 0, end: seconds });
      const kept = splitCues(found.current);
      setCues(kept);
      setTranscript(found.current.map((c) => c.text).join(" "));
      setPoster(null);
      setConsent(false);
      setStage("review");
      // The camera and screen are off while reviewing.
      stopAll();
    };
    recorder.current = r;
    acc.current = 0;
    since.current = performance.now();
    running.current = true;
    r.start(1000);
    setStage("recording");
    startCaptions();
    prompter.current?.scrollTo({ top: 0 });
  }

  function pause() {
    recorder.current?.pause();
    acc.current += performance.now() - since.current;
    running.current = false;
    stopCaptions();
    setStage("paused");
  }
  function resume() {
    recorder.current?.resume();
    since.current = performance.now();
    running.current = true;
    startCaptions();
    setStage("recording");
  }
  function stop() {
    if (!recorder.current || recorder.current.state === "inactive") return;
    if (running.current) acc.current += performance.now() - since.current;
    running.current = false;
    stopCaptions();
    recorder.current.stop();
  }

  async function retake() {
    if (clip && !(await confirmAction("This recording is thrown away.", { title: "Record again?", confirmLabel: "Record again" }))) return;
    setClip(null);
    setCues([]);
    setTranscript("");
    setPoster(null);
    setStage("setup");
    await startDevices();
  }

  async function close() {
    if (
      (clip || stage === "recording" || stage === "paused") &&
      !(await confirmAction("The recording isn’t saved and will be lost.", { title: "Close the studio?", confirmLabel: "Close" }))
    )
      return;
    onClose();
  }

  // ---- Review --------------------------------------------------------------------------------------

  /** The frame showing in the review player, as the thumbnail. */
  async function grabFrame() {
    const v = review.current;
    if (!v || !v.videoWidth) return null;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.86));
    return blob ? { blob, url: URL.createObjectURL(blob) } : null;
  }

  function playTrimmed() {
    const v = review.current;
    if (!v) return;
    v.currentTime = trim.start;
    void v.play();
  }

  async function save() {
    if (!clip || !consent) return;
    setStage("saving");
    setProblem(null);
    try {
      setSaveStep("Uploading the video…");
      const ext = clip.blob.type.includes("mp4") ? "mp4" : "webm";
      const src = await upload(new File([clip.blob], `recording.${ext}`, { type: clip.blob.type || "video/webm" }), "video");
      setSaveStep("Saving the thumbnail…");
      const frame = poster ?? (await grabFrame());
      const posterSrc = frame ? await upload(new File([frame.blob], "thumbnail.jpg", { type: "image/jpeg" }), "image").catch(() => undefined) : undefined;
      const keep = cues.filter((c) => c.text.trim());
      let captions: string | undefined;
      if (keep.length) {
        setSaveStep("Saving the captions…");
        captions = await upload(new File([toVtt(keep)], "captions.vtt", { type: "text/vtt" }), "captions");
      }
      const trimmed = trim.start > 0.05 || trim.end < clip.seconds - 0.05;
      onSaved({
        src,
        ...(posterSrc && { poster: posterSrc }),
        ...(captions && { captions }),
        transcript: transcript.trim(),
        ...(trimmed && { trim: { start: Math.round(trim.start * 10) / 10, end: Math.round(trim.end * 10) / 10 } }),
        recording: { mode, at: new Date().toISOString(), seconds: clip.seconds, consent: true },
        ...(isVertical && { crop: { aspect: "9:16" as const, x: Math.round(cropX) } }),
      });
    } catch (e) {
      setProblem((e as Error).message);
      setStage("review");
    }
  }

  async function writeScript() {
    if (!guideId) return;
    setWriting(true);
    setProblem(null);
    try {
      const r = await api<{ script: string }>(`/api/admin/magazine/${guideId}/script`, { body: { blockId, seconds: length, notes } });
      setScript(r.script);
      prompter.current?.scrollTo({ top: 0 });
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setWriting(false);
    }
  }

  // ---- Layout --------------------------------------------------------------------------------------

  const recordingNow = stage === "recording" || stage === "paused";
  const secs = recordingNow ? elapsed() : 0;
  const canRecord = ready && (mode === "camera" || sharing);
  const words = script.split(/\s+/).filter(Boolean).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-title"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#0b1626]/80 p-2 backdrop-blur-sm sm:p-4"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 rounded-3xl bg-surface p-4 shadow-2xl sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="studio-title" className="flex items-center gap-2 font-serif text-2xl font-semibold">
            <Icon name="camera" className="size-6 text-accent" /> Record a video
          </h2>
          <button type="button" className={btn.quiet} onClick={() => void close()} disabled={stage === "saving"}>
            <Icon name="close" className="size-4" /> Close
          </button>
        </div>

        {stage !== "review" && stage !== "saving" && (
          <>
            <div role="radiogroup" aria-label="Recording mode" className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    m: "camera",
                    icon: "user",
                    title: "Talking head",
                    text: "You, speaking to the camera. For introductions, encouragement and explaining an idea.",
                  },
                  {
                    m: "screen",
                    icon: "monitor",
                    title: "Screen + webcam",
                    text: "A tab, window or screen, with you in a circle in the corner. For showing a system or a workflow.",
                  },
                ] as const
              ).map((o) => (
                <button
                  key={o.m}
                  type="button"
                  role="radio"
                  aria-checked={mode === o.m}
                  disabled={recordingNow || stage === "countdown"}
                  onClick={() => {
                    setMode(o.m);
                    if (o.m === "camera") {
                      stopDrawing.current?.();
                      stopStream(screen.current);
                      screen.current = null;
                      setSharing(false);
                      if (preview.current && cam.current) preview.current.srcObject = cam.current;
                    }
                  }}
                  className={cx(
                    "flex items-start gap-3 rounded-2xl border-2 p-3 text-left disabled:opacity-60",
                    mode === o.m ? "border-action bg-tealtint" : "border-line-strong hover:bg-muted",
                  )}
                >
                  <Icon name={o.icon} className="mt-0.5 size-5 shrink-0 text-accent" />
                  <span>
                    <span className="block font-semibold">{o.title}</span>
                    <span className="block text-sm text-ink-muted">{o.text}</span>
                  </span>
                </button>
              ))}
            </div>

            {vertical && mode === "camera" && (
              <div role="radiogroup" aria-label="Shape" className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">Shape</span>
                {(
                  [
                    ["wide", "Wide 16:9", "Sits above the card’s text"],
                    ["vertical", "Vertical 9:16", "Fills the whole card, like a phone video"],
                  ] as const
                ).map(([s, label, hint]) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={shape === s}
                    title={hint}
                    disabled={recordingNow || stage === "countdown"}
                    onClick={() => setShape(s)}
                    className={cx(
                      "min-h-9 rounded-full border-2 px-3.5 font-semibold disabled:opacity-60",
                      shape === s ? "border-action bg-tealtint" : "border-line-strong hover:bg-muted",
                    )}
                  >
                    {label}
                  </button>
                ))}
                {isVertical && <span className="text-ink-muted">Keep yourself inside the frame. You can move the crop afterwards.</span>}
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <div className="flex flex-col gap-3">
                <div className="relative overflow-hidden rounded-2xl bg-black">
                  <video
                    ref={preview}
                    muted
                    playsInline
                    className={cx("aspect-video w-full object-contain", mode === "camera" && "-scale-x-100")}
                    aria-label="Camera preview"
                  />
                  {isVertical && (
                    // The 9:16 window learners will see, centred; outside it is dimmed.
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-md border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                      style={{ width: `${VERTICAL_SHARE * 100}%` }}
                    />
                  )}
                  {mode === "screen" && !sharing && ready && (
                    <div className="absolute inset-0 grid place-items-center bg-black/60 p-4 text-center text-white">
                      <div>
                        <p className="font-semibold">Choose what to share</p>
                        <p className="mt-1 text-sm text-white/80">A browser tab works best. You’ll appear in a circle in the corner.</p>
                        <button
                          type="button"
                          onClick={() => void shareScreen()}
                          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 font-semibold text-[#0a1a2e]"
                        >
                          <Icon name="monitor" className="size-4" /> Choose a screen or tab
                        </button>
                      </div>
                    </div>
                  )}
                  {stage === "countdown" && (
                    <div className="absolute inset-0 grid place-items-center bg-black/50 font-mulish text-8xl font-extrabold text-white" aria-live="assertive">
                      {count}
                    </div>
                  )}
                  {recordingNow && (
                    <span
                      className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-sm font-semibold text-white"
                      role="timer"
                      aria-live="off"
                    >
                      <span className={cx("size-2.5 rounded-full", stage === "recording" ? "animate-pulse bg-[#e5484d]" : "bg-[#fab53d]")} />
                      {stage === "paused" ? "Paused" : "Recording"} · {clock(secs)}
                    </span>
                  )}
                  {stage === "recording" && live && (
                    <p className="absolute inset-x-6 bottom-4 rounded-lg bg-black/70 px-3 py-1.5 text-center text-sm text-white" aria-hidden>
                      {live}
                    </p>
                  )}
                </div>

                {recordingNow && (
                  <p className={cx("text-sm", secs > AIM_SECONDS ? "font-semibold text-[#9a5b00] dark:text-[#fab53d]" : "text-ink-muted")} role="status">
                    {secs > AIM_SECONDS
                      ? `Over 3 minutes: shorter videos keep people watching. It stops at ${clock(MAX_SECONDS)}.`
                      : "Aim for 30 seconds to 3 minutes."}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {stage === "setup" && (
                    <button
                      type="button"
                      onClick={begin}
                      disabled={!canRecord}
                      className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#c7393e] px-6 font-semibold text-white hover:bg-[#a92f33] disabled:opacity-45"
                    >
                      <span className="size-3 rounded-full bg-white" /> Start recording
                    </button>
                  )}
                  {stage === "recording" && (
                    <button type="button" onClick={pause} className={btn.secondary}>
                      <Icon name="pause" className="size-4" /> Pause
                    </button>
                  )}
                  {stage === "paused" && (
                    <button type="button" onClick={resume} className={btn.secondary}>
                      <Icon name="play" className="size-4" /> Resume
                    </button>
                  )}
                  {recordingNow && (
                    <button
                      type="button"
                      onClick={stop}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 font-semibold text-surface"
                    >
                      <span className="size-3 rounded-sm bg-surface" /> Stop
                    </button>
                  )}
                  {mode === "screen" && sharing && stage === "setup" && (
                    <button type="button" className={btn.quiet} onClick={() => void shareScreen()}>
                      Share something else
                    </button>
                  )}
                </div>

                {stage === "setup" && (
                  <div className="grid gap-3 rounded-2xl border border-line p-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm font-semibold">
                      Camera
                      <select
                        className="min-h-10 rounded-xl border border-line-strong bg-surface px-2 font-normal"
                        value={camId}
                        onChange={(e) => {
                          setCamId(e.target.value);
                          void startDevices(e.target.value, micId);
                        }}
                      >
                        {!cams.length && <option value="">Default camera</option>}
                        {cams.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-semibold">
                      Microphone
                      <select
                        className="min-h-10 rounded-xl border border-line-strong bg-surface px-2 font-normal"
                        value={micId}
                        onChange={(e) => {
                          setMicId(e.target.value);
                          void startDevices(camId, e.target.value);
                        }}
                      >
                        {!mics.length && <option value="">Default microphone</option>}
                        {mics.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="sm:col-span-2">
                      <p className="text-sm font-semibold">Microphone level</p>
                      <p className="text-xs text-ink-muted">
                        Say a few words: the bar should move well past half way. Face a window or lamp so your face is lit.
                      </p>
                      <span className="mt-1.5 block h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span ref={meter} className="block h-full w-0 rounded-full bg-action transition-[width] duration-75" />
                      </span>
                    </div>
                    {!ready && !problem && (
                      <p className="text-sm text-ink-muted sm:col-span-2">Starting the camera… Allow the camera and microphone if the browser asks.</p>
                    )}
                    {problem && (
                      <button type="button" className={cx(btn.secondary, "justify-self-start")} onClick={() => void startDevices()}>
                        <Icon name="refresh" className="size-4" /> Try again
                      </button>
                    )}
                  </div>
                )}
                {captionNote && stage === "setup" && <p className="text-sm text-ink-muted">{captionNote}</p>}
              </div>

              <section aria-label="Teleprompter" className="flex min-h-0 flex-col gap-2 rounded-2xl border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold">Teleprompter</h3>
                  <span className="text-xs text-ink-muted">{words ? `${words} words · about ${clock((words / 140) * 60)}` : "Optional"}</span>
                </div>
                <div
                  ref={prompter}
                  className={cx(
                    "h-64 overflow-y-auto rounded-xl bg-[#0b1626] p-4 leading-relaxed text-white lg:h-80",
                    !script && "grid place-items-center text-center text-white/60",
                  )}
                  style={{ fontSize: `${textSize}px` }}
                  aria-live="off"
                >
                  {script ? (
                    <p className="whitespace-pre-line pb-[60%]">{script}</p>
                  ) : (
                    <p className="text-base">
                      {guideId ? "Write or paste what you’ll say, or let Claude draft it from this page." : "Write or paste what you’ll say."}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <label className="flex flex-col gap-1 font-semibold">
                    Text size
                    <input
                      type="range"
                      min={16}
                      max={44}
                      value={textSize}
                      onChange={(e) => setTextSize(Number(e.target.value))}
                      className="accent-[var(--color-action)]"
                    />
                  </label>
                  <label className="flex flex-col gap-1 font-semibold">
                    Scroll speed
                    <input
                      type="range"
                      min={0}
                      max={10}
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                      className="accent-[var(--color-action)]"
                    />
                  </label>
                </div>
                {!recordingNow && stage !== "countdown" && (
                  <details className="rounded-xl bg-muted/60 p-2" open={!script}>
                    <summary className="cursor-pointer text-sm font-semibold">{script ? "Edit the script" : "Write the script"}</summary>
                    <textarea
                      className="mt-2 min-h-28 w-full rounded-lg border border-line-strong bg-surface p-2 text-sm"
                      value={script}
                      onChange={(e) => setScript(e.target.value)}
                      placeholder="What you’ll say"
                      aria-label="Teleprompter script"
                    />
                    {guideId && (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <label className="flex flex-col gap-1 text-xs font-semibold">
                          Length
                          <select
                            className="min-h-9 rounded-lg border border-line-strong bg-surface px-2 font-normal"
                            value={length}
                            onChange={(e) => setLength(Number(e.target.value))}
                          >
                            {SCRIPT_LENGTHS.map((l) => (
                              <option key={l.s} value={l.s}>
                                {l.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <input
                          className="min-h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-sm"
                          placeholder="Anything to cover (optional)"
                          aria-label="Notes for the script"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                        />
                        <button type="button" className={btn.secondary} onClick={() => void writeScript()} disabled={writing}>
                          <Icon name="spark" className="size-4" /> {writing ? "Writing…" : script ? "Draft again" : "Draft with Claude"}
                        </button>
                      </div>
                    )}
                    <p className="mt-1 text-xs text-ink-muted">
                      {guideId
                        ? "Claude drafts from what this page says. Read it through and make it sound like you."
                        : "It starts with the card’s own words. Change it to sound like you, or paste your own."}
                    </p>
                  </details>
                )}
              </section>
            </div>
          </>
        )}

        {(stage === "review" || stage === "saving") && clip && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-3">
              <video
                ref={review}
                src={clip.url}
                controls
                playsInline
                className={cx("rounded-2xl bg-black", isVertical ? "mx-auto aspect-[9/16] max-h-[60vh] w-auto max-w-full object-cover" : "aspect-video w-full")}
                style={isVertical ? { objectPosition: `${cropX}% 50%` } : undefined}
                onTimeUpdate={(e) => {
                  if (e.currentTarget.currentTime > trim.end + 0.05) e.currentTarget.pause();
                }}
              />
              {isVertical && (
                <label className="flex flex-col gap-1 rounded-2xl border border-line p-3 text-sm">
                  <span className="font-semibold">Crop position</span>
                  <span className="text-xs text-ink-muted">Move the 9:16 window left or right to keep you in view. The full recording is kept.</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={cropX}
                    onChange={(e) => setCropX(Number(e.target.value))}
                    aria-valuetext={cropX < 40 ? "Left" : cropX > 60 ? "Right" : "Centre"}
                    className="accent-[var(--color-action)]"
                  />
                </label>
              )}
              <p className="text-sm text-ink-muted">
                {clock(clip.seconds)} recorded{trim.start > 0.05 || trim.end < clip.seconds - 0.05 ? `; ${clock(trim.end - trim.start)} after trimming` : ""}.
              </p>
              <fieldset className="rounded-2xl border border-line p-3">
                <legend className="px-1 text-sm font-semibold">Trim</legend>
                <p className="text-xs text-ink-muted">Learners see only the part between these points. The recording itself isn’t cut.</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm">
                    Starts at {clock(trim.start)}
                    <input
                      type="range"
                      min={0}
                      max={clip.seconds}
                      step={0.1}
                      value={trim.start}
                      onChange={(e) => {
                        const start = Math.min(Number(e.target.value), trim.end - 1);
                        setTrim((t) => ({ ...t, start: Math.max(0, start) }));
                        if (review.current) review.current.currentTime = Math.max(0, start);
                      }}
                      className="accent-[var(--color-action)]"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Ends at {clock(trim.end)}
                    <input
                      type="range"
                      min={0}
                      max={clip.seconds}
                      step={0.1}
                      value={trim.end}
                      onChange={(e) => {
                        const end = Math.max(Number(e.target.value), trim.start + 1);
                        setTrim((t) => ({ ...t, end: Math.min(clip.seconds, end) }));
                        if (review.current) review.current.currentTime = Math.min(clip.seconds, end);
                      }}
                      className="accent-[var(--color-action)]"
                    />
                  </label>
                </div>
                <button type="button" className={cx(btn.quiet, "mt-2")} onClick={playTrimmed}>
                  <Icon name="play" className="size-4" /> Play the trimmed video
                </button>
              </fieldset>
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-3">
                {poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={poster.url} alt="The chosen thumbnail" className="h-16 w-28 rounded-lg bg-muted object-cover" />
                ) : (
                  <span className="grid h-16 w-28 place-items-center rounded-lg bg-muted text-xs text-ink-muted">No thumbnail</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Thumbnail</p>
                  <p className="text-xs text-ink-muted">Pause the video on a good frame, then use it. Otherwise the frame showing when you save is used.</p>
                </div>
                <button type="button" className={btn.secondary} onClick={async () => setPoster(await grabFrame())}>
                  <Icon name="image" className="size-4" /> Use this frame
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <section aria-label="Captions" className="flex flex-col gap-2 rounded-2xl border border-line p-3">
                <h3 className="font-semibold">Captions</h3>
                {cues.length ? (
                  <>
                    <p className="text-xs text-ink-muted">Written as you spoke. Correct any words that are wrong; the timing stays.</p>
                    <ol className="flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1">
                      {cues.map((c, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-2 w-10 shrink-0 text-xs tabular-nums text-ink-muted">{clock(c.start)}</span>
                          <textarea
                            aria-label={`Caption at ${clock(c.start)}`}
                            className="min-h-10 w-full rounded-lg border border-line-strong bg-surface p-1.5 text-sm"
                            rows={2}
                            value={c.text}
                            onChange={(e) => setCues((all) => all.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                          />
                        </li>
                      ))}
                    </ol>
                  </>
                ) : (
                  <p className="text-sm text-ink-muted">
                    {captionNote ?? "No speech was picked up for captions."} You can add a WebVTT captions file in the panel after saving.
                  </p>
                )}
              </section>
              <label className="flex flex-col gap-1 rounded-2xl border border-line p-3">
                <span className="font-semibold">Transcript</span>
                <span className="text-xs text-ink-muted">Shown under the video for anyone who can’t listen. Check it reads well.</span>
                <textarea
                  className="mt-1 min-h-32 w-full rounded-lg border border-line-strong bg-surface p-2 text-sm"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                />
                {cues.length > 0 && (
                  <button type="button" className={cx(btn.quiet, "self-start")} onClick={() => setTranscript(cues.map((c) => c.text.trim()).join(" "))}>
                    Rebuild from the captions
                  </button>
                )}
              </label>
              <label className="flex items-start gap-2 rounded-2xl bg-tealtint p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-action)]"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  <span className="font-semibold">Everyone and everything in this video may be shared with learners.</span> Anyone who appears has agreed, and
                  no client names, details or other private information can be seen or heard.
                </span>
              </label>
              {problem && (
                <p role="alert" className="rounded-xl bg-orange/10 p-3 text-sm">
                  {problem}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!consent || stage === "saving"}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover disabled:opacity-45"
                >
                  <Icon name="check" className="size-4" /> {stage === "saving" ? saveStep || "Saving…" : "Save to the page"}
                </button>
                <button type="button" className={btn.secondary} onClick={() => void retake()} disabled={stage === "saving"}>
                  <Icon name="refresh" className="size-4" /> Record again
                </button>
              </div>
              <p className="text-xs text-ink-muted">It’s added to your draft. Learners see it only once the guide is published.</p>
            </div>
          </div>
        )}

        {problem && stage !== "review" && stage !== "saving" && (
          <p role="alert" className="rounded-xl bg-orange/10 p-3 text-sm">
            {problem}
          </p>
        )}
      </div>
    </div>
  );
}
