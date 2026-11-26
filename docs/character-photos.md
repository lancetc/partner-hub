# Character photos

The fictional people who recur in training scenarios (Mrs Patel, Arthur and Chloe, Mr Nguyen, and others) each have one portrait. A scenario only needs to name the person: their portrait appears beside them automatically, so nobody has to search the image library for it.

Find it at **Admin → Image library → Character photos** (`/admin/images/characters`).

## Where portraits appear

The portrait shows beside the person's name in:

- **Invoice X-Ray:** the participant.
- **Mission Board:** the participant.
- **Balance Scale:** the person.
- **Pass the Baton:** the person.
- **Expectation Reset:** the person and their family member.
- **While You Wait:** the person and the caller.
- **Spot the Signal:** the client.
- **The SaH Journey:** each named persona.
- **Conversation practice:** shown when the author hasn't chosen a photo for the block. The author's own photo always wins.
- **Voice role-play:** the character.
- **Tough Phone Call:** the caller. The caller and the client are both added to the roster when the course is published.

The roster is fetched once per page. A name with no portrait shows exactly as before. The name is always written beside the picture, so the picture itself is decorative to screen readers (`alt=""`). The library keeps a written description for authors.

**Nothing is copied into a course.** The portrait is found by name each time the page is read, so a new or replaced portrait shows in every course at once, including ones already published.

## How a name is matched

A name is matched to the character's name or one of its other spellings. Case, spacing, punctuation and a possessive ("Mrs Alder’s") don't matter. Otherwise the match is exact:

- "Mrs Nguyen" is never "Mr Nguyen".
- A first name on its own matches only a character listed under that first name.

**Two different people with the same name share one portrait.** Names are matched across every course, so give a new person a name that isn't already in use, or write it differently ("Joan Pike" rather than "Joan").
- Each name and alias belongs to one character, and saving a clash is refused.

Signal cases write some people in two ways. For example, Margaret Alder is also "Mrs Alder", so she's listed with that alias.

## The roster

It starts with the 17 people who recur in the scenario cases. Each has a look written from what their cases say about them (age, home life, what they care about). Their portraits are made with OpenAI.

Coordinator's Day isn't part of the roster. It keeps its own illustrated avatars, and its first-name characters share names with different people elsewhere: the Contractor Induction course's Joan is a client, not Dot's neighbour.

Each character card shows:

- the portrait (or initials);
- the other ways the name is written;
- the role;
- the portrait's status: No portrait yet, Generating, Ready, or Didn't generate, with the reason;
- the Magazine courses that name them.

On each card, an author can:

- **Generate** or **Regenerate** the portrait with OpenAI, from the look description.
- **Choose from library**, to use any picture already in the image library instead.
- **Edit** the name, other spellings, role, look and portrait description.
- **Hide** the character. Their portrait then stops showing to readers, but the character isn't deleted.

**Generate missing portraits** queues every visible character without one. **Add a character** adds someone by hand.

## Portraits from OpenAI

Portraits use the image library's existing OpenAI connection (`OPENAI_API_KEY`, model `OPENAI_IMAGE_MODEL`, default `gpt-image-2`). Each one is square and medium quality, and is saved into the image library like any generated picture, named "AI OpenAI – …".

Every portrait uses one prompt style, so the set looks consistent: a head-and-shoulders photograph of a fictional person, soft daylight, a softly blurred Australian home background, everyday clothes, and no text or logos.

Portraits are made **in the background, one at a time**, so a batch never holds up a page. The Character photos page checks back every few seconds while any are being made. The image library's limit of 30 generated pictures an hour per person still applies.

If someone chooses a portrait by hand while one is being generated, the hand-picked one is kept. The generated one stays in the image library.

## When a course is published

After a Magazine course is published, the Hub reads the people its scenarios name:

- **Someone new** is added to the roster as "Added on publish". Their look is drafted from the scenario: their title (Mr, Mrs, Ms), their age if given, their role, and what the case says about them. A portrait is queued for them.
- **Someone already in the roster without a portrait** has one queued.
- **If OpenAI isn't connected,** they're added with no portrait and shown as waiting.

This never blocks or slows a publish. Generic labels such as "Trilogy Care Coordinator" or "Independent provider" aren't treated as characters.

## People in your content

