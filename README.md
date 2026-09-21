# Verse Recall — Bible Memory

**Joshua 1:8**  
By Made by Favor. Inspired by Joshua 1:8.

A browser-based, playable prototype. Verse Recall is a working name;
domain, app-store availability and trademarks have **not** been checked.

### Logo

The original vector mark combines an open Bible, a small cross and a restrained
thought bubble for recall/meditation. Reuse `src\assets\verse-recall-mark.svg`;
it uses `currentColor`, so the header inherits the selected `--cp-accent` in
every palette and light/dark mode. The SVG is decorative inside the existing
“Verse Recall home” link; the readable wordmark supplies visual identity without
duplicating the accessible name. No external imagery, fonts or image service is
used. There was no existing favicon to replace; no PWA/icon-manifest work is added.

## Run locally

Requires Node.js 22.12+ (built here with 22.19), npm, and a current browser with
native `dialog`, Web Crypto and `checkVisibility` support (current Edge/Chrome).
Use the loopback HTTP URL, not `file://`; personal content hashing uses Web Crypto.

```powershell
# Run from the repository directory.
npm ci
npm run dev -- --port 5178 --strictPort
```

Open <http://127.0.0.1:5178/verse-recall/>. The development server binds only to loopback.
Stop it with Ctrl+C; restart with the command above.

```powershell
npm run build
npm run preview -- --port 4178 --strictPort
```

Production output is in `dist`; preview it at
<http://127.0.0.1:4178/verse-recall/>. Keep the same origin/port to retain the same
browser save. Moving from localhost to a hosted site does not automatically move
data: export a private backup on the old origin and import it on the new one.

## GitHub Pages

The Vite base is `/verse-recall/`, for a repository named **verse-recall**.
The planned project URL is `https://adamsdenniskariuki.github.io/verse-recall/`.
This URL is not a claim that deployment is already live.

After repository/public-content approval, enable **Settings → Pages → Build and
deployment → Source: GitHub Actions**. A push to `main` or a manual run of
**Build and deploy Pages** restores locked dependencies, runs unit tests, builds,
and runs the browser suite against the production project path before deploying.
Only `dist` is uploaded as the Pages artifact; test output, backups and source
receipts are not part of that artifact. The public repository itself contains the
reviewed source, tests, docs and the six public-domain source receipts.

The workflow uses pinned GitHub-maintained actions. Build jobs have read-only
repository access; only the deployment job gets `pages: write` and `id-token:
write`. No custom secret or API key is required. A failed test blocks deployment.
The workflow has not been executed in GitHub until the repository is approved
and created. Changing the repository name requires updating the Vite base and
production-test URL; a custom domain would require separate configuration.

```powershell
npm run build
npm run test:pages
```

This starts a temporary production preview on port 4179 at `/verse-recall/`,
tests built JS/CSS, navigation, reload/resume and the complete browser suite, then
stops the preview. There is no server-side routing: the app uses local screen
state, so Pages needs no SPA 404 workaround.

**Hosting privacy:** the app contains no analytics or backend and keeps personal
verses/answers/progress in browser storage. The static host still receives normal
HTTP requests (including network metadata); "No tracking" in the prototype UI
describes the app, not a guarantee about the hosting provider. Project sites on
the same `github.io` origin share browser storage and are not a security boundary
from other applications on that origin. Back up private data and do not publish
personal backups in the repository or `dist`.

### Rename compatibility

Verse Recall was previously called WordKeep. This is a display-name change only:
the internal `wordkeep-local-prototype` package name, `WORDKEEP_TEST_URL` test setting, existing
`wordkeep.prototype.v1` / `wordkeep.prototype.v2` storage keys, `wordkeep-verses`
and `wordkeep-backup` JSON format identifiers, versions and passage IDs stay
unchanged. Existing saves and earlier WordKeep backups/templates remain compatible;
no migration or manual renaming of backup contents is required. Only suggested
download filenames now use `verse-recall`. File names do not affect import parsing.

