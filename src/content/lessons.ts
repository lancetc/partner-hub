import type { IconName, VisualVariant } from "./stories";
import type { IconName as AnyIcon } from "@/components/Icon";
import type { GradientId } from "./gradients";
import type { ThemeId } from "./themes";

/*
  Portable lesson format: stable node ids, typed card payloads and explicit transitions
  (PRD sections 7 and 14). Scenarios, rates and processes are illustrative demo content.
*/

/** Synthesia's rendered file for the vertical presenter introduction (share.synthesia.io/d17ebdc9-…). */
const PRESENTER_MP4 = "https://synthesia-ttv-data.s3-eu-west-1.amazonaws.com/video_data/d17ebdc9-8f64-4630-ad37-24747e308796/transfers/rendered_video.mp4";

export type Tone = "teal" | "navy" | "warm" | "gold" | "sky";

export type CardVisual =
  | {
      kind: "illustration";
      variant: VisualVariant;
      tone: Tone;
      icon: IconName;
      alt: string;
      photo?: {
        src: string;
        width: number;
        height: number;
        position?: string;
        /** Stock photos and GIFs keep their maker's credit (Pexels and GIPHY ask for one). */
        credit?: { name: string; url: string; source: "Pexels" | "GIPHY"; page?: string };
        /** A GIF from GIPHY: `src` is its still frame, played as a muted MP4 loop that can be paused. */
        animated?: { mp4: string };
      };
      /** A photo sits at the top of the card (default) or fills the whole card behind the text. */
      layout?: "top" | "background";
      /** Text colour over a full-background photo. "auto" (default) picks light or dark from the photo. */
      textTone?: "auto" | "light" | "dark";
    }
  | { kind: "words"; words: string[]; tone: Tone; alt: string }
  | {
      kind: "presenter";
      name: string;
      synthetic: boolean;
      tone: Tone;
      alt: string;
      /** Approved photograph shown as the poster instead of the drawn presenter. */
      photo?: { src: string; width: number; height: number };
      /** Presenter video; played only when the learner presses play. */
      video?: {
        /** Synthesia (share link id), YouTube (video id) or an ElevenLabs AI presenter made in the editor (generation id). */
        provider: "synthesia" | "youtube" | "elevenlabs";
        id: string;
        title: string;
        /** Vertical (9:16) videos fill the whole card, with no text. */
        orientation?: "landscape" | "portrait";
        /** The rendered MP4, played in our own player so it can fill the card. */
        src?: string;
        /** Still shown before play (for an AI presenter, the presenter's photo). */
        poster?: string;
        /** AI presenter: the script it was made from, so the editor can tell when the words have changed since. */
        scriptHash?: string;
        /** AI presenter: the words spoken and when, for captions that follow the voice. */
        captions?: { spoken: string; words: { from: number; to: number; start: number; end: number }[] };
      };
    }
  /** Client, coordinator and Trilogy relationship triangle; `labels` appear one by one. */
  | { kind: "triangle"; highlight: "client" | "coordinator" | "trilogy" | "all"; labels?: string[]; alt: string }
  /** The person at the centre with the people around them; a looping highlight moves between them. */
  | { kind: "orbit"; centre: string; centreNote?: string; nodes: { label: string; icon: IconName }[]; alt: string }
  | { kind: "none" };

type Base = {
  id: string;
  /** Main learning beat this card belongs to; consequence cards share their beat. */
  beat: number;
  label: string;
  heading: string;
  body: string;
  visual: CardVisual;
  /** Optional longer reference opened in a detail view. */
  detail?: { title: string; paragraphs: string[] };
  /** Separate narration script with a transcript, for cards that aren't presenter or audio cards. */
  narration?: string;
  /** Recorded voice file for this card's script (any TTS or studio tool). Falls back to browser speech. */
  audioSrc?: string;
  /** Official source for the card's content, shown as a link under the text. */
  source?: { title: string; url: string };
  /**
    A picture that's part of the content, inside the text: under the body (default) or above it.
    Shown whole, uncropped, unless `fit` is "fill" (a wide, cropped frame). Learners can tap it to see
    it full screen, so it works for reference pictures such as a form or a diagram. Separate from `visual`.
  */
  figure?: {
    src: string;
    width: number;
    height: number;
    alt: string;
    caption?: string;
    credit?: { name: string; url: string; source: "Pexels" | "GIPHY"; page?: string };
    /** A GIF from GIPHY: `src` is its still frame. */
    animated?: { mp4: string };
    placement?: "below" | "above";
    /** "full" runs edge to edge across the card, whole and uncropped. */
    fit?: "whole" | "fill" | "full";
  };
  /**
    A PDF that's part of the content (a form, a policy, a fact sheet): a tile in the text with its first
    page, opening the document inside the lesson. `required` keeps Continue locked until the learner has
    opened it ("open"), or reached its last page ("end").
  */
  pdf?: { src: string; title: string; bytes?: number; pages?: number; placement?: "below" | "above"; required?: "open" | "end" };
  /** Short on-screen points: `chips` for an overview list, `tiles` for a few key ideas with icons. */
  /** Item text may use **bold**, *italic* and [links](https://…) (lib/richText). */
  keyPoints?: { title?: string; style: "chips" | "tiles"; items: { text: string; icon?: AnyIcon }[]; tip?: string };
  /** Consequence styling for cards that show the result of a poorer choice. */
  emphasis?: "consequence" | "recovery";
  /** Learners can read and add comments on this card (tips, local know-how, questions). On unless set to false. */
  comments?: boolean;
  /**
    Content that can go out of date (a rate, a date, a rule): when to check it, what to check, and
    where. Shows in Admin > Content review, and authors are reminded before it's due.
  */
  check?: { by: string; note?: string; source?: { title: string; url: string } };
  /** A gradient behind the whole card. A full-background photo takes precedence. */
  background?: { gradient: GradientId };
  /**
    Where the text sits on the card. Defaults to the top, or the bottom over a full-background photo.
    Offered on content cards.
  */
  textPosition?: "top" | "center" | "bottom";
  /** Learners can't continue or swipe on until the card's audio, video or activity is finished. */
  requireComplete?: boolean;
  /** One or two talking-head clips (often recorded on a webcam), shown as circles at the top of the card. */
  bubbles?: { src: string; poster?: string; label?: string }[];
};

export type Option = {
  id: string;
  label: string;
  /** Next node; omit with `stay` to keep the learner here and show feedback. */
  next?: string;
  feedback?: string;
  stay?: boolean;
  /** Marks the better choice so a learner's first decision can be scored. */
  correct?: boolean;
};

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: { id: string; label: string }[];
  correct: string;
  feedback: { correct: string; incorrect: string };
};

export type Card =
  | (Base & { type: "presenter"; transcript: string; durationSec: number; next: string })
  | (Base & { type: "image"; next: string; cta?: string })
  | (Base & { type: "audio"; script: string; next: string })
  /** A dedicated audio card: the whole card is about listening. Plays when the learner presses Play. */
  | (Base & { type: "listen"; script: string; next?: string })
  | (Base & {
      type: "calculator";
      calc: {
        min: number;
        max: number;
        step: number;
        initial: number;
        rate: number;
        formula: string;
        assumptions: string;
        version: string;
      };
      next: string;
    })
  /**
    A widget: an animated diagram, calculator or small game that Claude built from the author's
    description. It runs in a sandboxed frame with no network (lib/widgetFrame.ts).
  */
  | (Base & {
      type: "widget";
      widget: {
        /** What the author asked for, kept so they can ask for changes later. Not shown to learners. */
        request: string;
        /** The widget: an HTML fragment with its own style and script. */
        html: string;
        /** What it shows and does, for screen readers. */
        alt: string;
      };
      next?: string;
    })
  | (Base & { type: "decision"; prompt: string; options: Option[] })
  | (Base & {
      type: "response";
      prompt: string;
      modelResponse: string;
      visibility: string;
      next: string;
    })
  | (Base & {
      type: "quiz";
      questions: QuizQuestion[];
      /** Card after a pass; omit to finish here. */
      next?: string;
      /**
        Assessment mode, for compliance training: marked all at once against a pass mark (a percentage),
        no feedback until submitted, questions and options shuffled for each attempt, and a full retake
        after a fail. Scores and attempts are kept for reports.
      */
      assessment?: { passMark: number };
    })
  /**
    An insight wall: learners answer a question, and only after posting do they see what others wrote.
    `anonymous` hides names; otherwise posts show a first name and role.
  */
  | (Base & { type: "wall"; prompt: string; placeholder?: string; anonymous?: boolean; next?: string })
  /**
    A checklist learners tick off: a routine to remember, or steps to confirm. Each item can have a
    short note that shows once it's ticked. With `requireAll`, every item must be ticked to continue.
  */
  | (Base & {
      type: "checklist";
      prompt: string;
      items: { id: string; text: string; note?: string }[];
      requireAll?: boolean;
      next?: string;
    })
  /**
    A tidy drawer of further reading: PDFs, websites and toolkits. It starts closed so it doesn't
    interrupt the lesson; learners open it if they want, and can always continue.
  */
  | (Base & {
      type: "resources";
      /** No longer shown (from when resources sat in a drawer); kept so older lessons still load. */
      drawerLabel?: string;
      items: {
        id: string;
        kind: "pdf" | "link" | "toolkit" | "video";
        title: string;
        url: string;
        /** Who publishes it, e.g. "Aged Care Quality and Safety Commission". */
        source?: string;
        description?: string;
        /** Uploaded PDFs: the file size, shown next to the title. */
        bytes?: number;
      }[];
      next?: string;
    })
  /**
    A picture with spots to tap. `explore` shows a marker on each spot; `find` hides them so the
    learner has to find each one (with a hint after a few misses). Each spot reveals a short note.
  */
  | (Base & {
      type: "hotspot";
      prompt: string;
      image: {
        src: string;
        width: number;
        height: number;
        alt: string;
        credit?: { name: string; url: string; source: "Pexels" | "GIPHY"; page?: string };
      } | null;
      mode: "explore" | "find";
      /** Positions are percentages of the picture's width and height; `r` is the tap area's radius as a percentage of its width. */
      spots: { id: string; x: number; y: number; r: number; label: string; text: string }[];
      /** How many spots learners need to find before they can continue. Defaults to all of them. */
      required?: number;
      next?: string;
    })
  /**
    A written answer checked by AI. Learners answer a question in their own words; Claude checks it
    against the author's criteria and gives feedback on each one. Answers aren't stored.
  */
  | (Base & {
      type: "written";
      prompt: string;
      /** Hint inside the answer box. */
      placeholder?: string;
      /** What a good answer covers. Each is marked met, partly met or not yet. */
      criteria: { id: string; text: string }[];
      /** Private notes for the AI: context, what to accept, what to ignore. Learners never see these. */
      guidance?: string;
      /** A strong answer. Guides the AI; shown to learners after feedback when `showExample` is on. */
      example?: string;
      showExample?: boolean;
      /** Shortest answer accepted, in words (default 10). */
      minWords?: number;
      /** Learners must meet every criterion to continue. After `maxAttempts` tries (default 3) they can move on anyway. */
      mustPass?: boolean;
      maxAttempts?: number;
      next?: string;
    })
  /** A question with no right answer. Learners vote, then see how everyone else answered. */
  | (Base & { type: "poll"; prompt: string; options: { id: string; label: string }[]; next?: string })
  /**
    A confidence rating: learners give 1 to 5 stars, then see the average and spread. Like a poll,
    nobody sees how others rated until they've rated themselves.
  */
  | (Base & { type: "rating"; prompt: string; lowLabel?: string; highLabel?: string; next?: string })
  | (Base & {
      type: "summary";
      action: string;
      reference?: { title: string; url: string; issuer: string };
      /** Recap lines shown as a list. */
      points?: string[];
      /** Official resources, shown behind a "View official resources" button. */
      references?: { title: string; url: string; issuer: string }[];
      cta: string;
    });

