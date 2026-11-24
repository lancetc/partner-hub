"use client";

import { useRef } from "react";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";

/*
  "The thinking behind the Atlas": a text button in the Atlas header and the modal it opens. It runs from the
  research the Atlas draws on, through the design decisions that follow from it, to how to use it in a working week.
  Sources are listed at the end; claims are kept to what those sources say.
*/

type Stage = "Theory" | "Design" | "Practice";
type Idea = { stage: Stage; title: string; body: string[]; source?: string; soWhat: string };

const IDEAS: Idea[] = [
  {
    stage: "Theory",
    title: "We learn the work from each other",
    body: [
      "Lave and Wenger describe learning as taking part in a community of practice: a group of people who share a concern and get better at it by working alongside one another. Newcomers start at the edges, watching and doing smaller things, and move towards the centre as they gain confidence. Wenger calls this a shared repertoire: the stories, shortcuts and ways of talking that a group builds up.",
      "Care work fits this well. Much of what makes a good coordinator or Care Partner is knowing how things go in practice, and that is hard to write down.",
    ],
    source: "Lave and Wenger (1991); Wenger (1998)",
    soWhat: "The Atlas treats the community as the curriculum: it helps you find the people whose practice you can learn from.",
  },
  {
    stage: "Theory",
    title: "Knowing who knows what",
    body: [
      "Wegner’s idea of transactive memory is that a group remembers more than any one person in it, as long as people know who holds which piece. You don’t need to know everything about hospital discharge if you know who does.",
      "Cross and Parker found that in organisations, much of the real work moves through informal networks that rarely appear on an org chart. People who know who to ask get unstuck faster.",
    ],
    source: "Wegner (1987); Cross and Parker (2004)",
    soWhat: "Topics, “Can help” and “Looking for help” make that knowledge visible: a directory of who knows what, not just who works where.",
  },
  {
    stage: "Theory",
    title: "New ideas travel through weaker ties",
    body: [
      "Granovetter showed that people often hear about new opportunities through acquaintances rather than close friends. Our close circle tends to know what we already know; people further out bring something different.",
      "Putnam makes a related distinction between bonding connections, within a group, and bridging connections, across groups. Both matter, but bridging is what links a coordinator in Warrnambool with a business owner in Toowoomba.",
    ],
    source: "Granovetter (1973); Putnam (2000)",
    soWhat: "The Atlas deliberately shows people beyond your team and your town, and explains what you have in common with them.",
  },
  {
    stage: "Theory",
    title: "Common ground, not sameness",
    body: [
      "McPherson and colleagues reviewed decades of research showing that people mostly connect with others like themselves, by role, background and place. This is called homophily. It makes networks comfortable, but it can also keep useful knowledge in separate pockets.",
    ],
    source: "McPherson, Smith-Lovin and Cook (2001)",
    soWhat:
      "So the Atlas matches people by topic, not by job title. A client home from hospital, a community nurse and a business owner can share common ground on discharge, even though they’d rarely be in the same meeting.",
  },
  {
    stage: "Design",
    title: "Belonging, not scoreboards",
    body: [
      "Self-determination theory (Ryan and Deci) identifies three needs behind lasting motivation: autonomy, competence and relatedness, meaning feeling connected to others. Rewards and rankings can push motivation outward, towards the score rather than the work.",
    ],
    source: "Ryan and Deci (2000)",
    soWhat: "The Atlas is about relatedness, so it has no points, ranks or leaderboards. Nobody is “top of the map”.",
  },
  {
    stage: "Design",
    title: "Privacy by design",
    body: [
      "Cavoukian’s Privacy by Design asks for privacy as the default, built in rather than added later. Nissenbaum’s idea of contextual integrity adds that information should move only in ways that fit where it was shared. A suburb named among colleagues is one thing; a pin on a street is another.",
      "The Australian Privacy Principles ask organisations to collect only what they reasonably need (APP 3).",
    ],
    source: "Cavoukian (2009); Nissenbaum (2004); Privacy Act 1988, Schedule 1",
    soWhat:
      "So the Atlas shows towns only, never addresses. It never asks your device where you are: “Near a town” starts from a town you choose. The map is drawn by the Hub itself, so no map company learns who is looking where.",
  },
  {
    stage: "Design",
    title: "A map that everyone can use",
    body: [
      "A map is a visual way in, and not the only one. The Web Content Accessibility Guidelines (WCAG 2.2) ask that information isn’t carried by colour alone, that the same content is available without the picture, and that motion can be reduced.",
    ],
    source: "W3C (2023)",
    soWhat:
      "So the List view shows everything the map does. Every face is a labelled button, the colours have a key and a written group, and pins don’t animate for people who have asked for reduced motion.",
  },
  {
    stage: "Practice",
    title: "Why start with Digital Members",
    body: [
      "The first people on the Atlas are fictional: the clients, families and colleagues you meet in training. That lets you practise finding common ground, and see what the Atlas shows and hides, before any real person is on it. When colleagues join, the same rules apply: town only, their own choice, and no scores.",
    ],
    soWhat: "Treat it as a rehearsal space. The habits it builds are the ones you’ll use with real people.",
  },
  {
    stage: "Practice",
    title: "Using it in your week",
    body: [],
    soWhat: "",
  },
];