## What is playable

- **Three references in two translations:** Psalm 119:11, Joshua 1:8 and John 14:27,
  in World English Bible **British Edition** and Berean Standard Bible (BSB).
- **Read → Fill → Arrange → Recall → Results.** Fill gaps from a shuffled word bank;
  arrange all words; then type without a bank. Results show correct, incorrect,
  missing and extra words, alongside the intact source verse.
- Tap/click an empty space, then a word, or choose a bank word to fill the next
  space. Native buttons support Tab and Enter/Space. Desktop drag/drop is an
  alternative, never a requirement. Tap a placed word to return it. Identical
  repeated words are interchangeable regardless of their source token identity.
- No timer, score pressure, accounts, analytics, external fonts or runtime API.
- The Testament filter defaults to Both. Collection and Testament preferences
  select **new** practice only; current practice and all due reviews survive.
- **Resume** restores the current stage, placements, typed answer and hints.
  Starting another passage explicitly confirms replacement of unfinished practice.
- **Review:** exact unaided recalls schedule 1, 3, 7, 14, then 30 days; assisted or
  incomplete recall schedules 10 minutes and resets the interval streak. Review
  begins directly at Recall. All saved translations/Testaments remain in the queue.
- **Calm:** soft, rounded surfaces. **Study:** crisp borders and structured grouping.
  **Focus:** less ornament and larger verse text. Each supports Light/Dark/System,
  stored on the device independently of the active exercise. The **top-right
  Preferences button** opens a responsive, keyboard-trapped dialog/sheet, closes
  with Escape and returns focus to its opener. `?scoutTheme=light` or `dark` previews
  that scheme when mode is System.
- **Theme colour:** Purple (default), Blue, Green, Rose or Neutral. Explicitly
  requested brand palettes are defined only through shared `--cp-*` theme tokens,
  with coordinated foreground, hover, soft, highlight and focus colours in both
  light and dark modes. All presets use the same selected accent. New profiles
  and v1 migrations default to Purple; existing saved v2 accents are preserved.
  **App font:** Consolas is the default across the entire app, including headings,
  navigation, dialogs, form controls, word tiles and verse text. Local fallbacks
  are Courier New, Courier and monospace; no font downloads occur. The selector
  also offers Segoe UI, Aptos and Calibri, applied app-wide. Changes preserve active
  puzzles. Fresh profiles and v1 migrations (which had no font choice) default to
  Consolas. Existing v2 saved font values are honoured, including older defaults;
  choose Consolas in Preferences to switch an existing profile.
- **Personal verses:** add or edit one at a time in Preferences, or merge a JSON
  verse collection. They are playable in every stage and appear in the Personal
  verses collection, with Both/Old/New Testament filtering. They never replace
  the six verified official texts or inherit their progress.
- Responsive layouts, 44px minimum control targets, visible keyboard focus, a skip
  link, semantic headings, text-labelled feedback, live announcements, and a
  reduced-motion override. Touch uses the same native buttons as keyboard input.
  Keyboard focus uses one slim 1px `:focus-visible` outline; pointer/touch focus
  adds no ring. Native inputs retain their caret and border, and switching to
  keyboard input restores the indicator. Puzzle selection uses a soft background
  and solid border instead of an additional focus outline.

### Honest progress

A correct word-bank exercise is **familiarity**, not unaided recall. Any explicit
hint anywhere in a session disqualifies its result from the unaided counter. A
revealed verse is recorded even after refreshing. Results never claim permanent
mastery, even after a successful recall.

Recall comparison normalises Unicode NFC, case, whitespace and curly apostrophes,
and ignores leading/trailing sentence punctuation. It does **not** ignore wrong,
missing or extra words or accept a changed word order. Feedback uses a word
alignment (replacement cost two, favouring matching subsequences). There can be
multiple reasonable alignments for an ambiguous answer. The canonical wording,
capitalisation, apostrophes and punctuation are never rewritten.