export type CompletionRule = { type: "quiz"; cardId: string; label: string } | { type: "acknowledge"; cardId: string; label: string };

export type Lesson = {
  slug: string;
  version: string;
  title: string;
  summary: string;
  outcome: string;
  /** `reinforcement` lessons are only delivered as steps in a learning sequence. */
  track: "core" | "partner" | "coordinator" | "briefing" | "reinforcement";
  minutes: number;
  beats: string[];
  start: string;
  nodes: Record<string, Card>;
  completion: CompletionRule;
  owner: string;
  reviewDate: string;
  /** Cover image for the lesson intro and Learning tiles; a photo replaces the pattern artwork. */
  visual: { variant: VisualVariant; tone: Tone; icon: IconName; alt?: string; photo?: { src: string; width: number; height: number; position?: string } };
  assignment?: { required: boolean; due?: string };
  /** Short message shown on the completion screen. */
  completionMessage?: string;
  /** Hold learners on a card until its audio has played to the end. On unless set to false. */
  holdForAudio?: boolean;
  /** The look of cards without their own background (see content/themes.ts). Classic white when not set. */
  theme?: ThemeId;
};

const extraTime: Lesson = {
  slug: "a-little-extra-time",
  version: "1.0-demo",
  theme: "rhythm",
  title: "A little extra time",
  summary: "What a longer visit means for cost, and what to check before you agree.",
  outcome: "Check the confirmation process before agreeing to extend a visit.",
  track: "partner",
  minutes: 3,
  beats: ["Welcome", "The visit", "Explore", "The impact", "Your choice", "Explain", "Quick check"],
  start: "welcome",
  completion: { type: "quiz", cardId: "check", label: "Answer both questions correctly" },
  owner: "Learning team (demo)",
  reviewDate: "2027-04-22",
  visual: {
    variant: "rings",
    tone: "teal",
    icon: "clock",
    alt: "An older woman laughing as a younger woman hugs her and kisses her cheek at a table at home, with a sun and heart house graphic",
    photo: { src: "/images/daut.webp", width: 1042, height: 938, position: "center top" },
  },
  assignment: { required: true, due: "2026-11-05" },
  nodes: {
    welcome: {
      id: "welcome",
      type: "presenter",
      beat: 0,
      label: "Welcome",
      heading: "A little extra time",
      body: "Sometimes a visit runs longer than planned. In about three minutes, see what that means and what to do before you agree.",
      visual: {
        kind: "presenter",
        name: "Ava",
        synthetic: true,
        tone: "teal",
        alt: "Presenter introduction poster",
        video: {
          provider: "synthesia",
          id: "d17ebdc9-8f64-4630-ad37-24747e308796",
          title: "Presenter introduction",
          orientation: "portrait",
          src: PRESENTER_MP4,
          poster: "/images/presenter-intro.jpg",
        },
      },
      transcript:
        "Hi, I'm Ava, a synthetic presenter for Trilogy Care. Every so often a client asks if you can stay a little longer. It feels like a kind thing to do, and often it is. But extra time changes the service and the cost. In this short lesson you'll work out what that change means and practise what to do next.",
      durationSec: 22,
      next: "visit",
    },
    visit: {
      id: "visit",
      type: "image",
      beat: 1,
      label: "The visit",
      heading: "A planned 60 minute visit",
      body: "Mara has a 60 minute cleaning visit each week. In this example, the rate is {{example_rate}} an hour, so the visit costs {{example_rate}}.",
      check: { by: "2026-10-01", note: "Confirm the example rate still looks realistic, and that the worked amounts on later cards still add up." },
      visual: {
        kind: "illustration",
        variant: "wave",
        tone: "sky",
        icon: "home",
        alt: "A smiling cleaner in a blue shirt and yellow gloves holding a mop and a caddy of cleaning supplies in a bright living room",
        photo: { src: "/images/cleaner.jpg", width: 1000, height: 667, position: "center 30%" },
      },
      detail: {
        title: "About this example",
        paragraphs: [
          "Mara is a fictional client. The $80 hourly rate is illustrative only. It is not Trilogy pricing and does not describe any entitlement.",
          "Real rates and service arrangements are set in each client’s agreement and care plan.",
        ],
      },
      next: "explore",
    },
    explore: {
      id: "explore",
      type: "calculator",
      beat: 2,
      label: "Explore",
      heading: "See how time changes the total",
      body: "Change the visit length. Try 90 minutes, then 120.",
      visual: { kind: "none" },
      calc: {
        min: 60,
        max: 120,
        step: 15,
        initial: 60,
        rate: 80,
        formula: "total = minutes ÷ 60 × hourly rate",
        assumptions: "Illustrative $80 hourly rate. Rounded to the nearest dollar. Does not imply extra services are approved.",
        version: "calc-time-cost-1",
      },
      next: "impact",
    },
    impact: {
      id: "impact",
      type: "image",
      beat: 3,
      label: "The impact",
      heading: "Thirty minutes adds $40",
      body: "At $80 an hour, staying an extra 30 minutes adds $40. That is a change to the service, not just a few spare minutes.",
      visual: {
        kind: "illustration",
        variant: "dots",
        tone: "gold",
        icon: "clock",
        alt: "An older couple smiling together on a couch at home, the woman hugging the man from behind",
        photo: { src: "/images/two.jpeg", width: 228, height: 152, position: "center 30%" },
      },
      next: "story",
    },
    story: {
      id: "story",
      type: "listen",
      beat: 3,
      label: "Real story (fictional)",
      requireComplete: true,
      heading: "“I almost stayed the extra hour.”",
      body: "A cleaning partner on the visit that changed how she handles requests.",
      visual: { kind: "none" },
      script:
        "I was nearly finished when Mrs Rossi asked if I could stay another hour and do the windows. I wanted to say yes on the spot. Instead I said I’d love to help, and rang the coordinator from her kitchen. It took two minutes. The extra time was added properly, she knew the cost before I started, and there was no surprise on her statement. Now I always check first.",
      next: "choice",
    },
    choice: {
      id: "choice",
      type: "decision",
      beat: 4,
      label: "Your choice",
      heading: "Mara asks you to stay longer",
      body: "“Could you stay another half hour and do the windows?”",
      prompt: "What do you do?",
      visual: {
        kind: "illustration",
        variant: "arc",
        tone: "teal",
        icon: "chat",
        alt: "An older couple smiling together on a couch at home, the woman hugging the man from behind",
        photo: { src: "/images/two.jpeg", width: 228, height: 152, position: "center 30%" },
      },
      options: [
        { id: "check", label: "Say you’re happy to check, and contact the coordinator first", next: "check-convo" },
        { id: "agree", label: "Agree and stay. It’s only 30 minutes", next: "agree-consequence" },
      ],
    },
    "check-convo": {
      id: "check-convo",
      type: "image",
      beat: 4,
      label: "What happens next",
      heading: "You check before you stay",
      body: "You tell Mara you’d like to help and contact the coordinator. They confirm whether the change can go ahead, and Mara knows what to expect.",
      visual: { kind: "illustration", variant: "petals", tone: "teal", icon: "chat", alt: "Illustration of a confirmed conversation" },
      emphasis: "recovery",
      next: "explain",
      cta: "Continue",
    },
    "agree-consequence": {
      id: "agree-consequence",
      type: "image",
      beat: 4,
      label: "What happens next",
      heading: "The extra time isn’t confirmed",
      body: "You stay and do the windows. Mara didn’t expect the extra $40, and the change hasn’t been confirmed or recorded.",
      visual: { kind: "illustration", variant: "dots", tone: "warm", icon: "clock", alt: "Illustration of an unconfirmed change" },
      emphasis: "consequence",
      next: "recover",
      cta: "What now?",
    },
    recover: {
      id: "recover",
      type: "decision",
      beat: 4,
      label: "Put it right",
      heading: "What could you do now?",
      body: "The visit has finished. You can still help sort this out.",
      prompt: "Choose your next step.",
      visual: { kind: "illustration", variant: "arc", tone: "sky", icon: "route", alt: "Illustration of a path forward" },
      options: [
        { id: "call", label: "Contact the coordinator today and explain what happened", next: "recovered" },
        {
          id: "leave",
          label: "Leave it. It was a small job",
          stay: true,
          feedback: "Leaving it means Mara may be surprised by the cost and nobody has a record of the change.",
        },
      ],
    },
    recovered: {
      id: "recovered",
      type: "image",
      beat: 4,
      label: "Sorting it out",
      heading: "You put it right",
      body: "You explain the extra time to the coordinator and agree what happens next. Next time, you’ll check before you stay.",
      visual: { kind: "illustration", variant: "petals", tone: "teal", icon: "heart", alt: "Illustration of a resolved situation" },
      emphasis: "recovery",
      next: "explain",
      cta: "Continue",
    },
    explain: {
      id: "explain",
      type: "audio",
      beat: 5,
      label: "Explain",
      heading: "Time, cost and confirmation",
      body: "More time means more cost. Check with the coordinator before you agree, so the client knows what to expect and the change is recorded.",
      visual: { kind: "words", words: ["Time", "Cost", "Confirm first"], tone: "navy", alt: "Key words: time, cost, confirm first" },
      script:
        "Here's the practical bit. When a client asks for extra time, the kind response is to say you'd like to help, then check. At our example rate, thirty minutes adds forty dollars. That might be fine, but the client should know before it happens, and the change needs to be confirmed through the coordinator so it's recorded properly. If you've already stayed, it's not too late. Contact the coordinator the same day and explain what happened.",
      next: "practise",
    },
    practise: {
      id: "practise",
      type: "written",
      beat: 5,
      label: "Your turn",
      heading: "Practise what you’d say",
      body: "Write it as you’d say it to the client. The AI checks it against what a good answer covers.",
      visual: { kind: "none" },
      prompt: "A client asks you to stay an extra 30 minutes to finish the windows. What would you say to them?",
      placeholder: "Write what you’d say, in your own words.",
      criteria: [
        { id: "c1", text: "Stays friendly and shows you’re happy to help" },
        { id: "c2", text: "Explains that a longer visit costs more from their budget" },
        { id: "c3", text: "Says you’ll check with their care coordinator before staying longer" },
      ],
      guidance:
        "The partner shouldn't agree to the extra time on the spot. Accept 'coordinator', 'care partner', 'Trilogy' or 'the office' as who they check with. Mentioning cost in plain words ('it'll cost a bit more') is enough; no exact figure is needed. Don't mark down spelling or grammar.",
      example:
        "I'd be glad to help with the windows. Staying longer adds to the cost of the visit, so let me quickly check with your care coordinator first, and we can book the extra time properly.",
      showExample: true,
      minWords: 12,
      next: "check",
    },
    check: {
      id: "check",
      type: "quiz",
      beat: 6,
      label: "Quick check",
      heading: "Check your understanding",
      body: "A new example. Answer both questions to finish.",
      visual: { kind: "none" },
      questions: [
        {
          id: "q1",
          prompt: "A 60 minute visit at $80 an hour is extended to 75 minutes. How much does the extra time add?",
          options: [
            { id: "a", label: "$15" },
            { id: "b", label: "$20" },
            { id: "c", label: "$40" },
          ],
          correct: "b",
          feedback: {
            correct: "Right. 15 minutes is a quarter of an hour, and a quarter of $80 is $20.",
            incorrect: "Not quite. 15 minutes is a quarter of an hour. A quarter of $80 is $20.",
          },
        },
        {
          id: "q2",
          prompt: "A different client asks you to stay longer to sort a cupboard. What should you do first?",
          options: [
            { id: "a", label: "Stay, then mention it in your visit note" },
            { id: "b", label: "Check with the coordinator before agreeing" },
            { id: "c", label: "Say no. Extra time is never possible" },
          ],
          correct: "b",
          feedback: {
            correct: "Yes. Checking first means the client knows what to expect and the change is confirmed.",
            incorrect: "Not quite. Extra time can be possible, but it needs to be confirmed with the coordinator first.",
          },
        },
      ],
    },
  },
};

