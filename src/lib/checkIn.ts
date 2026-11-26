/*
  "Check in" (People I follow, docs/lives-in-progress.md): a short, informal catch-up with a Digital Member the
  learner follows, opened in place on the homepage. It's the existing member chat with its memory, started with an
  opening line the Hub writes from what's real: this learner's own stored memory with that person, and moments that
  have been shared. Nothing here invents a past conversation, and nothing counts as learning, points or streaks.
*/

/** How a catch-up differs from an ordinary chat, on top of the house rules and Lives in Progress rules. */
export const CHECKIN_RULES = `This is a short, informal catch-up the learner opened from their homepage, like exchanging a few messages with someone they know.
- Keep each reply short and warm, one to three sentences, and in your own everyday voice.
- After a few exchanges (about four of your replies), you may bring it to a natural close in your own way: something you need to get on with, and that you'll let them know how something coming up goes. If they keep talking, keep talking.
- Never make the learner feel guilty about time away, and never suggest you rely on them, have been waiting for them or need their attention.
- Mention an earlier chat only if it's in "Earlier chats with this learner". If there is none, this is your first conversation.`;

/** What the Hub knows that a catch-up can lean on, all of it real: stored memory, shared moments, approved teasers, the Bible. */
export type CheckInFacts = {
  name: string;
  /** "her", "his" or "their". */
  possessive: string;
  /** This learner's latest conversation with this person: when, and the topics it was remembered by. */
  lastChat: { at: string; topics: string[]; questions?: string[] } | null;
  /** The newest shared moment in the last week, and whether it came after the last chat. */
  recent: { headline: string; quote: string; category: string; at: string; sinceLastChat: boolean } | null;
  /** An approved teaser for something in the next fortnight. */
  upcoming: { teaser: string; at: string } | null;
  /** From the Character Bible's interests. */
  interests: string[];
  /** The latest episode that's out, if any. */
  episode: { number: number; title: string } | null;
  /** Their tagline, for a card with nothing newer. */
  tagline: string;
};

const GENERIC: Record<string, [string, string]> = {
  "how they’re feeling": ["how I’d been feeling", "how you’ve been feeling"],
  family: ["my family", "your family"],
  "their home": ["home", "home"],
  "their support": ["my support", "your support"],
  "their health": ["my health", "your health"],
  money: ["money", "money"],
};
/** A remembered topic, as the character would say it ("my roses", "Isabel") and as the learner would ask ("your roses"). */
export function topicPhrase(label: string): { mine: string; yours: string } {
  if (GENERIC[label]) return { mine: GENERIC[label][0], yours: GENERIC[label][1] };
  if (/^[A-Z]/.test(label)) return { mine: label, yours: label };
  const bare = label.replace(/^(her|his|their)\s+/i, "");
  if (bare !== label || /s$/.test(bare)) return { mine: `my ${bare}`, yours: `your ${bare}` };
  return { mine: bare, yours: bare };
}

const NEWS = new Set(["good_news", "celebration", "milestone"]);

/**
  The character's first line. With no stored conversation: "Hello! I don't think we've met before." With one: what
  it was remembered by, and anything they've shared since, in their own words. Never a made-up memory.
*/
export function checkInOpener(f: CheckInFacts): string {
  // Their own words since the last chat, unless they'd need context ("She brought a cake…": who's she?).
  const quote = f.recent?.quote && !/^(she|he|they|it|her|his|their)\b/i.test(f.recent.quote) ? f.recent.quote : "";
  const since = f.recent?.sinceLastChat && quote ? ` ${quote}` : "";
  if (!f.lastChat) return `Hello! I don’t think we’ve met before. I’m ${f.name}. It’s nice of you to say hello.`;
  const topic = f.lastChat.topics[0];
  if (topic) return `Hello again! Last time we were talking about ${topicPhrase(topic).mine}.${since || " Lovely to hear from you."}`;
  // Not one of their usual topics: what the learner's own questions were about ("dogs"), when it's clear.
  const subject = subjectOf(f.lastChat.questions ?? []);
  if (subject) return `Hello again! Last time you were asking me about ${subject}.${since || " Lovely to hear from you."}`;
  return `Hello again! Lovely to hear from you.${since}`;
}

const QUIET = new Set(
  (
    "the a an and or but if then so to of in on at by for with about from into over after before up out off as is are was were be been being am do does did " +
    "have has had having you your yours yourself i me my we our us they them their it its this that these those there here what which who whom whose " +
    "when where why how any some much many more most very really just ever still also too not no yes can could would should will shall may might must " +
    "like liked likes think feel feeling going go went get got make made tell told say said know knew want wanted need sort kind lot lots thing things " +
    "today week weekend yesterday time day days good nice lovely well okay ok alright happening happen happened owned own favourite easy been"
  ).split(" "),
);
/**
  What a learner's questions were mostly about, in their own word ("dogs"): a word they used at least twice (or in
  every question), plural or not, that isn't an everyday word. Null when nothing stands out: better no subject than a
  wrong one.
*/
export function subjectOf(questions: string[]): string | null {
  const counts = new Map<string, { n: number; forms: Map<string, number> }>();
  for (const q of questions)
    for (const raw of q.toLowerCase().match(/[a-z][a-z'’-]{2,}/g) ?? []) {
      const word = raw.replace(/['’]s$/, "");
      if (QUIET.has(word)) continue;
      const stem = word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
      const c = counts.get(stem) ?? { n: 0, forms: new Map() };
      c.n++;
      c.forms.set(word, (c.forms.get(word) ?? 0) + 1);
      counts.set(stem, c);
    }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  if (!best || best.n < Math.min(2, questions.length)) return null;
  // The plural when they used it, since "asking me about dogs" reads better than "about dog".
  const forms = [...best.forms.keys()];
  return forms.find((f) => f.endsWith("s")) ?? forms[0];
}

/** "Not sure what to say?": up to four questions from what's actually going on in their life and this learner's own memory. */
export function checkInStarters(f: CheckInFacts): string[] {
  const out: string[] = [f.episode ? "How are you feeling about everything at the moment?" : "How are you feeling?"];
  if (f.recent) {
    out.push(
      NEWS.has(f.recent.category)
        ? "I heard you had some good news!"
        : f.recent.category === "voice"
          ? "I got your message. How are you?"
          : f.recent.category === "family"
            ? "How was the visit?"
            : "What’s been happening this week?",
    );
  }
  const topic = f.lastChat?.topics.find((t) => !GENERIC[t]);
  if (topic) out.push(`Any news about ${topicPhrase(topic).yours}?`);
  if (f.upcoming) out.push(`“${f.upcoming.teaser}”: are you looking forward to it?`);
  const interest = f.interests.find((i) => !f.lastChat?.topics.includes(i));
  if (interest) out.push(`Tell me about ${topicPhrase(interest).yours}.`);
  return [...new Set(out)].slice(0, 4);
}

/** The card's line: the newest shared moment, else what's coming up, else their story, else their tagline. */
export function checkInLine(f: CheckInFacts): string {
  if (f.recent) return f.recent.headline;
  if (f.upcoming) return `Coming up: ${f.upcoming.teaser}`;
  if (f.episode) return `In ${f.possessive} story: ${f.episode.title}`;
  return f.tagline;
}

/** The Hub's speech price for an estimate (OpenAI gpt-4o-mini-tts, US$ per million characters, to verify). */
export const CHECKIN_VOICE_PRICE = 15;
