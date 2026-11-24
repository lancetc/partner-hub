# Emphasise text

Built from the PRD _Partner Hub: Scroll-Animated Text Highlighter_ (21 November 2026). An author marks a short phrase in a Magazine story, and readers see a light teal marker sweep in behind the words, once, as the phrase scrolls into view. It's **authorial emphasis**, the same for every reader. It is separate from a learner's own **highlight and Save to Favourites** ([job-aids.md](job-aids.md)), and both can sit on the same words.

> Dot wanted to ==keep tending her roses==, even after the fall.

## For authors

In the Magazine editor, in a **Text** block or a **Text and picture** block:

1. Select a few words and press **Emphasise text** (the marker pen in the formatting toolbar).
2. To take it off, put the cursor in the phrase and press **Remove emphasis** (the same button, now pressed). The words stay exactly as they were. Undo (⌘Z) takes back an Emphasise; to undo a Remove, emphasise the words again.

The editor shows the final marker in place. The preview and the published page show the sweep.

**What the editor won't do**, and says why in the toolbar:

- Mark more than 25 words, or across two paragraphs, list items or table cells.
- Mark half a link (include the whole link, or none of it). A whole link inside a phrase stays a working link.
- Mark words that are already partly emphasised.

**Suggestions before publishing.** These are reminders in the publish checks, never blocking:

| Check                     | Suggested limit                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A phrase, not a sentence  | 12 words or fewer                                                                                                                                         |
| One phrase in a paragraph | 1                                                                                                                                                         |
| One or two in a section   | 2                                                                                                                                                         |
| A few on a page           | 5                                                                                                                                                         |
| Only in story text        | Emphasis typed into a question, a choice or a callout is flagged: there it can read as a hint, or stand in for a warning.                                 |
| Not a give-away           | A phrase that is, or contains, the best answer of a decision or conversation **later on the same page** is flagged. Emphasise it in the feedback instead. |

Don't emphasise something just because it's important. Use it for a story beat the reader should hold in mind: what the older person wants, what changed, what's still unknown, a consequence. It must never be the only sign of a warning or an instruction.

## For readers

- The words are readable all the time. Only the colour behind them moves: left to right in about half a second, with no delay, flash, scaling or text movement.
- It sweeps when about 40% of the phrase is on screen, once. Scrolling back, opening a drawer or resizing never replays it. A phrase already seen in this visit (a section opened again, or the page revisited without reloading) shows the marker straight away.
- A phrase that is already on screen when the page opens shows its marker straight away, rather than losing its colour and sweeping it back.
- **Reduced motion**: the marker is simply there. This follows the system setting, and changes with it.
- **No script, before the page has finished loading, or if it fails to**: the server draws the final marker, so emphasis never depends on the animation.
- **Print**: the marker prints. **Forced colours / high contrast**: the system's Mark colours.
- **Dark mode**: its own marker shade from the theme tokens.
- **Screen readers**: the phrase is a `<mark>` around ordinary text, read once in its place. Nothing is announced about the animation, and nothing about its meaning depends on colour.

|                          | Light     | Dark      |
| ------------------------ | --------- | --------- |
| Marker (`--emph-marker`) | `#b8e7ea` | `#1f6873` |
| Body text on it          | over 10:1 | about 6:1 |

A learner's saved highlight is a gold tint with a dotted underline, drawn over the text with the CSS Highlight API, so the two always look different. When they overlap, both show.

## How it's stored

Emphasis is one more mark in the Hub's rich text (`src/lib/richText.ts`), alongside `**bold**`, `*italic*` and links:

```
==an emphasised phrase==
```

- The marks hug the words: `==` must be followed by a word character and the closing `==` must follow one. `a == b`, `x === y`, `== spaced ==` and a line of `=====` all stay as text, so older content that happens to hold equals signs reads exactly as it did.
- An equals sign that would run into a mark is written back escaped (`\=`), as `\*` is for stars.
- It can sit inside bold or around a link (`==see [the plan](/plans)==`). It can't nest, and it doesn't cross a blank line.
- In the editor it is `<mark class="tc-emph" data-emph="">`. Only the editor's own mark is read back as emphasis: a `<mark>` pasted from another site keeps its words and loses its colour. Editors that don't offer emphasis (Topics, callouts, choices, everywhere outside a Magazine text block) take it off when the text is next edited, and from anything pasted.

Nothing else changes. There's no separate store and no migration: emphasis lives in the page's text, so it's versioned, reviewed, published, archived and withdrawn with the page, and older editions keep what they had.

### What it doesn't change

- **Learner highlights and Favourites.** The words are the same with or without the mark: `plainText`, the server's block words (`blockWords`) and the comparison both sides use (`lib/passageMatch`) all read straight through it. A selection across the edge of a marked phrase saves the same quote, matches the same block and is marked again on the page. Adding emphasis is still a new edition, so a passage saved from the old one gets the usual **Guidance changed since you saved this** until the learner checks it.
- **Reading time and narration.** `pageMinutes` counts words split on spaces, and the marks hug the words, so the count is the same. The Audio Guide's word counts and its "page has changed" fingerprint count words only, so emphasis doesn't make a narration look out of date. The teleprompter script prompt strips the marks.
- **Search, Ava Relay and AI drafting** read `plainText` or the page JSON, as before.