const noticingChange: Lesson = {
  slug: "noticing-a-change",
  version: "1.0-demo",
  theme: "rhythm",
  title: "Noticing a change",
  summary: "Practise listening, checking and escalating when a client’s needs seem to change.",
  outcome: "Recognise a possible change in needs and follow the escalation process.",
  track: "coordinator",
  minutes: 4,
  beats: ["Welcome", "The call", "Your choice", "What you’d say", "Quick check"],
  start: "intro",
  completion: { type: "quiz", cardId: "check", label: "Answer the question correctly" },
  owner: "Care coordination lead (demo)",
  reviewDate: "2027-04-22",
  visual: {
    variant: "arc",
    tone: "sky",
    icon: "chat",
    alt: "Trilogy Care Portal banner reading: A new a way to access your Home Care Package information",
    photo: { src: "/images/tcp.png", width: 1200, height: 628, position: "center" },
  },
  assignment: { required: false },
  nodes: {
    intro: {
      id: "intro",
      type: "presenter",
      beat: 0,
      label: "Welcome",
      heading: "Noticing a change",
      body: "A routine call can tell you a lot. Practise what to do when something sounds different.",
      visual: {
        kind: "presenter",
        name: "Ava",
        synthetic: true,
        tone: "navy",
        alt: "Presenter introduction poster",
        video: {
          provider: "synthesia",
          id: "d17ebdc9-8f64-4630-ad37-24747e308796",
          title: "Presenter introduction",
          orientation: "portrait",
          src: PRESENTER_MP4,
          poster: "/images/presenter-intro.jpg",
        },
      },
      transcript:
        "Hi, I'm Ava, a synthetic presenter. Coordinators often hear the first signs that a client's needs are changing. This scenario is about slowing down, asking good questions and knowing when to escalate.",
      durationSec: 15,
      next: "call",
    },
    call: {
      id: "call",
      type: "image",
      beat: 1,
      label: "The call",
      heading: "Something sounds different",
      body: "On your weekly call, Mr Lee sounds tired, repeats a question and says he “hasn’t been bothering” with lunch.",
      visual: { kind: "illustration", variant: "wave", tone: "sky", icon: "chat", alt: "Illustration of a phone conversation" },
      next: "choice",
    },
    choice: {
      id: "choice",
      type: "decision",
      beat: 2,
      label: "Your choice",
      heading: "What do you do next?",
      body: "You have a few minutes left on the call.",
      prompt: "Choose your response.",
      visual: { kind: "illustration", variant: "arc", tone: "teal", icon: "chat", alt: "Illustration of a decision" },
      options: [
        { id: "open", label: "Ask open questions about his week, then check recent visit notes", next: "open-result" },
        { id: "reassure", label: "Reassure him and end the call. You’ll check next week", next: "reassure-result" },
      ],
    },
    "open-result": {
      id: "open-result",
      type: "image",
      beat: 2,
      label: "What happens next",
      heading: "You learn more",
      body: "He mentions a fall in the bathroom last week. Visit notes mention he seemed unsteady. You follow the escalation process the same day.",
      visual: { kind: "illustration", variant: "petals", tone: "teal", icon: "shield", alt: "Illustration of a supported outcome" },
      emphasis: "recovery",
      next: "say",
      cta: "Continue",
    },
    "reassure-result": {
      id: "reassure-result",
      type: "image",
      beat: 2,
      label: "What happens next",
      heading: "An important detail is missed",
      body: "A week later you learn he had a fall the day after your call. Asking more might have surfaced the risk sooner.",
      visual: { kind: "illustration", variant: "dots", tone: "warm", icon: "shield", alt: "Illustration of a missed signal" },
      emphasis: "consequence",
      next: "say",
      cta: "What could help",
    },
    say: {
      id: "say",
      type: "response",
      beat: 3,
      label: "What you’d say",
      heading: "Rehearse your question",
      body: "Write one open question you could ask Mr Lee.",
      prompt: "Your question",
      modelResponse: "“You sound a bit tired today. How has this week been for you, getting around the house and making meals?”",
      visibility: "Only you can see this response. It is saved on this device in the prototype.",
      visual: { kind: "none" },
      next: "check",
    },
    check: {
      id: "check",
      type: "quiz",
      beat: 4,
      label: "Quick check",
      heading: "Check your understanding",
      body: "One question to finish.",
      visual: { kind: "none" },
      questions: [
        {
          id: "q1",
          prompt: "A client mentions a recent fall during a routine call. What is the best next step?",
          options: [
            { id: "a", label: "Note it for the next scheduled review" },
            { id: "b", label: "Follow the escalation process the same day" },
            { id: "c", label: "Ask a family member to call you back" },
          ],
          correct: "b",
          feedback: {
            correct: "Yes. A fall is a sign that needs prompt follow-up through the agreed process.",
            incorrect: "Not quite. A recent fall needs prompt follow-up through the escalation process.",
          },
        },
      ],
    },
  },
};

const briefing: Lesson = {
  slug: "extra-time-briefing",
  version: "1.0-demo",
  theme: "rhythm",
  title: "Briefing: confirming extra visit time",
  summary: "What changed, who it affects and what to do, in five short cards.",
  outcome: "Know what to do from 3 November when a client asks for extra time.",
  track: "briefing",
  minutes: 2,
  beats: ["What changed", "Who it affects", "What to do", "Example", "Source"],
  start: "changed",
  completion: { type: "acknowledge", cardId: "source", label: "Acknowledge the briefing" },
  owner: "Head of Service Partnerships (demo)",
  reviewDate: "2027-04-20",
  visual: {
    variant: "rings",
    tone: "teal",
    icon: "clock",
    alt: "A younger woman and an older woman laughing over cups of tea at an outdoor table in the sunshine, with a heart graphic",
    photo: { src: "/images/mum.webp", width: 1042, height: 938, position: "center top" },
  },
  nodes: {
    changed: {
      id: "changed",
      type: "image",
      beat: 0,
      label: "What changed",
      heading: "Confirm first, then stay",
      body: "From 3 November, extending a planned visit needs confirmation through the coordinator before the extra time is delivered.",
      visual: { kind: "words", words: ["From 3 November", "Confirm first"], tone: "teal", alt: "Key words: from 3 November, confirm first" },
      detail: {
        title: "Status of this change",
        paragraphs: ["Announced, not yet in effect. Effective 3 November 2026 (demo).", "Previously, short extensions could be noted after the visit."],
      },
      next: "who",
    },
    who: {
      id: "who",
      type: "image",
      beat: 1,
      label: "Who it affects",
      heading: "Partners and coordinators",
      body: "Service partners who deliver scheduled visits, and coordinators who confirm changes.",
      visual: { kind: "illustration", variant: "grid", tone: "sky", icon: "people", alt: "Illustration of people" },
      next: "todo",
    },
    todo: {
      id: "todo",
      type: "image",
      beat: 2,
      label: "What to do",
      heading: "Check, confirm, record",
      body: "Tell the client you’re happy to check. Contact the coordinator. Stay only once it’s confirmed, and note what was agreed.",
      visual: { kind: "words", words: ["Check", "Confirm", "Record"], tone: "navy", alt: "Key words: check, confirm, record" },
      next: "example",
    },
    example: {
      id: "example",
      type: "image",
      beat: 3,
      label: "Example",
      heading: "A quick call first",
      body: "A client asks for 20 more minutes. You call the coordinator, who confirms. You stay, and record the confirmed change in your note.",
      visual: { kind: "illustration", variant: "arc", tone: "teal", icon: "chat", alt: "Illustration of a call" },
      next: "source",
    },
    source: {
      id: "source",
      type: "summary",
      beat: 4,
      label: "Source",
      heading: "Read the full process",
      body: "This briefing summarises the approved source. Read it for the full conditions and exceptions.",
      action: "From 3 November, confirm extra time with the coordinator before you stay.",
      reference: {
        title: "Service change confirmation process (demo document)",
        url: "https://trilogycare.com.au/",
        issuer: "Trilogy Care (demonstration source)",
      },
      visual: { kind: "none" },
      cta: "I understand",
    },
  },
};