Topics name people in ordinary text ("Bruce Harding is a Care Partner in Trilogy's Bowen Hills office", "Mrs Kowalski asks…"), and Magazine courses name them in their prose as well as in scenario fields. The Hub reads every live Topic (draft and published) and every Magazine course that isn't archived (draft and published edition), and lists the people they name (`src/lib/peopleInText.ts`, `src/server/peopleInContent.ts`).

It aims to be precise rather than catch everyone. A name counts when:

- it has a title: Mr, Mrs, Ms, Miss or Dr and a surname;
- the text treats it as a person: a verb follows ("Bruce types"), it's possessive ("Bruce's phone"), "is a…" follows, an age is given ("Dot, 84,"), a relationship names it ("her daughter Asha", "Care Partner Bruce Harding"), or it's a role-play speaker ("Leila: Morning!");
- or it appears in two or more places in the same Topic or course.

It leaves out places, months, days, brands, organisations and programmes (Bowen Hills, Microsoft Teams, Medicare, My Aged Care), generic labels ("Worker A"), pets, real public figures, and the Hub's own users. An ordinary word that opens a sentence or a heading ("Remember", "Shouting") isn't a name. "Bruce Harding" and "Bruce" in the same Topic are one person, listed under the fuller name.

**Man or woman comes only from the content, never from the name.** A title (Mr is a man; Mrs, Ms and Miss a woman; Dr says nothing), a relationship ("her son Daniel"), or he or she that can only be them ("Bruce opens his laptop", "Fiona said she…"). Otherwise it's "Man or woman not said".

### On the Character photos page

**People in your content** lists everyone found who isn't in the library, or is in it without a portrait. Each shows where they appear (with links), a quote, a role, and a suggested look written only from what the content says. For each person, an author can:

- **Add to the library**, which is free;
- **Add and make portrait** (or **Make portrait**), which shows the cost (about US$0.04, OpenAI, medium quality) and asks first. It's only offered once the look says man or woman, so edit the look first for anyone the content doesn't describe;
- **Same person** joins a first name to the one character with that first name ("Hana" to Hana Mitchell), as another spelling;
- **Not a person** dismisses a false find (a place or a product). Dismissed names are kept in the `character_dismissals` table and can be brought back.

**Add all** adds everyone, free. **Make all missing portraits (US$x.xx)** shows the total and asks first; anyone whose content doesn't say man or woman is added without a portrait.

### When a Topic is published, or first saved from an AI draft

As for a Magazine course: anyone new the Topic names is added to the library as "Added on publish", with a look written from the content. A portrait is queued only when the content says man or woman. The rest wait on the Character photos page for a description. If OpenAI isn't connected, nobody is queued. It never blocks or slows a publish.

The Topic editor's **Review and publish** step shows a note: "This Topic introduces Bruce Harding. Their character photo is made when it's published", "…is being made", or that someone needs a description first. It doesn't block publishing.

### The audit script

`npx vite-node --config vitest.config.ts scripts/character-audit.ts` prints the same audit: counts, everyone not in the library or without a portrait, and the estimated cost. It opens the database read-only, so it never adds, changes or generates anything. `--all` also lists people who already have a portrait; `--json file` writes the full result.

## Not yet

- **Background generation needs a long-running server.** It runs inside the server process, which works with `next dev` and a normal Node server. On a serverless host, work that continues after the response may be stopped. A portrait still queued when the server stops is cleared back to "No portrait yet" the next time the roster is read, once it has been stuck for ten minutes, so **Generate** can send it again.
- **No real people.** Every character is fictional, and the look descriptions are respectful and ordinary. Don't add or upload a real person's photo here.
- **Only these scenario types.** Topics, News and Red Pen (whose people appear only in its text) don't show portraits. Topics' people are in the library (see "People in your content") and are offered as references when a card picture is made.
- **First names are shared.** The audit can't tell two different people with the same first name apart: "Priya" in one Topic and "Priya" in another are listed as one person. Give recurring people a surname.
- **The finder can still be wrong.** It reads English text with rules, not understanding: it can miss a person (a name that's also an ordinary word, like "Will", needs a title or "is a…") or take an organisation for one. Dismiss false finds; a man or a woman is never guessed.
- **No other image slots.** An empty image block isn't filled automatically.