const WEEK = [
  {
    when: "Before a tricky discharge",
    what: "Pick Hospital discharge as the topic. See who talks about it, and open the profiles of the people who can help.",
  },
  { when: "New to a region", what: "Choose Near a town and start from where you’ll be working. See who’s nearby and what they deal with." },
  { when: "Stuck on a business question", what: "Switch to Can help, pick Growing a business, and read how others approach it before you decide." },
  { when: "After a scenario", what: "Find the person you just met on the map. Read what you have in common, or chat with them to get to know them." },
];

const SOURCES = [
  "Cavoukian, A. (2009). Privacy by Design: The 7 Foundational Principles. Information and Privacy Commissioner of Ontario.",
  "Cross, R., & Parker, A. (2004). The Hidden Power of Social Networks. Harvard Business School Press.",
  "Granovetter, M. S. (1973). The strength of weak ties. American Journal of Sociology, 78(6), 1360–1380.",
  "Lave, J., & Wenger, E. (1991). Situated Learning: Legitimate Peripheral Participation. Cambridge University Press.",
  "McPherson, M., Smith-Lovin, L., & Cook, J. M. (2001). Birds of a feather: Homophily in social networks. Annual Review of Sociology, 27, 415–444.",
  "Nissenbaum, H. (2004). Privacy as contextual integrity. Washington Law Review, 79(1), 119–157.",
  "Privacy Act 1988 (Cth), Schedule 1: Australian Privacy Principles.",
  "Putnam, R. D. (2000). Bowling Alone: The Collapse and Revival of American Community. Simon & Schuster.",
  "Ryan, R. M., & Deci, E. L. (2000). Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being. American Psychologist, 55(1), 68–78.",
  "W3C (2023). Web Content Accessibility Guidelines (WCAG) 2.2.",
  "Wegner, D. M. (1987). Transactive memory: A contemporary analysis of the group mind. In B. Mullen & G. R. Goethals (Eds.), Theories of Group Behavior. Springer.",
  "Wenger, E. (1998). Communities of Practice: Learning, Meaning, and Identity. Cambridge University Press.",
];

const STAGE_STYLE: Record<Stage, string> = {
  Theory: "bg-[#e8eef7] text-[#1d3b66] dark:bg-[#1d3b66] dark:text-[#dce6f5]",
  Design: "bg-tealtint text-[#05595a] dark:text-[#bfeaea]",
  Practice: "bg-[#fdf1d9] text-[#7a4b00] dark:bg-[#5a3a05] dark:text-[#fde3b0]",
};