const missionAndModel: Lesson = {
  slug: "our-mission-and-model",
  version: "1.1",
  theme: "rhythm",
  title: "Our Mission and Model",
  summary: "How the partnership between you and Trilogy Care works, and how to make it clear to your clients.",
  outcome: "Explain to a client who Trilogy Care is and how you work together.",
  track: "coordinator",
  minutes: 5,
  beats: [
    "Our mission",
    "The client at the centre",
    "The coordinator’s role",
    "Trilogy’s role",
    "Explaining the partnership",
    "Why Trilogy gets in touch",
    "A client conversation",
    "The consequence",
    "Check and takeaway",
  ],
  start: "welcome",
  completion: { type: "quiz", cardId: "check", label: "Answer the question correctly" },
  owner: "Partnerships team (draft)",
  reviewDate: "2027-04-22",
  visual: {
    variant: "petals",
    tone: "navy",
    icon: "people",
    alt: "An older woman smiling by a window at home, with purple flowers in the foreground and a home and heart graphic",
    photo: { src: "/images/paula.jpeg", width: 275, height: 183, position: "center 25%" },
  },
  assignment: { required: false },
  completionMessage: "Put the client first. Make the partnership clear.",
  nodes: {
    welcome: {
      id: "welcome",
      type: "presenter",
      beat: 0,
      label: "Our mission",
      heading: "Support independence and dignity at home.",
      body: "",
      visual: {
        kind: "presenter",
        name: "Ava",
        synthetic: true,
        tone: "teal",
        alt: "An older woman smiling by a window at home, with purple flowers in the foreground and a home and heart graphic",
        video: {
          provider: "synthesia",
          id: "d17ebdc9-8f64-4630-ad37-24747e308796",
          title: "Care on their terms: presenter introduction",
          orientation: "portrait",
          src: PRESENTER_MP4,
          poster: "/images/presenter-intro.jpg",
        },
      },
      transcript:
        "Our partnership has a shared purpose: supporting older people to maintain independence and dignity in their own homes, on their own terms. Together, we help clients access their Support at Home funding and manage their care plans and budgets. This lesson explains how the partnership works, and how to make it clear to your clients.",
      durationSec: 25,
      next: "client",
    },
    client: {
      id: "client",
      type: "audio",
      beat: 1,
      label: "The client at the centre",
      heading: "Their needs and choices guide the partnership.",
      body: "",
      visual: {
        kind: "triangle",
        highlight: "client",
        alt: "A triangle with the client at the top, highlighted, and the coordinator and Trilogy Care at the two lower corners",
      },
      script:
        "Picture the client at the top of this triangle. You and Trilogy Care work together to support them. Their needs and choices give the partnership its direction. As a coordinator, your time and energy are focused on understanding the person and helping their care arrangements reflect what matters to them.",
      next: "coordinator",
    },
    coordinator: {
      id: "coordinator",
      type: "audio",
      beat: 2,
      label: "The coordinator’s role",
      heading: "You coordinate care day to day.",
      body: "Stay close to the client. Work with Trilogy.",
      visual: {
        kind: "triangle",
        highlight: "coordinator",
        alt: "The same triangle, now highlighting the coordinator at the lower left corner",
      },
      script:
        "You bring the close, day-to-day relationship with the client. You coordinate their care in the community, understand their needs and work with Trilogy on their care plan and budget. That ongoing relationship helps keep the person at the centre while the partnership provides the support around you.",
      next: "trilogy",
    },
    trilogy: {
      id: "trilogy",
      type: "audio",
      beat: 3,
      label: "Trilogy’s role",
      heading: "Trilogy is the approved provider.",
      body: "Financial and clinical governance.",
      visual: {
        kind: "triangle",
        highlight: "trilogy",
        labels: ["Provider registration", "Financial governance", "Clinical governance"],
        alt: "The same triangle, now highlighting Trilogy Care at the lower right corner, with three labels: provider registration, financial governance and clinical governance",
      },
      script:
        "Trilogy Care holds the provider registration, along with financial and clinical governance. That means oversight of finances and clinical care sits with Trilogy. The partnership enables you to focus on coordinating care and supporting clients in your community. Both roles matter, and the client needs to understand how they fit together.",
      next: "explain",
    },
    // Cards 5 and 6 are draft wording written for the prototype; confirm with the partnerships team.
    explain: {
      id: "explain",
      type: "audio",
      beat: 4,
      label: "Explaining the partnership",
      heading: "Explain who does what.",
      body: "You coordinate their care day to day. Trilogy is their approved provider.",
      visual: {
        kind: "triangle",
        highlight: "all",
        alt: "The relationship triangle with the client, the coordinator and Trilogy Care all highlighted together",
      },
      script:
        "Clients choose their provider, so they need to understand the partnership before they agree. Explain it in plain words. You’re the person they’ll usually speak with, and you coordinate their care day to day. Trilogy Care is their approved provider, with oversight of finances and clinical care. Check that it makes sense to them, and invite their questions.",
      next: "contact",
    },
    contact: {
      id: "contact",
      type: "audio",
      beat: 5,
      label: "Why Trilogy gets in touch",
      heading: "Trilogy may contact clients too.",
      body: "It’s part of being the approved provider.",
      visual: {
        kind: "triangle",
        highlight: "trilogy",
        labels: ["Care plan", "Budget", "Checking in"],
        alt: "The triangle highlighting Trilogy Care, with three labels: care plan, budget and checking in",
      },
      script:
        "Because Trilogy Care is the approved provider, it stays involved in each client’s care. That can mean contacting clients directly, for example about their care plan or budget, or to check that their care is meeting their needs. When clients know this in advance, a call from Trilogy feels expected rather than surprising. If a client is unsure about a call, reassure them and explain how the partnership works.",
      next: "reply",
    },
    reply: {
      id: "reply",
      type: "decision",
      beat: 6,
      label: "A client conversation",
      heading: "Mara asks: “Why would Trilogy call me?”",
      body: "",
      prompt: "Choose your reply:",
      narration:
        "Imagine you’re speaking with Mara, a new client. She asks why Trilogy Care would contact her when you are the person she usually speaks with. How would you explain the arrangement? Choose the reply you would use.",
      visual: {
        kind: "illustration",
        variant: "arc",
        tone: "sky",
        icon: "chat",
        alt: "An older woman with white hair, smiling softly as she looks to one side",
        photo: { src: "/images/mara.jpg", width: 541, height: 360, position: "65% 35%" },
      },
      options: [
        { id: "a", label: "“They just handle invoices. You can leave it to me.”", next: "unclear" },
        { id: "b", label: "“Trilogy is your approved provider. We work together to coordinate your care.”", next: "clear" },
        { id: "c", label: "“It’s an internal process. You don’t need the details.”", next: "unclear" },
      ],
    },
    clear: {
      id: "clear",
      type: "image",
      beat: 7,
      label: "The consequence",
      heading: "Now I know who you both are.",
      body: "Clear roles help clients make informed choices.",
      narration:
        "That reply makes the partnership clear. Mara knows Trilogy Care is her approved provider and that you work together to coordinate her care. Understanding the arrangement helps her make an informed decision. It also means a call from Trilogy makes sense to her. Invite her questions and check that the explanation is clear.",
      visual: {
        kind: "illustration",
        variant: "petals",
        tone: "teal",
        icon: "heart",
        alt: "A smiling carer helping an older woman with her hair while she sits at home with her walking stick",
        photo: { src: "/images/sally.jpeg", width: 228, height: 152, position: "center 30%" },
      },
      emphasis: "recovery",
      next: "check",
      cta: "Continue",
    },
    unclear: {
      id: "unclear",
      type: "image",
      beat: 7,
      label: "The consequence",
      heading: "I’m still not sure what Trilogy does.",
      body: "",
      narration:
        "That reply leaves Trilogy’s role unclear. The client needs to know who Trilogy Care is and how the partnership works so they can make an informed decision. Explain that Trilogy is the approved provider and that you work together to coordinate care. Try again with a reply that makes those roles clear.",
      visual: {
        kind: "illustration",
        variant: "dots",
        tone: "warm",
        icon: "chat",
        alt: "A smiling carer helping an older woman with her hair while she sits at home with her walking stick",
        photo: { src: "/images/sally.jpeg", width: 228, height: 152, position: "center 30%" },
      },
      emphasis: "consequence",
      next: "reply",
      cta: "Try another reply",
    },
    check: {
      id: "check",
      type: "quiz",
      beat: 8,
      label: "Check and takeaway",
      heading: "What does the client need to understand?",
      body: "",
      narration: "Before a client chooses Trilogy Care as their provider, what is essential for them to understand? Select the best answer.",
      visual: { kind: "none" },
      questions: [
        {
          id: "q1",
          prompt: "What is essential before a client chooses Trilogy Care as their provider?",
          options: [
            { id: "a", label: "Who Trilogy Care is and how the partnership works" },
            { id: "b", label: "Only who will be visiting their home" },
            { id: "c", label: "Every internal team at Trilogy Care" },
          ],
          correct: "a",
          feedback: {
            correct: "Exactly. The client needs to know who Trilogy Care is and how you work together, so they can make an informed decision about their care.",
            incorrect:
              "Not quite. Think about what the client needs to make an informed decision about their provider, without needing every detail of how Trilogy is organised.",
          },
        },
      ],
    },
  },
};

