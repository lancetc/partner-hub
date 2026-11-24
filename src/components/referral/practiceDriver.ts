import { api } from "@/lib/api";
import { caseFile, cleanNote, cuesNow, emptyNote, endCall, noteFilled, NOTE_ORDER, openCheck, type FamilyNote } from "@/lib/familyCall";
import {
  claimCorrection,
  claimState,
  detailsProblem,
  engineOf,
  scenarioCard,
  STAGE_ORDER,
  STAGES,
  startStudio,
  STUDIO_ENGINE_VERSION,
  STUDIO_PROMPT_VERSION,
  STUDIO_RUBRIC_VERSION,
  studioResult,
  studioTurn,
  type ApprovedClaim,
  type Stage,
  type StudioDebrief,
  type StudioScenario,
  type StudioState,
} from "@/lib/referralStudio";
import type { AttemptView, PracticeView, TranscriptTurn } from "@/server/referralStudio";

/*
  How the practice screens talk to the engine: the server (the Work Tool or a Magazine block), or, in the editor's
  preview, the same pure engine run here on the author's copy, on the reviewed script, storing nothing.
*/

/** A key for an idempotent save or turn. getRandomValues works on a plain-http origin too, where randomUUID doesn’t. Only ever called from a handler. */
export const newKey = (prefix: string) =>
  `${prefix}-${Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("")}`;

export type Driver = { load: () => Promise<PracticeView>; act: (body: Record<string, unknown>) => Promise<PracticeView> };

export const serverDriver = (url: string, extra: Record<string, unknown> = {}): Driver => {
  const q = extra.blockId ? `?block=${encodeURIComponent(String(extra.blockId))}` : "";
  return {
    load: async () => {
      const v = await api<PracticeView | { practice: PracticeView }>(`${url}${q}`);
      return "practice" in v ? v.practice : v;
    },
    act: (body) => api<PracticeView>(url, { body: { ...extra, ...body } }),
  };
};

type Local = {
  sc: StudioScenario;
  stage: Stage;
  st: StudioState;
  transcript: TranscriptTurn[];
  note: FamilyNote;
  status: "active" | "submitted" | "completed" | "exited";
  debrief: StudioDebrief | null;
  n: number;
};

/** The editor's preview: the same engine and screens, here in the browser, on the reviewed script. Nothing is stored or sent. */
export function localDriver(scenarios: StudioScenario[], register: ApprovedClaim[], today: string): Driver {
  let cur: Local | null = null;
  let count = 0;
  const view = (): PracticeView => {
    const claims = register.map((c) => {
      const corr = claimCorrection(c, today);
      return {
        id: c.id,
        topic: c.topic,
        text: corr.usable ? corr.text : "",
        label: corr.label,
        state: claimState(c, today),
        source: c.evidence,
        owner: c.owner,
      };
    });
    let current: AttemptView | null = null;
    if (cur) {
      const eng = engineOf(cur.sc, cur.stage, register, today);
      const rule = cur.st.engine.safetyRule ? cur.sc.roleplay.safety.find((r) => r.id === cur!.st.engine.safetyRule) : undefined;
      current = {
        attemptId: `preview-${count}`,
        attemptNo: count,
        scenarioId: cur.sc.id,
        stage: cur.stage,
        stageLabel: STAGES[cur.stage],
        status: cur.status,
        screen:
          cur.status === "submitted" || cur.status === "completed" ? "debrief" : cur.status === "exited" ? "left" : cur.st.engine.ended ? "close" : "talk",
        caller: "script",
        retain: false,
        call: {
          turn: cur.st.engine.turn,
          minTurns: cur.sc.roleplay.minTurns,
          maxTurns: cur.sc.roleplay.maxTurns,
          ended: cur.st.engine.ended,
          safety: rule ? { label: rule.label, guidance: rule.guidance } : null,
        },
        transcript: cur.transcript,
        evidence: caseFile(eng, cur.st.engine).map((x) => ({ id: x.id, label: x.label, opened: x.opened, facts: x.facts })),
        cues: cur.st.engine.ended ? [] : cuesNow(eng, cur.st.engine),
        notice: "",
        note: cur.note,
        debrief: cur.debrief,
        purged: false,
        earlierVersion: false,
      };
    }
    return {
      place: "magazine",
      scenarios: scenarios.map(scenarioCard),
      stages: STAGE_ORDER.map((s) => ({ stage: s, label: STAGES[s] })),
      ai: false,
      claims,
      current,
      attempts: count,
      toolAccess: false,
      versions: { engine: STUDIO_ENGINE_VERSION, prompt: STUDIO_PROMPT_VERSION, rubric: STUDIO_RUBRIC_VERSION },
      referralJourney: "/magazine/which-referrals-become-active-clients",
    };
  };
  const fail = (m: string) => Promise.reject(new Error(m));
  return {
    load: async () => view(),
    act: async (b) => {
      switch (b.action) {
        case "start": {
          const sc = scenarios.find((x) => x.id === b.scenarioId);
          const stage = b.stage as Stage;
          if (!sc || !sc.variants.some((v) => v.stage === stage)) return fail("Choose one of the stages offered for this referrer.");
          count += 1;
          cur = {
            sc,
            stage,
            st: startStudio(sc, stage, register, { cues: b.cues !== false }),
            transcript: [],
            note: emptyNote(),
            status: "active",
            debrief: null,
            n: 0,
          };
          return view();
        }
        case "evidence":
          if (cur) cur.st = { ...cur.st, engine: openCheck(engineOf(cur.sc, cur.stage, register), cur.st.engine, String(b.section)) };
          return view();
        case "turn": {
          if (!cur || cur.st.engine.ended) return view();
          const text = String(b.text ?? "").trim();
          const bad = detailsProblem(text);
          if (bad) return fail(bad);
          if (text.length < 2) return fail("Say or type something first.");
          const r = studioTurn(cur.sc, register, cur.st, { text, mode: "text" });
          cur.st = r.state;
          cur.transcript = [
            ...cur.transcript,
            { n: r.out.eval.n, turnId: String(b.turnId), mode: "text", text, heard: "", reply: r.out.authored, by: r.out.safety ? "safety" : "script", at: "" },
          ];
          return view();
        }
        case "end":
          if (cur) {
            cur.st = { ...cur.st, engine: endCall(cur.sc, cur.st.engine, b.how === "exit" ? "exit" : "end") };
            if (b.how === "exit") cur.status = "exited";
          }
          return view();
        case "note":
          if (cur) cur.note = cleanNote(b.note);
          return view();
        case "submit": {
          if (!cur) return view();
          const note = cleanNote(b.note);
          if (!NOTE_ORDER.some((k) => noteFilled(note, k)) && !note.actions.length)
            return fail("Write down the next step, or choose at least one, before you see the debrief.");
          cur.note = note;
          cur.debrief = studioResult(cur.sc, register, cur.st, note, today);
          cur.status = "submitted";
          return view();
        }
        case "viewed":
          if (cur && cur.status === "submitted") cur.status = "completed";
          return view();
        case "delete":
          cur = null;
          return view();
        default:
          return view();
      }
    },
  };
}
