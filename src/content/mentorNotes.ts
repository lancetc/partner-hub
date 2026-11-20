import type { MentorNoteData } from "@/lib/notes";

/*
  The seed deck for "Notes to a Younger Me" (docs/notes-to-a-younger-me.md): five fictional, illustrative cards
  across two topics, setting boundaries and difficult calls. The mentors are made up and labelled as such; replace
  them with approved staff contributions before launch. They go into the note library waiting for review, so none
  is dealt into a deck until an editor has reviewed it.

  The gardener card follows the PRD: it doesn't predict an audit bill or promise a funding result, and it doesn't
  suggest self-management removes the provider's responsibilities.
*/

const seed = (
  x: Omit<MentorNoteData, "illustrative" | "consent" | "policyIds" | "audiences"> & Partial<Pick<MentorNoteData, "policyIds" | "audiences">>,
): MentorNoteData => ({
  policyIds: [],
  audiences: ["partner", "coordinator", "staff"],
  ...x,
  illustrative: true,
  consent: { audience: true, attribution: true },
});

export const SEED_NOTES: { id: string; data: MentorNoteData }[] = [
  {
    id: "note-gardener-yes",
    data: seed({
      badge: "CP",
      rank: "A",
      hook: "“I thought saying yes to everything made me a good Care Partner.”",
      scenario:
        "A self-managing client’s daughter wants Dad’s familiar gardener approved “just this once”, although the required public liability cover hasn’t been shown. It’s late on Friday and she wants the garden done before visitors arrive.",
      note: "I used to rush to solve the immediate problem. Then I learned that a warm boundary is still help. Listen to what they need this week, check whether the worker can provide current cover, and offer another approved option if they can’t. Explain what you’ll do next and when they’ll hear from you.",
      phrase:
        "I can see why you want to keep someone Dad knows. We need current insurance before arranging funded work with him. Let’s check what he can provide and look at an approved option for this week.",
      authorName: "Sarah M.",
      authorRole: "Senior Care Partner (fictional)",
      experience: "",
      topics: ["boundaries"],
      policyNote: "Supplier insurance requirements; self-management guidance (the registered provider keeps responsibility for care and services).",
      communityPostId: "note-thread-gardener",
    }),
  },
  {
    id: "note-cant-fix-today",
    data: seed({
      badge: "CC",
      rank: "K",
      hook: "“I thought every call had to end with the problem fixed.”",
      scenario: "A family member rings, upset that a service didn’t turn up this morning. You can’t confirm a replacement before the end of the call.",
      note: "I used to promise a fix just to end the call on a good note, and then spend the afternoon trying to make it true. Now I say what I know, what I don’t, and exactly when I’ll call back. People cope with ‘not yet’ far better than with a promise that falls through.",
      phrase: "I don’t want to promise something I can’t confirm yet. I’m checking now, and I’ll call you back by 3 o’clock either way.",
      authorName: "Tom R.",
      authorRole: "Care Coordinator (fictional)",
      experience: "",
      topics: ["calls"],
      policyNote: "",
      communityPostId: "note-thread-fix-today",
    }),
  },
  {
    id: "note-silence-on-the-line",
    data: seed({
      badge: "CP",
      rank: "10",
      hook: "“I thought silence on the phone meant I’d said something wrong.”",
      scenario: "You’ve just explained a change to someone’s services. There’s a long pause on the line.",
      note: "I used to fill every pause with more explanation, which only made it harder to follow. A pause is often someone taking it in. I learned to wait, then ask one simple question to check what they’ve heard.",
      phrase: "Take your time. What’s the part you’d like me to go over again?",
      authorName: "Priya K.",
      authorRole: "Care Partner (fictional)",
      experience: "",
      topics: ["calls"],
      policyNote: "",
      communityPostId: "note-thread-silence",
    }),
  },
  {
    id: "note-my-number",
    data: seed({
      badge: "CP",
      rank: "Q",
      hook: "“I thought giving clients my personal number showed I cared.”",
      scenario: "A client asks for your mobile number “just in case”, because the office line is busy sometimes.",
      note: "It felt kind until messages arrived at 10 pm and I was the only one who knew. Caring includes making sure help reaches the right person at any hour. Now I explain how to reach the team, and I make sure they have it written down.",
      phrase: "I want you to always reach someone, even when I’m not working. Here’s the number that gets you to the team, and I’ll write it down for you.",
      authorName: "Leanne B.",
      authorRole: "Senior Care Partner (fictional)",
      experience: "",
      topics: ["boundaries"],
      policyNote: "Contact channels: use the approved team contact details.",
      communityPostId: "note-thread-number",
    }),
  },
  {
    id: "note-ask-early",
    data: seed({
      badge: "CLIN",
      rank: "K",
      hook: "“I thought asking for help meant I wasn’t ready for the job.”",
      scenario: "Something in a client’s care plan doesn’t sit right with what you saw at a visit, and you’re not sure whether it matters.",
      note: "I sat on doubts because I didn’t want to look like I didn’t know. The people I admired asked early and often. Asking a clinical lead ‘is this worth a look?’ is part of the job, and the answer is never a waste of time.",
      phrase: "Can I run something past you? I noticed something at today’s visit and I’m not sure if it matters.",
      authorName: "Grace O.",
      authorRole: "Registered Nurse (fictional)",
      experience: "",
      topics: ["asking-for-help", "calls"],
      policyNote: "",
      communityPostId: "note-thread-ask",
    }),
  },
];