// Content supplied by Trilogy. Policy and legislative wording needs subject matter review before the pilot.
const legislativeFramework: Lesson = {
  slug: "legislative-framework",
  version: "1.0",
  theme: "rhythm",
  title: "Legislative Framework",
  summary: "The main parts of Australia’s aged care framework, and how they shape everyday care decisions.",
  outcome: "Recognise what each part of the framework does, and when to check the current requirements.",
  track: "core",
  minutes: 6,
  beats: [
    "The person comes first",
    "The Aged Care Act",
    "Statement of Rights",
    "Statement of Principles",
    "Aged Care Rules",
    "Code of Conduct",
    "Quality Standards",
    "A choice for Mara",
    "When you are unsure",
    "Quick check",
    "Keep the framework handy",
  ],
  start: "intro",
  completion: { type: "quiz", cardId: "check", label: "Answer the quick check correctly" },
  owner: "Quality and practice (draft)",
  reviewDate: "2027-04-22",
  visual: {
    variant: "grid",
    tone: "navy",
    icon: "shield",
    alt: "A smiling older woman sitting among a group of people, with a sun and heart house graphic",
    photo: { src: "/images/bill.webp", width: 1042, height: 521, position: "55% center" },
  },
  assignment: { required: false },
  nodes: {
    intro: {
      id: "intro",
      type: "presenter",
      beat: 0,
      label: "Legislative Framework",
      heading: "The person comes first.",
      body: "Understand the framework behind everyday care decisions.",
      keyPoints: {
        title: "In this lesson",
        style: "chips",
        items: [
          { text: "Aged Care Act 2024" },
          { text: "Statement of Rights" },
          { text: "Statement of Principles" },
          { text: "Aged Care Rules 2025" },
          { text: "Code of Conduct" },
          { text: "Quality Standards" },
          { text: "A service decision to practise", icon: "chat" },
        ],
      },
      visual: {
        kind: "presenter",
        name: "Ava",
        synthetic: true,
        tone: "navy",
        alt: "Presenter introduction poster",
        video: {
          provider: "synthesia",
          id: "d17ebdc9-8f64-4630-ad37-24747e308796",
          title: "Presenter introduction",
          orientation: "portrait",
          src: PRESENTER_MP4,
          poster: "/images/presenter-intro.jpg",
        },
      },
      transcript:
        "When you organise or deliver a service, your decisions affect someone’s everyday life. Australia’s aged care framework puts older people and their rights at the centre. We’ll unpack the main parts, then practise using them in a simple service decision.",
      durationSec: 15,
      next: "act",
    },
    act: {
      id: "act",
      type: "audio",
      beat: 1,
      label: "The Aged Care Act",
      heading: "Aged Care Act 2024",
      body: "Older people’s rights are at the centre. In effect from {{aged_care_act_start}}.",
      check: {
        by: "2026-11-09",
        note: "Confirm the start date and whether any transition arrangements have changed.",
        source: { title: "About the Aged Care Act (Department of Health)", url: "https://www.health.gov.au/our-work/aged-care-act/about" },
      },
      keyPoints: {
        title: "Key facts",
        style: "tiles",
        items: [
          { text: "The main law for government-funded aged care", icon: "doc" },
          { text: "Began on {{aged_care_act_start}}", icon: "clock" },
          { text: "Follows the Royal Commission’s call for reform", icon: "route" },
          { text: "Rights shape how care is planned and delivered", icon: "heart" },
        ],
        tip: "let older people’s rights shape how care is planned and delivered.",
      },
      visual: {
        kind: "words",
        words: ["Aged Care Act 2024", "Rights at the centre"],
        tone: "navy",
        alt: "Key words: Aged Care Act 2024, rights at the centre",
      },
      source: { title: "About the Aged Care Act (Department of Health)", url: "https://www.health.gov.au/our-work/aged-care-act/about" },
      script:
        "The Aged Care Act 2024 is the main law for government-funded aged care. It began on the first of November 2025, following the Royal Commission’s call for reform. For your work, the key idea is that older people’s rights should shape how care is planned and delivered.",
      next: "rights",
    },
    rights: {
      id: "rights",
      type: "audio",
      beat: 2,
      label: "Statement of Rights",
      heading: "Choice. Dignity. Privacy.",
      body: "A voice in their own care.",
      keyPoints: {
        title: "Older people can expect to",
        style: "tiles",
        items: [
          { text: "Make their own choices", icon: "route" },
          { text: "Be treated with dignity and respect", icon: "heart" },
          { text: "Have their privacy protected", icon: "shield" },
          { text: "Raise concerns without reprisal", icon: "chat" },
        ],
        tip: "start by listening to the person and involving them in decisions about their care.",
      },
      visual: {
        kind: "illustration",
        variant: "petals",
        tone: "teal",
        icon: "heart",
        alt: "A smiling older man with a white beard, resting his hands on a walking stick at home",
        photo: { src: "/images/oldie.jpg", width: 612, height: 408, position: "45% 30%" },
      },
      source: { title: "Statement of Rights (Aged Care Quality and Safety Commission)", url: "https://www.agedcarequality.gov.au/workers/statement-rights" },
      script:
        "The Statement of Rights describes what older people can expect when accessing aged care. This includes making choices, being treated with respect, having their privacy protected and raising concerns without reprisal. Start by listening to the person and involving them in decisions about their care.",
      next: "principles",
    },
    principles: {
      id: "principles",
      type: "audio",
      beat: 3,
      label: "Statement of Principles",
      heading: "Put people first.",
      body: "Listen, improve and be accountable.",
      keyPoints: {
        title: "The system should",
        style: "tiles",
        items: [
          { text: "Be accountable", icon: "shield" },
          { text: "Keep improving", icon: "spark" },
          { text: "Recognise workers’ contribution", icon: "people" },
        ],
        tip: "share feedback and raise problems so the way services are organised can keep improving.",
      },
      visual: {
        kind: "orbit",
        centre: "The person",
        centreNote: "What matters to me?",
        nodes: [
          { label: "Care coordinator", icon: "chat" },
          { label: "Service partners", icon: "home" },
          { label: "Health professionals", icon: "heart" },
          { label: "Family and supporters", icon: "people" },
          { label: "Community and connections", icon: "leaf" },
        ],
        alt: "Diagram of the person at the centre, asking what matters to them, surrounded by their care coordinator, service partners, health professionals, family and supporters, and community and connections",
      },
      source: {
        title: "Reform changes for workers (Aged Care Quality and Safety Commission)",
        url: "https://www.agedcarequality.gov.au/workers/reform-changes-workers",
      },
      script:
        "The Statement of Principles describes how the aged care system should operate. It includes accountability and continuous improvement, and recognises workers’ contribution. A practical takeaway is to share feedback and raise problems so the way services are organised can keep improving.",
      next: "rules",
    },
    rules: {
      id: "rules",
      type: "audio",
      beat: 4,
      label: "Aged Care Rules",
      heading: "Aged Care Rules 2025",
      body: "The legal detail supporting the Act. Check what applies to your work.",
      keyPoints: {
        title: "The Rules",
        style: "tiles",
        items: [
          { text: "Add detailed legal requirements under the Act", icon: "doc" },
          { text: "Cover services and provider responsibilities", icon: "home" },
        ],
        tip: "use current approved procedures and official resources to check the requirements for the service and your role.",
      },
      visual: {
        kind: "illustration",
        variant: "grid",
        tone: "navy",
        icon: "doc",
        alt: "An older woman with white hair, smiling softly as she looks to one side",
        photo: { src: "/images/mara.jpg", width: 541, height: 360, position: "65% 35%" },
      },
      source: { title: "Aged Care Rules 2025 (Federal Register of Legislation)", url: "https://www.legislation.gov.au/F2025L01173/latest/text" },
      script:
        "The Rules add detailed legal requirements under the Act. They cover many practical parts of the system, including services and provider responsibilities. Use current approved procedures and official resources to check the requirements relevant to the service and your role.",
      next: "code",
    },
    code: {
      id: "code",
      type: "audio",
      beat: 5,
      label: "Code of Conduct",
      heading: "Be respectful. Protect privacy.",
      body: "Work safely. Raise and act on concerns.",
      keyPoints: {
        title: "The Code expects",
        style: "tiles",
        items: [
          { text: "Dignity and privacy", icon: "heart" },
          { text: "Honesty", icon: "chat" },
          { text: "Safe, competent service delivery", icon: "shield" },
          { text: "Raising and acting on concerns", icon: "spark" },
        ],
        tip: "these expectations apply to providers, their responsible persons and aged care workers, when coordinating services as well as delivering them.",
      },
      visual: {
        kind: "illustration",
        variant: "rings",
        tone: "teal",
        icon: "shield",
        alt: "Aged Care Quality and Safety Commission title card: Aged Care Code of Conduct, for registered providers, associated providers, their workers and responsible persons",
        photo: { src: "/images/age.jpg", width: 320, height: 180, position: "left center" },
      },
      source: {
        title: "Code of Conduct for Aged Care (Aged Care Quality and Safety Commission)",
        url: "https://www.agedcarequality.gov.au/for-providers/code-conduct",
      },
      script:
        "The Code sets behaviour requirements for registered providers, their responsible persons and aged care workers. It includes dignity, privacy, honesty and safe, competent service delivery. It also requires steps to raise and act on quality and safety concerns. These expectations matter when coordinating services as well as delivering them.",
      next: "standards",
    },
    standards: {
      id: "standards",
      type: "audio",
      beat: 6,
      label: "Quality Standards",
      heading: "Safe care.",
      body: "Services that reflect the person’s needs and preferences.",
      keyPoints: {
        title: "Key facts",
        style: "tiles",
        items: [
          { text: "Seven standards across the system", icon: "book" },
          { text: "Applied from {{aged_care_act_start}}", icon: "clock" },
          { text: "What applies depends on the provider’s registration and services", icon: "doc" },
          { text: "Requirements for quality and safe care", icon: "shield" },
        ],
        tip: "your role-specific training will explain what the standards mean for your work.",
      },
      visual: { kind: "words", words: ["7 standards", "Quality and safe care"], tone: "gold", alt: "Key words: 7 standards, quality and safe care" },
      source: {
        title: "Strengthened Aged Care Quality Standards (Aged Care Quality and Safety Commission)",
        url: "https://www.agedcarequality.gov.au/providers/quality-standards/strengthened-aged-care-quality-standards",
      },
      script:
        "The strengthened Quality Standards describe requirements for quality and safe care. They applied from the first of November 2025. There are seven standards across the system. The standards and outcomes that apply depend on the provider’s registration and services. Your role-specific training will explain what that means for your work.",
      next: "kit",
    },
    kit: {
      id: "kit",
      type: "hotspot",
      beat: 6,
      label: "In practice",
      heading: "What the Standards look like at a visit",
      body: "Safe, respectful care shows up in small, everyday things.",
      visual: { kind: "none" },
      prompt: "Tap each marker to see how this partner keeps the visit safe.",
      image: {
        src: "/images/cleaner.jpg",
        width: 1000,
        height: 667,
        alt: "A smiling cleaner in a blue shirt and yellow gloves holds a mop and a basket of spray bottles and cloths",
      },
      mode: "explore",
      spots: [
        {
          id: "gloves",
          x: 29,
          y: 82,
          r: 7,
          label: "Gloves on",
          text: "Gloves protect you and the client from germs and harsh products. Change them between the bathroom and kitchen.",
        },
        {
          id: "products",
          x: 71,
          y: 71,
          r: 8,
          label: "Labelled products",
          text: "Keep products in their original labelled bottles, never mix them, and store them out of reach when you're done.",
        },
        {
          id: "mop",
          x: 27,
          y: 26,
          r: 9,
          label: "Wet floors",
          text: "Falls are one of the biggest risks for older people. Tell the client where it's wet and dry walkways before you leave.",
        },
        {
          id: "cloths",
          x: 73,
          y: 92,
          r: 7,
          label: "Separate cloths",
          text: "Use separate cloths for the bathroom and kitchen so germs don't spread around the home.",
        },
      ],
      next: "leaving",
    },
    leaving: {
      id: "leaving",
      type: "checklist",
      beat: 6,
      label: "Checklist",
      heading: "Before you leave a visit",
      body: "A quick routine that keeps the client safe after you’ve gone. Tick each one as you picture yourself doing it.",
      visual: { kind: "none" },
      background: { gradient: "mist" },
      prompt: "Before I leave, I…",
      items: [
        { id: "floors", text: "Dry or point out any wet floors", note: "Falls are a leading cause of harm for older people. A quick word saves a nasty slip." },
        { id: "products", text: "Put cleaning products away, out of reach", note: "Keep them in their labelled bottles and never mix them." },
        { id: "doors", text: "Check doors, windows and appliances are as the client likes them" },
        {
          id: "changes",
          text: "Ask if anything has changed, and pass on anything that worries me",
          note: "Tell the care coordinator the same day. Call {{emergency_number}} if someone is in immediate danger.",
        },
      ],
      requireAll: true,
      next: "choice",
    },
    choice: {
      id: "choice",
      type: "decision",
      beat: 7,
      label: "A choice for Mara",
      heading: "Mara wants an afternoon visit.",
      body: "Morning and afternoon are both available and suitable under her plan.",
      prompt: "What should you do?",
      narration:
        "Both available times meet Mara’s service needs and fit her plan. As the person arranging the visit, how would you respond? Choose the action that gives Mara a voice in her own care.",
      visual: {
        kind: "illustration",
        variant: "wave",
        tone: "sky",
        icon: "clock",
        alt: "An older woman with white hair, smiling softly as she looks to one side",
        photo: { src: "/images/mara.jpg", width: 541, height: 360, position: "65% 35%" },
      },
      options: [
        {
          id: "a",
          label: "Book the morning. It is easier for the roster.",
          stay: true,
          feedback: "Both times work here. Choosing only for the roster leaves Mara out of the decision.",
        },
        {
          id: "b",
          label: "Discuss both options with Mara and agree on the time.",
          next: "unsure",
          feedback: "Yes. You have checked the workable options and involved Mara in choosing. Confirm and record the arrangement.",
        },
        {
          id: "c",
          label: "Ask her daughter to choose without involving Mara.",
          stay: true,
          feedback: "Start with Mara. Involve supporters in line with her wishes and the arrangements that apply.",
        },
      ],
    },
    unsure: {
      id: "unsure",
      type: "audio",
      beat: 8,
      label: "When you are unsure",
      heading: "Check the current guidance.",
      body: "Ask. Confirm. Record.",
      keyPoints: {
        title: "When you need to check",
        style: "tiles",
        items: [
          { text: "Use the current approved procedure", icon: "doc" },
          { text: "Check official guidance", icon: "book" },
          { text: "Ask your designated support contact", icon: "people" },
          { text: "Raise quality or safety concerns promptly and escalate", icon: "shield" },
        ],
        tip: "you don’t need to memorise every provision. You do need to recognise when to check.",
      },
      visual: { kind: "words", words: ["Ask", "Confirm", "Record"], tone: "teal", alt: "Key words: ask, confirm, record" },
      script:
        "You don’t need to memorise every provision. You do need to recognise when to check. Use the current approved procedure and official guidance, and ask your designated support contact for clarification. If there’s a quality or safety concern, raise it promptly and follow the relevant escalation process.",
      next: "share",
    },
    share: {
      id: "share",
      type: "wall",
      beat: 8,
      label: "Insight wall",
      heading: "Learn from each other",
      body: "Share one thing you do, then see what others in the network do.",
      visual: { kind: "none" },
      background: { gradient: "teal" },
      prompt: "What’s one way you give a client a real say in their own care?",
      placeholder: "For example: I ask what matters most to them before I start.",
      next: "confidence",
    },
    confidence: {
      id: "confidence",
      type: "rating",
      beat: 8,
      label: "Confidence check",
      heading: "How confident are you?",
      body: "Be honest. Only the overall picture is shared, never your name.",
      visual: { kind: "none" },
      background: { gradient: "sky" },
      prompt: "How confident are you explaining the difference between the Rights, the Principles and the Rules?",
      lowLabel: "Not yet",
      highLabel: "Very confident",
      next: "check",
    },
    check: {
      id: "check",
      type: "quiz",
      beat: 9,
      label: "Quick check",
      heading: "Which part adds detailed legal requirements under the Act?",
      body: "",
      narration: "Think about the different jobs of the Rights, the Principles and the Rules. Which adds the detailed legal requirements?",
      visual: { kind: "none" },
      questions: [
        {
          id: "q1",
          prompt: "Choose one answer.",
          options: [
            { id: "a", label: "Statement of Rights" },
            { id: "b", label: "Aged Care Rules 2025" },
            { id: "c", label: "Statement of Principles" },
          ],
          correct: "b",
          feedback: {
            correct: "That’s right. The Rules add detailed legal requirements under the Act.",
            incorrect:
              "Not quite. The Statement of Rights describes what people can expect, and the Statement of Principles describes how the system should work. Think about which part holds the legal detail.",
          },
        },
      ],
      next: "toolkit",
    },
    toolkit: {
      id: "toolkit",
      type: "resources",
      beat: 10,
      label: "Toolkit",
      heading: "Keep these handy",
      body: "The official sources behind this lesson, for when you need to check something. Open them now or come back later.",
      visual: { kind: "none" },
      items: [
        {
          id: "act",
          kind: "link",
          title: "About the Aged Care Act",
          url: "https://www.health.gov.au/our-work/aged-care-act/about",
          source: "Department of Health, Disability and Ageing",
          description: "What the new Act covers and why it puts older people’s rights first.",
        },
        {
          id: "rights",
          kind: "link",
          title: "Statement of Rights",
          url: "https://www.agedcarequality.gov.au/workers/statement-rights",
          source: "Aged Care Quality and Safety Commission",
          description: "The rights every older person receiving care has, in plain language.",
        },
        {
          id: "standards",
          kind: "toolkit",
          title: "Strengthened Aged Care Quality Standards",
          url: "https://www.agedcarequality.gov.au/providers/quality-standards/strengthened-aged-care-quality-standards",
          source: "Aged Care Quality and Safety Commission",
          description: "The seven standards and guidance on what good care looks like.",
        },
        {
          id: "code",
          kind: "link",
          title: "Code of Conduct for Aged Care",
          url: "https://www.agedcarequality.gov.au/for-providers/code-conduct",
          source: "Aged Care Quality and Safety Commission",
        },
        {
          id: "rules",
          kind: "link",
          title: "Aged Care Rules 2025",
          url: "https://www.legislation.gov.au/F2025L01173/latest/text",
          source: "Federal Register of Legislation",
          description: "The detailed legal requirements made under the Act.",
        },
      ],
      next: "recap",
    },
    recap: {
      id: "recap",
      type: "summary",
      beat: 10,
      label: "Keep the framework handy",
      heading: "Keep the framework handy.",
      body: "",
      narration:
        "Each part has a different job, and they work together under the Aged Care Act. In your next service conversation, start with what matters to the person. Involve them in the decision, work within your role and check the current requirements when you need to.",
      visual: { kind: "none" },
      points: [
        "Rights: what people can expect.",
        "Principles: how the system should work.",
        "Rules: detailed legal requirements.",
        "Code: expected behaviour.",
        "Standards: quality and safe care.",
      ],
      action: "In your next service conversation, start with what matters to the person.",
      references: [
        {
          title: "About the Aged Care Act",
          url: "https://www.health.gov.au/our-work/aged-care-act/about",
          issuer: "Department of Health, Disability and Ageing",
        },
        { title: "Statement of Rights", url: "https://www.agedcarequality.gov.au/workers/statement-rights", issuer: "Aged Care Quality and Safety Commission" },
        {
          title: "Reform changes for workers",
          url: "https://www.agedcarequality.gov.au/workers/reform-changes-workers",
          issuer: "Aged Care Quality and Safety Commission",
        },
        { title: "Aged Care Rules 2025", url: "https://www.legislation.gov.au/F2025L01173/latest/text", issuer: "Federal Register of Legislation" },
        {
          title: "Code of Conduct for Aged Care",
          url: "https://www.agedcarequality.gov.au/for-providers/code-conduct",
          issuer: "Aged Care Quality and Safety Commission",
        },
        {
          title: "Strengthened Aged Care Quality Standards",
          url: "https://www.agedcarequality.gov.au/providers/quality-standards/strengthened-aged-care-quality-standards",
          issuer: "Aged Care Quality and Safety Commission",
        },
      ],
      cta: "Finish lesson",
    },
  },
};