export function AtlasRationale() {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#7fd4d4] underline decoration-[#7fd4d4]/50 underline-offset-4 hover:decoration-[#7fd4d4]"
      >
        <Icon name="bulb" className="size-4" />
        The thinking behind the Atlas
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="atlas-rationale-title"
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        className="m-auto max-h-[92vh] w-[min(52rem,calc(100vw-1.5rem))] max-w-none overflow-y-auto overscroll-contain rounded-3xl bg-bg p-0 text-left text-ink shadow-2xl backdrop:bg-[#0b1626]/70 backdrop:backdrop-blur-sm"
      >
        <header className="sticky top-0 z-10 flex items-start gap-3 bg-[#102a43] px-6 py-5 text-white sm:px-8">
          <div className="flex-1">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#7fd4d4]">From theory to practice</p>
            <h2 id="atlas-rationale-title" className="mt-1 font-serif text-2xl font-semibold sm:text-3xl">
              The thinking behind the Atlas
            </h2>
            <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-semibold" aria-label="How this is organised">
              {(["Theory", "Design", "Practice"] as Stage[]).map((s, i) => (
                <li key={s} className="flex items-center gap-1.5">
                  {i > 0 && <Icon name="arrow-right" className="size-3.5 text-white/50" />}
                  <span className={cx("rounded-full px-2.5 py-0.5", STAGE_STYLE[s])}>{s}</span>
                </li>
              ))}
            </ol>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => dialog.current?.close()}
            className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-white/10"
          >
            <Icon name="close" className="size-5" />
          </button>
        </header>

        <div className="px-6 py-6 sm:px-8">
          <p className="max-w-3xl text-[1.05rem] leading-relaxed">
            The Atlas is a map of people and what they know, not of places. It rests on a simple idea from learning research: much of what makes someone good at
            care work is learned from other people. Here is the research it draws on, the design choices that follow from it, and how to use it in a working
            week.
          </p>

          <ol className="mt-6 flex flex-col gap-5">
            {IDEAS.map((idea, i) => (
              <li key={idea.title} className="grid gap-3 rounded-3xl border border-line bg-surface p-5 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
                <span className="grid size-10 place-items-center rounded-full bg-[#102a43] font-mulish text-sm font-extrabold text-white" aria-hidden>
                  {i + 1}
                </span>
                <div>
                  <p
                    className={cx("inline-block rounded-full px-2.5 py-0.5 text-[0.7rem] font-extrabold uppercase tracking-[0.12em]", STAGE_STYLE[idea.stage])}
                  >
                    {idea.stage}
                  </p>
                  <h3 className="mt-2 font-serif text-xl font-semibold">{idea.title}</h3>
                  {idea.body.map((p) => (
                    <p key={p.slice(0, 24)} className="mt-2 leading-relaxed text-ink-muted">
                      {p}
                    </p>
                  ))}
                  {idea.title === "Using it in your week" ? (
                    <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                      {WEEK.map((w) => (
                        <div key={w.when} className="rounded-2xl bg-muted p-4">
                          <dt className="font-semibold">{w.when}</dt>
                          <dd className="mt-1 text-sm text-ink-muted">{w.what}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="mt-3 border-l-4 border-[#fab53d] pl-3 font-medium">
                      <span className="sr-only">What this means for the Atlas: </span>
                      {idea.soWhat}
                    </p>
                  )}
                  {idea.source && <p className="mt-2 text-xs text-ink-muted">{idea.source}</p>}
                </div>
              </li>
            ))}
          </ol>

          <details className="mt-6 rounded-2xl bg-muted p-4">
            <summary className="cursor-pointer font-semibold">Sources</summary>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-ink-muted">
              {SOURCES.map((s) => (
                <li key={s} className="pl-6 -indent-6">
                  {s}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </dialog>
    </>
  );
}