## Where things live

| What                                                                                          | Where                                                                                                                               |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| The mark: parse, write back, editor HTML, reading the editor, `emphasisIn`, `withoutEmphasis` | `src/lib/richText.ts`                                                                                                               |
| Limits, the sweep decision, the publish suggestions                                           | `src/lib/emphasis.ts` (called from `publishChecks` in `src/lib/magazine.ts`)                                                        |
| The reader's marker and its sweep                                                             | `src/components/EditorialMark.tsx`, drawn by `src/components/RichText.tsx`                                                          |
| The look, reduced motion, print, forced colours, dark mode                                    | `mark.tc-emph` in `src/app/globals.css`                                                                                             |
| Emphasise text / Remove emphasis                                                              | `src/components/admin/RichEditable.tsx` (`emphasis` prop), switched on for Text and Text and picture blocks in `MagazineEditor.tsx` |
| Tests                                                                                         | `src/lib/emphasis.test.ts`                                                                                                          |

The sweep is the technique of the MIT-licensed Fancy Components _Text Highlighter_ (a same-colour gradient whose `background-size` grows, with `box-decoration-break: clone` so each wrapped line gets its own marker), rewritten as a few lines of CSS and one shared `IntersectionObserver`. No code or dependency was copied in: no Motion, no Lenis, no change to the page's scrolling.

## What was built, and what wasn't

Built: manual authoring and removal, the stored mark, the published marker with its one-time sweep, the static fallbacks, the publish suggestions, and the checks that it leaves Favourites, word counts and narration alone.

Not built from the PRD, for a later decision:

- **A mark ID and an editorial purpose tag** (`person_goal`, `decision_fact`, …). The phrase is anchored by its words in the page's text, which is versioned with the page; there's no separate ID to keep in step. A purpose tag needs somewhere in the text format to live, and a reason to report on it.
- **A "Preview on scroll" toggle and side-by-side static / animated / reduced-motion previews.** The editor shows the static marker and the preview shows the real sweep; reduced motion is checked by switching the system setting.
- **AI suggestions** of phrases to emphasise, from the AI Assisted Learning Designer.
- **An `editorial_highlight_seen` event.** The Hub doesn't record visibility events for Magazine text, and the PRD treats it as optional.
- **Topic cards and Job Aids.** The renderer draws the mark anywhere rich text is shown, but only the Magazine editor offers it.

## Decisions for Trilogy Care

1. **The marker colour.** `#b8e7ea` (light) and `#1f6873` (dark) are derived from the brand teal. Design may want to confirm them against the brand palette.
2. **Whether emphasis alone should count as a change to the guidance.** Today adding or removing emphasis publishes a new edition like any other edit, so learners who saved a passage from that page are asked to check it again.
3. **Whether to offer it beyond Magazine story text**: Topic cards, Job Aids, callouts.
4. **Whether the purpose tag, AI suggestions or a seen event are wanted**, and who would use them.

## What was checked

**Tests** (`src/lib/emphasis.test.ts`, 18): reading and writing the mark, inside bold and around a link, in lists and tables; equals signs typed as words; the editor's HTML and reading it back, a pasted `<mark>`, spaces and side-by-side marks; older content (sample strings and every string in the Hub's lessons, stories, seeded Magazine courses and demos) has no emphasis and writes back unchanged; a learner's passage across the mark's edge has the same words, block words, page-text match and character offsets, and saves, lists as current and is marked again on a published guide with emphasis; reading minutes, narration word count and the narration fingerprint are unchanged; the sweep decision; the server draws a static `<mark>` with nothing added to the words; the stylesheet's reduced-motion, print, forced-colours and dark rules; and the publish suggestions (never blocking).

**In the browser**, on a ZZ Test guide (deleted afterwards), in a background tab:

- Published page, 375 px and desktop, light and dark: both marks drawn, a four-line phrase on a phone with its own marker on each line, inside the 14 px gutter and no sideways scroll; text on the marker 10.9:1 (light) and 6.0:1 (dark).
- Off-screen marks were waiting to sweep once the page had loaded, and before it had (no script yet) the final marker was already there.
- A selection from the start of the sentence across the mark's edge read as plain words and sat in one block, as Save to Favourites needs.
- Editor: Emphasise text marked a selection (and said 3 phrases was a lot); Remove emphasis took it off with the words intact; across two paragraphs and over 25 words were refused with the reason; the draft saved `==…==` and the long phrase showed as a suggestion.

**Not checked live**: the sweep itself. A background tab doesn't draw, so the page's scroll observer never fires there (confirmed with a bare observer); the trigger logic and the transition rule are covered by tests and the stylesheet, and the transition was confirmed on the element. Also not checked: reduced motion switched on in the system, print, forced colours, a real phone, touch selection and a screen reader.