/*
  Legislative Framework learning sequence: one topic, four experiences (Learn, Recall, Apply,
  Refresh). These short lessons are delivered over time as steps in a learning path, never
  from the catalogue. Draft wording for subject matter review.
*/
const frameworkParts = [
  { text: "Rights: what people can expect" },
  { text: "Principles: how the system should work" },
  { text: "Rules: detailed legal requirements" },
  { text: "Code: expected behaviour" },
  { text: "Standards: quality and safe care" },
];
const lfOwner = "Quality and practice (draft)";

const lfRecall: Lesson = {
  slug: "lf-recall",
  version: "1.0",
  theme: "rhythm",
  title: "Legislative Framework: quick recall",
  summary: "Two quick questions to bring back the five parts of the framework.",
  outcome: "Recall what the Rights and the Code each do.",
  track: "reinforcement",
  minutes: 2,
  beats: ["Two weeks on", "What people can expect", "Expected behaviour", "Keep it handy"],
  start: "intro",
  completion: { type: "acknowledge", cardId: "wrap", label: "Answer both questions and finish" },
  owner: lfOwner,
  reviewDate: "2027-04-22",
  visual: { variant: "grid", tone: "navy", icon: "book" },
  nodes: {
    intro: {
      id: "intro",
      type: "image",
      beat: 0,
      label: "Quick recall",
      heading: "Two weeks on",
      body: "Let’s see what you remember about the aged care framework. Answer from memory first.",
      visual: {
        kind: "words",
        words: ["Rights", "Principles", "Rules", "Code", "Standards"],
        tone: "navy",
        alt: "Key words: Rights, Principles, Rules, Code, Standards",
      },
      narration:
        "It’s been a couple of weeks since you looked at the aged care framework. Let’s see what you remember. Answer from memory first, then read the feedback.",
      next: "q1",
      cta: "Start",
    },
    q1: {
      id: "q1",
      type: "quiz",
      beat: 1,
      label: "What people can expect",
      heading: "Which part describes what older people can expect?",
      body: "",
      visual: { kind: "none" },
      questions: [
        {
          id: "q",
          prompt: "Choose one answer.",
          options: [
            { id: "a", label: "Statement of Rights" },
            { id: "b", label: "Aged Care Rules 2025" },
            { id: "c", label: "Quality Standards" },
          ],
          correct: "a",
          feedback: {
            correct: "Yes. The Statement of Rights describes what older people can expect, including choice, dignity and privacy.",
            incorrect: "Not quite. The Rules add legal detail and the Standards describe quality and safe care. Think about what people can expect.",
          },
        },
      ],
      next: "q2",
    },
    q2: {
      id: "q2",
      type: "quiz",
      beat: 2,
      label: "Expected behaviour",
      heading: "Which part sets behaviour requirements for workers?",
      body: "",
      visual: { kind: "none" },
      questions: [
        {
          id: "q",
          prompt: "Choose one answer.",
          options: [
            { id: "a", label: "Statement of Principles" },
            { id: "b", label: "Code of Conduct" },
            { id: "c", label: "Aged Care Act 2024" },
          ],
          correct: "b",
          feedback: {
            correct: "Yes. The Code sets behaviour requirements for registered providers, their responsible persons and aged care workers.",
            incorrect: "Not quite. The Principles describe how the system should work. Think about which part covers everyday behaviour.",
          },
        },
      ],
      next: "wrap",
    },
    wrap: {
      id: "wrap",
      type: "summary",
      beat: 3,
      label: "Keep it handy",
      heading: "Five parts, five jobs",
      body: "",
      visual: { kind: "none" },
      points: frameworkParts.map((p) => p.text + "."),
      action: "When you’re unsure which part applies, check the current approved procedure.",
      cta: "Finish",
    },
  },
};