Progress uses `passage ID + translation + edition`, not just a Bible reference.
Switching translations cannot inherit another translation's progress.

### Local storage and limitations

Save schema version 2 uses `localStorage["wordkeep.prototype.v2"]`. Both reads and
writes validate preferences, known passage keys, counters, dates, personal fields
and exercise arrays. Loading and importing also verify SHA-256 content revisions.
A valid old `wordkeep.prototype.v1` save migrates in memory and is saved under the
new key; **the original v1 value is retained untouched**. A malformed v2 value is
not silently replaced by an older v1 value.

A damaged/unsupported save is left untouched and produces a visible error; the
user must explicitly choose to replace it. Adding/importing is blocked until that
notice is resolved, so it cannot accidentally destroy an unreadable save.
Storage denial/quota errors are announced and offer Retry. In-memory work can
continue without saving; an import with a write error is clearly reported as
unsaved. Export can preserve valid in-memory work even when device storage is full.

One active exercise per origin/device; no automatic cross-device sync or general
multi-tab conflict resolution. Avoid practising in several tabs at once (last
ordinary save wins). Import confirmation checks whether the current state or
stored value changed after preview, and refuses stale imports. Clearing browser
site data loses progress unless you have exported a backup. The prototype is not
a full installable/offline PWA; backups and browser storage are not encrypted.
The page has no runtime network dependency after its assets load, but a cold
offline reload is **not** guaranteed.

## Personal verses and device transfer

### Add or edit a verse

Open **Preferences → Personal verses**. Enter a reference, original text,
translation label, edition/version and Testament. Choose **Preview verse**, inspect
the summary and warnings, then **Confirm import**. Editing uses the same preview
and confirmation path. Cancel leaves all saved data unchanged.

The personal collection is selected after adding/importing verses, with Both
Testaments, so new entries are easy to find in Library. An existing puzzle remains
resumable unless you explicitly revise the very passage it uses.

Personal entries have stable UUID-based IDs. A SHA-256 revision includes the exact
reference, original text, translation label, edition and Testament. Any change,
even punctuation or whitespace, creates a new revision; **only that entry's old
progress/reviews and active exercise are reset after confirmation**. Unrelated
entries and official progress remain. A backup can restore progress recorded
against the exact incoming revision; old wording never inherits new wording's score.

### Bulk JSON template

Download the template from **Preferences → Import, export & device transfer**.
The sample below is original practice text, not a verified Bible quotation.
Replace it with text you are permitted to use:

```json
{
  "format": "wordkeep-verses",
  "version": 1,
  "verses": [
    {
      "reference": "Practice sample 1",
      "text": "Keep these sample words close.",
      "translationLabel": "Original practice text",
      "edition": "My first edition",
      "testament": "NT"
    }
  ]
}
```

Select the JSON file in the same section. Nothing changes until the entire file
passes validation, the summary is shown, and you click **Confirm import**.
There is no CSV parser and no remote content fetching.

Limits: **1 MiB UTF-8 per file/save, 100 personal entries total, 1–120 words and
2,000 characters per original text, reference 120 characters, translation label
and edition 80 characters each**. Only `OT` or `NT` are accepted. Unknown fields,
unsupported versions, excessive nesting, unsafe property names (`__proto__`,
`constructor`, `prototype`), invalid IDs and invalid session/progress shapes reject
the whole file. Text is rendered as text, never interpreted as HTML. One- and
two-word passages are supported: Fill hides the first word for these short texts.

Bulk entries may optionally include an `id` copied from an existing backup
(`user-` followed by a UUID). Same ID plus changed content is a previewed edit.
Without an ID, exact content/metadata duplicates are deduplicated and retain the
existing local ID; different text creates a separate entry, even at the same
reference. IDs must be unique within one input file. Exact duplicates between
devices remap incoming progress/session keys to the retained local ID. Ambiguous
ID/content collisions are rejected rather than guessed.

### Transfer to another device

1. On the source device, open **Preferences → Import, export & device transfer →
   Export backup**. Keep the downloaded `verse-recall-backup.verse-recall.json` private.
