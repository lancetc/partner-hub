import type { GuideDoc } from "@/lib/magazine";

/*
  The Ava Relay pilot (docs/ava-relay.md): a two-page Magazine course that follows the Story Plan pilot, "Dot and
  the roses: ask before you suggest". Fictional, for editorial review. Page one sits at the approved episode "Dot
  and the roses" and has the decision; page two sits at "A morning at the markets". It says nothing about Dot
  that her approved story doesn't already say: no fall, no diagnosis, no outcome.

  An author adds it as a draft from Administration → Ava Relay. Nothing is published, and the test answers aren't
  marked reviewed: that is for a person to do.
*/

export const RELAY_PILOT = {
  title: "Dot and the rose garden",
  standfirst: "Fiona is worried about the ladder. Dot hasn’t been asked yet. A short story about what to ask before you suggest a change.",
  audience: ["coordinator"],
  completion: "decision",
} as const;

export const RELAY_PILOT_DOC: GuideDoc = {
  schema: 2,
  relay: { enabled: true, work: true, sources: ["playbooks", "topics", "resources"], routes: [] },
  pages: [
    {
      id: "rose-garden",
      title: "Dot and the rose garden",
      purpose: "Fiona has rung about her mother’s ladder. You’re Dot’s coordinator, and you haven’t spoken to Dot yet.",
      template: "blank",
      kind: "content",
      required: true,
      relay: {
        purpose: "Help the learner work out what to ask Dot before proposing any change to how she tends her roses.",
        beat: "The choice: what the coordinator asks Dot first",
        episode: "ep-roses",
        activity: "first-question",
        characters: [
          { id: "dot", revision: 0 },
          { id: "fiona", revision: 0 },
        ],
        opening:
          "The signal’s thin out here, but I can see the rose garden with you. Fiona’s worried, and Dot hasn’t been asked yet. Where would you like to start?",
        prompts: ["Give me a hint", "What matters to Dot?", "Why is Fiona worried?"],
        hold: ["after-asking"],
        redirect: "Whether Dot should stop using the ladder. That is hers to decide with her coordinator, and the course doesn’t rule on it.",
        notes: "",
      },
      sections: [
        {
          id: "the-call",
          title: "The call",
          blocks: [
            {
              id: "fiona-rings",
              type: "text",
              body: "Fiona rings on a Tuesday. Her mother, Dot, has been out the front again with the stepladder, reaching for the higher branches of the roses. Fiona would like you to tell her to stop.\n\nDot has tended those roses for years. You know she plays bowls on Thursday mornings and that she likes things done her own way. You have heard from Fiona. You have not yet heard from Dot.",
            },
            {
              id: "what-you-know",
              type: "callout",
              style: "example",
              label: "What you know so far",
              body: "Fiona’s worry is the ladder. What the roses mean to Dot, how she manages them now, and what she would want to keep doing are all still unasked.",
            },
          ],
        },
        {
          id: "your-move",
          title: "Your move",
          blocks: [
            {
              id: "first-question",
              type: "decision",
              context: "You’re about to ring Dot.",
              prompt: "What do you do first?",
              choices: [
                {
                  id: "ask-dot",
                  text: "Ask Dot what tending the roses means to her, and how she goes about it now.",
                  verdict: "best",
                  feedback:
                    "Asking first keeps Dot part of the plan. You learn what she wants to keep doing and how she manages it, which is what any change would need to fit around. Fiona’s concern is still there to raise, with Dot, once you understand.",
                },
                {
                  id: "offer-gardener",
                  text: "Tell Dot you can arrange a gardener for the higher branches.",
                  verdict: "acceptable",
                  feedback:
                    "It’s a kind offer, and it may turn out to be part of the answer. But it solves Fiona’s problem before you know what Dot’s is. If the roses are hers to tend, a gardener may take away the very thing she values.",
                },
                {
                  id: "ladder-goes",
                  text: "Explain that her daughter is worried and the ladder will have to go.",
                  verdict: "risky",
                  feedback:
                    "This acts on Fiona’s concern alone and makes the decision for Dot. Told first, a person may simply stop mentioning what they do. You would know less about the risk, not more.",
                },
              ],
            },
            {
              id: "after-asking",
              type: "text",
              heading: "Why asking comes first",
              body: "A plan Dot helps make is one she is likely to use. The question isn’t whether Fiona is right to worry. It’s what Dot is trying to keep in her life, and what she and her coordinator can agree to try, and then check.",
            },
          ],
        },
      ],
    },
    {
      id: "the-markets",
      title: "A morning at the markets",
      purpose: "A few weeks later, the same question turns up somewhere new.",
      template: "blank",
      kind: "content",
      required: true,
      relay: {
        purpose: "Help the learner see that the question they asked about the roses applies again at the markets, and find their own first question.",
        beat: "Transfer: the same question in a new place",
        episode: "ep-markets",
        activity: "markets-question",
        characters: [{ id: "dot", revision: 0 }],
        opening: "We’ve moved on a few weeks. Dot’s talking about the Saturday markets now. What do you notice that’s the same as last time?",
        prompts: ["What’s the same here?", "What does Dot want to keep doing?", "What would I ask first?"],
        hold: [],
        redirect: "",
        notes: "",
      },
      sections: [
        {
          id: "saturday",
          title: "Saturday",
          blocks: [
            {
              id: "markets-scene",
              type: "text",
              body: "A few weeks on, Dot mentions the Saturday markets. She likes to choose her own plants there. It’s a fair walk from the car park, and Fiona has offered to pick the plants up for her instead.",
            },
            {
              id: "markets-question",
              type: "decision",
              prompt: "Fiona’s offer sounds helpful. What would you want to understand before you respond?",
              choices: [
                {
                  id: "what-matters",
                  text: "What going to the markets herself gives Dot that a delivery of plants wouldn’t.",
                  verdict: "best",
                  feedback:
                    "The same question as the roses, in a new place: what is Dot trying to keep doing, and how? Choosing her own plants may be the point.",
                },
                {
                  id: "how-far",
                  text: "Exactly how far the walk from the car park is.",
                  verdict: "acceptable",
                  feedback: "Useful to know, and worth asking Dot about. It tells you about the obstacle, though, before you know what the outing is for.",
                },
                {
                  id: "accept-offer",
                  text: "Nothing more. Fiona’s offer solves it.",
                  verdict: "risky",
                  feedback: "It solves getting plants to the house. It may not be what Dot wants from a Saturday morning, and she hasn’t been asked.",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