const lfApply: Lesson = {
  slug: "lf-apply",
  version: "1.0",
  theme: "rhythm",
  title: "Legislative Framework: a privacy request",
  summary: "A realistic situation that tests privacy and a person’s voice in their own care.",
  outcome: "Check a person’s wishes and the arrangements that apply before sharing information.",
  track: "reinforcement",
  minutes: 3,
  beats: ["The situation", "Your choice", "What happens", "Take it to work"],
  start: "situation",
  completion: { type: "acknowledge", cardId: "wrap", label: "Work through the scenario and finish" },
  owner: lfOwner,
  reviewDate: "2027-04-22",
  visual: { variant: "arc", tone: "sky", icon: "chat" },
  nodes: {
    situation: {
      id: "situation",
      type: "image",
      beat: 0,
      label: "The situation",
      heading: "A call from Ken’s son",
      body: "Ken’s son calls and asks you to email him his father’s care plan. You haven’t spoken with Ken about sharing it.",
      visual: { kind: "illustration", variant: "arc", tone: "sky", icon: "chat", alt: "Illustration of a phone conversation" },
      narration:
        "Here’s a realistic situation. Ken’s son is worried about his dad and asks you to email him Ken’s care plan. You haven’t talked with Ken about sharing it. Think about Ken’s right to privacy and his voice in his own care.",
      next: "choice",
    },
    choice: {
      id: "choice",
      type: "decision",
      beat: 1,
      label: "Your choice",
      heading: "What do you do?",
      body: "",
      prompt: "Choose your response.",
      visual: { kind: "none" },
      options: [
        { id: "a", label: "Email the plan. He’s family and he’s trying to help.", next: "shared", correct: false },
        { id: "b", label: "Thank him, then check Ken’s wishes and the arrangements that apply before sharing anything.", next: "checked", correct: true },
        { id: "c", label: "Tell him you can’t discuss Ken and end the call.", next: "shut", correct: false },
      ],
    },
    shared: {
      id: "shared",
      type: "image",
      beat: 2,
      label: "What happens",
      heading: "Ken’s privacy wasn’t protected",
      body: "Ken hadn’t agreed to share his plan. Sharing personal information without checking can breach his privacy and his trust.",
      visual: { kind: "illustration", variant: "dots", tone: "warm", icon: "shield", alt: "Illustration of a privacy concern" },
      emphasis: "consequence",
      next: "recover",
      cta: "What now?",
    },
    recover: {
      id: "recover",
      type: "decision",
      beat: 2,
      label: "Put it right",
      heading: "What could you do now?",
      body: "The email has been sent. You can still act on the concern.",
      prompt: "Choose your next step.",
      visual: { kind: "none" },
      options: [
        { id: "a", label: "Tell Ken what happened and raise it through the approved process.", next: "fixed" },
        { id: "b", label: "Say nothing. No harm was meant.", stay: true, feedback: "Problems need to be raised so they can be acted on and fixed." },
      ],
    },
    fixed: {
      id: "fixed",
      type: "image",
      beat: 2,
      label: "What happens",
      heading: "You raise it promptly",
      body: "You tell Ken, raise the concern through the approved process and agree how his son can be kept informed in future.",
      visual: { kind: "illustration", variant: "petals", tone: "teal", icon: "heart", alt: "Illustration of a resolved concern" },
      emphasis: "recovery",
      next: "wrap",
    },
    checked: {
      id: "checked",
      type: "image",
      beat: 2,
      label: "What happens",
      heading: "You put Ken first",
      body: "You check with Ken. He’s happy for his son to know his visit times, but not his health details. You record his wishes.",
      visual: { kind: "illustration", variant: "petals", tone: "teal", icon: "heart", alt: "Illustration of a client giving their wishes" },
      emphasis: "recovery",
      next: "wrap",
    },
    shut: {
      id: "shut",
      type: "image",
      beat: 2,
      label: "What happens",
      heading: "His son feels shut out",
      body: "Ken’s privacy is protected, but his son is left worried and Ken misses the chance to say what he’s happy to share.",
      visual: { kind: "illustration", variant: "dots", tone: "warm", icon: "people", alt: "Illustration of a worried family member" },
      emphasis: "consequence",
      next: "choice",
      cta: "Try another response",
    },
    wrap: {
      id: "wrap",
      type: "summary",
      beat: 3,
      label: "Take it to work",
      heading: "Privacy and a voice in their care",
      body: "",
      visual: { kind: "none" },
      points: ["Rights: privacy and a say in decisions about their care.", "Code: protect privacy, and raise and act on concerns."],
      action: "Before sharing information, check the person’s wishes and the arrangements that apply.",
      cta: "Finish",
    },
  },
};

const refreshDecision = {
  id: "decide",
  type: "decision" as const,
  label: "One decision",
  heading: "Choosing a visit time",
  body: "A client prefers mornings. Morning and afternoon both work under her plan.",
  prompt: "What do you do?",
  visual: { kind: "illustration" as const, variant: "wave" as const, tone: "sky" as const, icon: "clock" as const, alt: "Illustration with a clock motif" },
  options: [
    {
      id: "a",
      label: "Offer both times and let her choose.",
      next: "done",
      correct: true,
      feedback: "Yes. Involving her in the choice gives her a voice in her own care. Confirm and record it.",
    },
    { id: "b", label: "Pick whichever suits the roster.", stay: true, correct: false, feedback: "Both times work, so the choice should be hers." },
  ],
};
const refreshDone = {
  id: "done",
  type: "summary" as const,
  label: "Remember",
  heading: "Start with the person",
  body: "",
  visual: { kind: "none" as const },
  action: "Start with what matters to the person, then check the current requirements when you need to.",
  cta: "Finish",
};

const lfRefresh: Lesson = {
  slug: "lf-refresh",
  version: "1.0",
  theme: "rhythm",
  title: "Legislative Framework: refresher",
  summary: "One quick decision to keep the framework fresh.",
  outcome: "Give the person a voice in everyday service decisions.",
  track: "reinforcement",
  minutes: 1,
  beats: ["One decision", "Remember"],
  start: "decide",
  completion: { type: "acknowledge", cardId: "done", label: "Make the decision and finish" },
  owner: lfOwner,
  reviewDate: "2027-04-22",
  visual: { variant: "wave", tone: "teal", icon: "clock" },
  nodes: {
    decide: { ...refreshDecision, beat: 0 },
    done: { ...refreshDone, beat: 1 },
  },
};

const lfRefreshSupport: Lesson = {
  slug: "lf-refresh-support",
  version: "1.0",
  theme: "rhythm",
  title: "Legislative Framework: refresher with practice",
  summary: "A short reminder of the framework, some practice and one decision.",
  outcome: "Recognise what each part does and give the person a voice in everyday decisions.",
  track: "reinforcement",
  minutes: 3,
  beats: ["A quick reminder", "Practise", "One decision", "Remember"],
  start: "remind",
  completion: { type: "acknowledge", cardId: "done", label: "Practise, decide and finish" },
  owner: lfOwner,
  reviewDate: "2027-04-22",
  visual: { variant: "grid", tone: "navy", icon: "book" },
  nodes: {
    remind: {
      id: "remind",
      type: "image",
      beat: 0,
      label: "A quick reminder",
      heading: "Each part has a job",
      body: "They work together under the Aged Care Act.",
      keyPoints: { style: "chips", items: frameworkParts },
      visual: {
        kind: "words",
        words: ["Rights", "Principles", "Rules", "Code", "Standards"],
        tone: "navy",
        alt: "Key words: Rights, Principles, Rules, Code, Standards",
      },
      narration:
        "Here’s a quick reminder before you practise. The Rights describe what people can expect. The Principles describe how the system should work. The Rules add the legal detail, the Code sets expected behaviour, and the Standards describe quality and safe care.",
      next: "practise",
    },
    practise: {
      id: "practise",
      type: "quiz",
      beat: 1,
      label: "Practise",
      heading: "Where do you check first?",
      body: "You’re not sure whether a task is within a client’s services.",
      visual: { kind: "none" },
      questions: [
        {
          id: "q",
          prompt: "Choose one answer.",
          options: [
            { id: "a", label: "The current approved procedure and official guidance" },
            { id: "b", label: "Whatever a colleague did last time" },
            { id: "c", label: "Skip the task without mentioning it" },
          ],
          correct: "a",
          feedback: {
            correct: "Yes. Check the current approved procedure and guidance, and ask your support contact if you’re still unsure.",
            incorrect: "Not quite. Requirements change, so check the current approved procedure and official guidance.",
          },
        },
      ],
      next: "decide",
    },
    decide: { ...refreshDecision, beat: 2 },
    done: { ...refreshDone, beat: 3 },
  },
};

/*
  A little extra time as a learning sequence: Recall (week 2) → Apply (month 2) → Refresh (week 14).
  Each follow up asks before it explains. Rates are illustrative, as in the master lesson.
*/
const etOwner = "Learning team (demo)";
const etReview = "2027-04-22";
const changeGuide = {
  title: "Confirming a change to a visit (demo resource)",
  url: "/resources#change-request-guide",
  issuer: "Trilogy Care (demonstration source)",
};
const etRule: { text: string; icon: IconName }[] = [
  { text: "Say you’d like to help", icon: "heart" },
  { text: "Check with the coordinator first", icon: "chat" },
  { text: "Let the client know what it means", icon: "clock" },
  { text: "If you’ve already stayed, tell the coordinator the same day", icon: "route" },
];

const etRecall: Lesson = {
  slug: "et-recall",
  version: "1.0",
  theme: "rhythm",
  title: "A little extra time: quick recall",
  summary: "Two quick questions on what to do when a client asks you to stay longer.",
  outcome: "Check with the coordinator before agreeing to extra time.",
  track: "reinforcement",
  minutes: 2,
  beats: ["Two weeks on", "What happens first", "The cost", "Keep it handy"],
  start: "intro",
  completion: { type: "acknowledge", cardId: "wrap", label: "Answer both questions and finish" },
  owner: etOwner,
  reviewDate: etReview,
  visual: { variant: "rings", tone: "teal", icon: "clock" },
  nodes: {
    intro: {
      id: "intro",
      type: "image",
      beat: 0,
      label: "Quick recall",
      heading: "Two weeks on",
      body: "A couple of weeks ago you looked at what to do when a client asks for a little extra time. Answer from memory first.",
      visual: { kind: "words", words: ["Help", "Check", "Confirm"], tone: "teal", alt: "Key words: Help, Check, Confirm" },
      narration:
        "A couple of weeks ago you looked at what to do when a client asks you to stay a little longer. Let’s see what you remember. Answer from memory first, then read the feedback.",
      next: "q1",
      cta: "Start",
    },
    q1: {
      id: "q1",
      type: "quiz",
      beat: 1,
      label: "What happens first",
      heading: "A client asks if you could stay an extra 20 minutes today.",
      body: "",
      visual: { kind: "none" },
      questions: [
        {
          id: "q",
          prompt: "What should happen first?",
          options: [
            { id: "a", label: "Stay, then mention it in your visit note" },
            { id: "b", label: "Say you’re happy to check, and contact the coordinator" },
            { id: "c", label: "Explain that extra time is never possible" },
          ],
          correct: "b",
          feedback: {
            correct: "Yes. Checking first means the client knows what to expect and the change is confirmed and recorded.",
            incorrect: "Not quite. Extra time can be possible, but it needs confirming with the coordinator before you stay, not noted afterwards.",
          },
        },
      ],
      next: "q2",
    },
    q2: {
      id: "q2",
      type: "quiz",
      beat: 2,
      label: "The cost",
      heading: "At an example rate of $80 an hour, what does an extra 30 minutes add?",
      body: "",
      visual: { kind: "none" },
      questions: [
        {
          id: "q",
          prompt: "Choose one answer.",
          options: [
            { id: "a", label: "$30" },
            { id: "b", label: "$40" },
            { id: "c", label: "Nothing, if the client is happy" },
          ],
          correct: "b",
          feedback: {
            correct: "Yes. Half an hour at $80 an hour is $40. Small amounts still change what the client pays.",
            incorrect: "Not quite. Half an hour at $80 an hour is $40, and it still costs the client even if they’re happy to pay.",
          },
        },
      ],
      next: "wrap",
    },
    wrap: {
      id: "wrap",
      type: "summary",
      beat: 3,
      label: "Keep it handy",
      heading: "Help, then check",
      body: "",
      visual: { kind: "none" },
      points: [
        "Extra time changes the service and the cost.",
        "Check with the coordinator before you agree.",
        "The client should know what it means before it happens.",
      ],
      action: "Before agreeing to extra time, check with the coordinator.",
      reference: changeGuide,
      cta: "Finish",
    },
  },
};