2. Move that file securely to your other device (for example, using your own
   encrypted removable storage). Verse Recall does not upload or automatically sync it.
3. Open the same version of Verse Recall on the destination device/browser. For another
   development computer, copy the app code without `node_modules`, install with
   `npm ci`, and start it using the run command above. Once Pages is deployed, a
   phone can open that HTTPS URL directly; the app is not an installable/offline
   PWA and the destination needs to load the app before importing a backup.
4. In Preferences, select the backup under **Import verses or backup**, inspect
   counts and warnings, choose the conflict options, then **Confirm import**.
5. Close Preferences and continue the restored exercise. Keep a backup until the
   destination's data is confirmed. Device-local saves do not keep devices in sync.

Backups use `{ "format": "wordkeep-backup", "version": 2, "exportedAt": "<ISO date>",
"state": { ... } }`. They contain personal entries with IDs/revisions, all
preferences, progress/review dates, and the resumable session including typed
answers and recorded hints. Use app-generated backups rather than hand-editing
hashes. Official text itself is not reimported or replaced.

Merge defaults are deliberately conservative: unrelated data is kept, missing
progress is added, matching local progress is retained without summing counters,
and an existing local exercise is kept. A fresh destination restores the complete
backup deterministically. **Use the backup's preferences** is checked by default.
The separate **Replace matching progress and my current session** option is
unchecked by default; selecting it previews those overwrites (including clearing
the current session if the backup has none). Completed Results are not restored
against a different retained progress record. Changed personal text always resets
its old revision as described above.

**Privacy and rights:** exported JSON is unencrypted and includes private personal
content and typed answers. Anyone with the file can read it. Keep it out of public
repositories, shared folders and source-control commits. `*.verse-recall.json`, legacy `*.wordkeep.json` and
`backups` are ignored locally as an extra guard, not a security boundary. Importing
or exporting does not grant copyright or redistribution rights. Verse Recall does not
verify personal wording, licensing or verse numbering, and never labels it as
verified official content.

## Content provenance and rights

Text was retrieved from **official sources on 20 September 2026 UTC**. Independent
download receipts are in `sources\official-verses.json`, with extracted verse
text, retrieval timestamps, URLs and SHA-256 hashes of the full source response.
The source-fidelity test compares all six bundled answers to these receipts
(normalising layout whitespace only). Psalm's WEB poetry line break is retained.