/** Apply: the time stays the same but the task changes, then a total to work out. */
function etApplyLesson(role: "default" | "gardening"): Lesson {
  const garden = role === "gardening";
  return {
    slug: garden ? "et-apply-gardening" : "et-apply",
    version: "1.0",
    theme: "rhythm",
    title: garden ? "A little extra time: a different job" : "A little extra time: a different request",
    summary: garden
      ? "The visit length stays the same, but the client asks for a different job."
      : "The visit length stays the same, but the client asks for a different task.",
    outcome: "Treat a changed task like changed time, and work out what a longer visit costs.",
    track: "reinforcement",
    minutes: 3,
    beats: ["The situation", "Your choice", "What happens", "Work it out", "Take it to work"],
    start: "situation",
    completion: { type: "acknowledge", cardId: "wrap", label: "Work through the scenario and finish" },
    owner: etOwner,
    reviewDate: etReview,
    visual: garden ? { variant: "wave", tone: "gold", icon: "leaf" } : { variant: "wave", tone: "sky", icon: "home" },
    nodes: {
      situation: {
        id: "situation",
        type: "image",
        beat: 0,
        label: "The situation",
        heading: garden ? "Same time, different job" : "Same time, different task",
        body: garden
          ? "Instead of mowing, the client asks you to prune a tall tree near the fence. The visit length stays the same."
          : "Mara asks you to clean the oven instead of vacuuming today. The visit length stays the same.",
        visual: garden
          ? { kind: "illustration", variant: "wave", tone: "gold", icon: "leaf", alt: "Soft gold waves with a leaf motif" }
          : {
              kind: "illustration",
              variant: "wave",
              tone: "sky",
              icon: "home",
              alt: "A cleaner at work in a client’s home",
              photo: { src: "/images/cleaner.jpg", width: 1000, height: 667, position: "center 30%" },
            },
        narration: garden
          ? "Here’s a new situation. You’re booked to mow, but the client asks if you’d prune the tall tree by the fence instead. It would take the same amount of time. Think about whether this is the same service."
          : "Here’s a new situation. Mara asks if you’d clean the oven instead of vacuuming today. It would take the same amount of time. Think about whether this is the same service.",
        next: "choice",
      },
      choice: {
        id: "choice",
        type: "decision",
        beat: 1,
        label: "Your choice",
        heading: "What do you do?",
        body: "",
        prompt: "Choose your response.",
        visual: { kind: "none" },
        options: [
          {
            id: "a",
            label: garden ? "Prune the tree instead. It’s the same time." : "Swap the tasks. It’s the same amount of time.",
            next: "swapped",
            correct: false,
          },
          { id: "b", label: "Say you’ll check, and ask the coordinator whether the change is OK.", next: "checked", correct: true },
          { id: "c", label: "Do the usual tasks and don’t mention it.", next: "ignored", correct: false },
        ],
      },
      swapped: {
        id: "swapped",
        type: "image",
        beat: 2,
        label: "What happens",
        heading: "The service changed without a check",
        body: garden
          ? "Pruning a tall tree isn’t in the plan, and working at height needs different equipment and safety checks."
          : "Oven cleaning may not be in Mara’s plan, and it can need different products and safety checks.",
        visual: { kind: "illustration", variant: "dots", tone: "warm", icon: "shield", alt: "Illustration of a safety concern" },
        emphasis: "consequence",
        narration:
          "Even with no change in time, a different task is a change to the service. It might not be in the plan, and it might not be safe to do without the right equipment.",
        next: "checked",
        cta: "What should happen",
      },
      ignored: {
        id: "ignored",
        type: "image",
        beat: 2,
        label: "What happens",
        heading: "The request goes nowhere",
        body: `${garden ? "The client’s" : "Mara’s"} request isn’t passed on, so nothing changes and they may feel unheard.`,
        visual: { kind: "illustration", variant: "dots", tone: "warm", icon: "chat", alt: "Illustration of a conversation that went unanswered" },
        emphasis: "consequence",
        narration: "Saying nothing means the request isn’t passed on. Let the client know you’ll check, so they know they’ve been heard.",
        next: "checked",
        cta: "What should happen",
      },
      checked: {
        id: "checked",
        type: "image",
        beat: 2,
        label: "What happens",
        heading: "A change isn’t only about time",
        body: "Swapping, adding or dropping a task is a change to the service. The coordinator can confirm whether it fits the plan and is safe to do.",
        visual: { kind: "words", words: ["Swap", "Add", "Drop", "Check"], tone: "teal", alt: "Key words: Swap, Add, Drop, Check" },
        emphasis: "recovery",
        narration:
          "That’s the habit. Whether the change is to time or to the task, it gets the same quick check. The coordinator confirms whether it fits the plan, and the client knows their request has been passed on.",
        next: "calc",
      },
      calc: {
        id: "calc",
        type: "quiz",
        beat: 3,
        label: "Work it out",
        heading: "60 minutes becomes 105",
        body: "Another week, the client asks for a longer visit. At an example rate of $80 an hour, the 60 minute visit would become 105 minutes.",
        visual: {
          kind: "words",
          words: ["105 minutes", "$80 an hour", "Illustrative rate"],
          tone: "gold",
          alt: "Key words: 105 minutes, 80 dollars an hour, illustrative rate",
        },
        narration:
          "One more. The visit would go from sixty minutes to a hundred and five. Work out the new total at our example rate of eighty dollars an hour, and think about what needs to happen.",
        questions: [
          {
            id: "q",
            prompt: "What’s the new total, and what needs to happen?",
            options: [
              { id: "a", label: "$140, and the extra 45 minutes is confirmed before you stay" },
              { id: "b", label: "$140, and no check is needed if the client agrees" },
              { id: "c", label: "$105, and the extra time is confirmed first" },
            ],
            correct: "a",
            feedback: {
              correct: "Right on both counts. 105 ÷ 60 × $80 = $140, and the extra time needs confirming first.",
              incorrect: "Not quite. 105 minutes is 1.75 hours, so 1.75 × $80 = $140. And the client agreeing isn’t the same as the change being confirmed.",
            },
          },
        ],
        next: "wrap",
      },
      wrap: {
        id: "wrap",
        type: "summary",
        beat: 4,
        label: "Take it to work",
        heading: "Any change gets a check",
        body: "",
        visual: { kind: "none" },
        points: [
          "A different task is a change to the service, even in the same time.",
          "Work out what a longer visit means, so you can explain it.",
          "Confirm the change with the coordinator before it happens.",
        ],
        action: "Treat a changed task like changed time: check before you agree.",
        reference: changeGuide,
        cta: "Finish",
      },
    },
  };
}
const etApply = etApplyLesson("default");
const etApplyGardening = etApplyLesson("gardening");

const etRefreshDecision: Card = {
  id: "decide",
  type: "decision",
  beat: 0,
  label: "One decision",
  heading: "An extra day next week",
  body: "A client’s daughter asks if you could come on an extra day next week while she’s away.",
  prompt: "What’s the best response?",
  visual: {
    kind: "illustration",
    variant: "arc",
    tone: "teal",
    icon: "people",
    alt: "An older woman smiling, with her daughter beside her",
    photo: { src: "/images/mum.webp", width: 1042, height: 938, position: "center 25%" },
  },
  narration:
    "Three months on, here’s one quick decision. A client’s daughter asks if you could come on an extra day next week while she’s away. What’s the best response?",
  options: [
    {
      id: "a",
      label: "Agree a time with her directly. She’s family.",
      stay: true,
      correct: false,
      feedback: "Family can make requests, but an extra visit is a change to the service. It needs confirming through the coordinator, with the client.",
    },
    {
      id: "b",
      label: "Thank her and pass the request to the coordinator to confirm.",
      next: "done",
      correct: true,
      feedback: "Yes. The coordinator can check the plan with the client and confirm what’s possible.",
    },
    { id: "c", label: "Say it’s not possible.", stay: true, correct: false, feedback: "It may well be possible. Pass it on so the coordinator can check." },
  ],
};
const etRefreshDone: Card = {
  id: "done",
  type: "summary",
  beat: 1,
  label: "Remember",
  heading: "Whoever asks, check first",
  body: "",
  visual: { kind: "none" },
  points: [
    "Extra time, a different task or an extra visit are all changes.",
    "Requests can come from the client or their family.",
    "The coordinator confirms the change with the client.",
  ],
  action: "Whoever asks, and whatever the change, check before you agree.",
  reference: changeGuide,
  cta: "Finish",
};

const etRefresh: Lesson = {
  slug: "et-refresh",
  version: "1.0",
  theme: "rhythm",
  title: "A little extra time: refresher",
  summary: "One quick decision to keep the habit of checking first.",
  outcome: "Check before agreeing to any change, whoever asks.",
  track: "reinforcement",
  minutes: 1,
  beats: ["One decision", "Remember"],
  start: "decide",
  completion: { type: "acknowledge", cardId: "done", label: "Make the decision and finish" },
  owner: etOwner,
  reviewDate: etReview,
  visual: { variant: "arc", tone: "teal", icon: "people" },
  nodes: { decide: etRefreshDecision, done: etRefreshDone },
};

const etRefreshSupport: Lesson = {
  slug: "et-refresh-support",
  version: "1.0",
  theme: "rhythm",
  title: "A little extra time: refresher with practice",
  summary: "A short reminder of the steps, some practice and one decision.",
  outcome: "Check before agreeing to any change, and explain what it means for the client.",
  track: "reinforcement",
  minutes: 3,
  beats: ["A quick reminder", "Practise", "One decision", "Remember"],
  start: "remind",
  completion: { type: "acknowledge", cardId: "done", label: "Practise, decide and finish" },
  owner: etOwner,
  reviewDate: etReview,
  visual: { variant: "rings", tone: "teal", icon: "clock" },
  nodes: {
    remind: {
      id: "remind",
      type: "image",
      beat: 0,
      label: "A quick reminder",
      heading: "Help, then check",
      body: "When a client asks for more time or something different, the kind response is to help by checking first.",
      keyPoints: { style: "tiles", items: etRule },
      visual: {
        kind: "illustration",
        variant: "dots",
        tone: "gold",
        icon: "clock",
        alt: "An older couple smiling together on a couch at home",
        photo: { src: "/images/two.jpeg", width: 228, height: 152, position: "center 30%" },
      },
      narration:
        "Here’s a quick reminder before you practise. When a client asks for extra time or a different task, say you’d like to help, then check with the coordinator first. Let the client know what the change would mean. And if you’ve already stayed, it’s not too late. Tell the coordinator the same day.",
      next: "practise",
    },
    practise: {
      id: "practise",
      type: "quiz",
      beat: 1,
      label: "Practise",
      heading: "You stayed an extra 15 minutes yesterday without checking.",
      body: "",
      visual: { kind: "none" },
      questions: [
        {
          id: "q",
          prompt: "What’s the best thing to do now?",
          options: [
            { id: "a", label: "Tell the coordinator today and explain what happened" },
            { id: "b", label: "Leave it. It was only 15 minutes" },
            { id: "c", label: "Shorten next week’s visit to make up for it" },
          ],
          correct: "a",
          feedback: {
            correct: "Yes. It’s not too late. Telling the coordinator the same day means the change can still be confirmed and recorded.",
            incorrect: "Not quite. Even a short change affects the cost. Tell the coordinator today so it can be confirmed and recorded.",
          },
        },
      ],
      next: "decide",
    },
    decide: { ...etRefreshDecision, beat: 2 },
    done: { ...etRefreshDone, beat: 3 },
  },
};

export const lessons: Lesson[] = [
  legislativeFramework,
  extraTime,
  missionAndModel,
  noticingChange,
  briefing,
  lfRecall,
  lfApply,
  lfRefresh,
  lfRefreshSupport,
  etRecall,
  etApply,
  etApplyGardening,
  etRefresh,
  etRefreshSupport,
];
export const lessonBySlug = (slug: string) => lessons.find((l) => l.slug === slug);