| Translation | Edition recorded | Source |
|---|---|---|
| WEB British Edition | 2020 stable; source files dated 12 September 2026 | [Psalm 119](https://ebible.org/eng-webbe/PSA119.htm), [Joshua 1](https://ebible.org/eng-webbe/JOS01.htm), [John 14](https://ebible.org/eng-webbe/JHN14.htm) |
| BSB | Official text snapshot, 20 September 2026 (not a publisher edition number) | [Official plain text](https://bereanbible.com/bsb.txt), linked from [official downloads](https://berean.bible/downloads.htm) |

The legacy `https://ebible.org/webbe/` route returned a broken redirect during
retrieval. Use the verified `eng-webbe` paths above, **not** the American WEB text.

- **WEB British:** [official rights statement](https://ebible.org/eng-webbe/copyright.htm)
  places the text in the public domain. “World English Bible” is a trademark.
  Verse Recall preserves the verbatim source and labels hidden/shuffled activities as
  **learning exercises**, not as an altered Bible translation.
- **BSB:** [official terms](https://berean.bible/terms.htm) dedicate the text to the
  public domain under [CC0](https://creativecommons.org/publicdomain/zero/1.0/) as of
  30 April 2023; all uses are freely permitted. Attribution is appreciated.
  Attribution from the downloaded text: “The Holy Bible, Berean Standard Bible,
  BSB is produced in cooperation with Bible Hub, Discovery Bible, unfoldingWord,
  Bible Aquifer, OpenBible.com, and the Berean Bible Translation Committee.”
- Each passage has source, rights/attribution via its edition, and an explicit
  source-numbering mapping (`scheme`, `book`, `chapter`, `verses`). Curated IDs are
  independent of numbering. No assumption that future translations share numbering.
  Mapping multiple verses or unavailable equivalents is a future provider concern.
- **Not bundled:** NIV, ESV, NKJV or KJV. No licence clearance is claimed for them.
- **API.Bible is deferred.** Obtain written permission covering hiding/shuffling,
  commercial use and caching/offline behaviour before integration. Its
  [terms](https://api.bible/terms-and-conditions) impose translation-specific
  conditions and reporting requirements. No API keys belong in the client.

To retrieve a **new** source snapshot deliberately:

```powershell
npx tsx tests\capture-sources.ts
npm test
```

This contacts only the official Bible sources and replaces local receipts. Review
any changed text and edition identifier before adopting a new snapshot. Do not
silently refresh production content underneath existing progress.

## Architecture

Lightweight TypeScript and Vite, with no runtime framework or component dependency.

| File | Responsibility |
|---|---|
| `src\content.ts` | Typed content provider, immutable source answers, source mappings and rights |
| `src\engine.ts` | Renderer-independent exercises, comparison, hints, progress and scheduling |
| `src\store.ts` | Versioned save validation, explicit error handling, preferences and due queue |
| `src\personal.ts` | Bounded schemas and SHA-256 content identities for personal text |
| `src\transfer.ts` | Versioned JSON parsing, read-only merge plans, confirmed import and export |
| `src\preferences.ts` | Accessible modal, verse editor and device-transfer UI |
| `src\main.ts` | DOM renderer and accessible interactions |
| `src\style.css`, `index.html` | Clawpilot tokens, Consolas-default app-wide typography, preset attributes and responsive layout |

A later network provider can implement `ContentProvider` without changing scoring.
Async loading, licensing enforcement and key-bearing server infrastructure are
deliberately not implemented.

## Verification

```powershell
npm run typecheck
npm test
npm run test:browser
npm run test:pages
npm run test:mutations
```

Playwright needs its Chromium binary; if the runner reports it missing, install it
with `npx playwright install chromium`. Browser tests automatically start/reuse the
local Vite server on port 5180. Production Pages tests use a separate preview on
port 4179, so they exercise the built artifact rather than the development server.

There are **19 engine/storage/content/transfer tests, 13 browser tests and one
production Pages test**. Every test has a
targeted, real behaviour mutation in `tests\mutations.mjs`: baseline pass, deliberate
break, assertion failure, source restoration in `finally`, then targeted pass.
Logs and a machine-readable report are written to `verification`. This is targeted
mutation verification, **not** a claim of exhaustive mutation coverage.

The browser checks play all six passages end-to-end, reload typed recall, verify
translation-isolated progress, all nine preset/mode preferences, due reviews
outside the active filters, hint accounting, keyboard and desktop drag/drop,
visible save errors, and no horizontal overflow at 390×844, 1024×768 and 1440×1000.
New regressions cover v1 migration with the original preserved, content revisions,
bounded malicious/malformed imports, deduplication and conflict handling, full
backup round trips into a fresh browser context, personal editor/play/revision
flows, long unbroken references, and modal focus trapping/Escape/return focus.
One- and two-word personal passages are checked through the whole learning loop.
Every new regression also has a targeted failing mutation and restored passing run.
Screenshots for each preset in Light/Dark at those sizes are written to
`verification`, plus a phone arrangement screenshot. Automated DOM checks do not
replace a full screen-reader audit or testing on physical mobile hardware.

## Next milestone, not implemented

30-reference official collection; fuller spaced-repetition design; installable PWA
with reliable offline updates; encrypted backups, CSV support and further schema
migrations; multi-tab sync;
manual screen-reader/device audit; optional audio and speed mode; licensed API
integration; accounts/sync, name clearance and custom domains.
The Pages workflow is prepared; actual publication still requires owner approval
and a successful first GitHub deployment.
