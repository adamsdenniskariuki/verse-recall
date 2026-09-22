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

Open <http://127.0.0.1:5178/>. The development server binds only to loopback.
Stop it with Ctrl+C; restart with the command above.

```powershell
npm run build
npm run preview -- --port 4178 --strictPort
```

Production output is in `dist`; preview it at
<http://127.0.0.1:4178/>. Keep the same origin/port to retain the same
browser save. Moving from localhost to a hosted site does not automatically move
data: export a private backup on the old origin and import it on the new one.

## GitHub Pages

Repository: <https://github.com/adamsdenniskariuki/verse-recall>.
Production domain: **https://verserecall.madebyfavor.com/**.
Vite builds with root base `/`, not the repository subpath `/verse-recall/`.
The domain's DNS and GitHub Pages certificate have been verified, with HTTPS
enforcement enabled. Future DNS changes or renewals should still be checked
independently of application builds.

**Settings → Pages → Build and deployment → Source: GitHub Actions** is the
deployment source. A push to `main` or a manual run of
**Build and deploy Pages** restores locked dependencies, runs unit tests, builds,
and runs the browser suite against the production root path before deploying.
Only `dist` is uploaded as the Pages artifact; test output, backups and source
receipts are not part of that artifact. The public repository itself contains the
reviewed source, tests, docs and the six public-domain source receipts.

The workflow uses pinned GitHub-maintained actions. Build jobs have read-only
repository access; only the deployment job gets `pages: write` and `id-token:
write`. No custom secret or API key is required. A failed test blocks deployment.
The repository Pages custom-domain setting and `public/CNAME` must both be
`verserecall.madebyfavor.com`. At the DNS provider, create only this DNS-only record:

| Type | Name | Target |
|---|---|---|
| CNAME | `verserecall` | `adamsdenniskariuki.github.io` |

Do not change the apex `madebyfavor.com` or other subdomains. Keep proxying off for
certificate provisioning. After DNS resolves and GitHub issues the certificate,
enable **Enforce HTTPS** and verify the production URL and its JS/CSS assets.
The repository's `github.io/verse-recall/` address may redirect to the custom
domain; this root-base build is not intended to run under that subpath directly.
Use the Actions run and Pages settings to inspect actual deployment/certificate
status rather than treating this documented URL as proof of live readiness.

```powershell
npm run build
npm run test:pages
```

This starts a temporary production preview on port 4179 at `/`,
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
- **Choose from the Bible:** browse beyond the starter passages using
  Translation → searchable Book → Chapter → Verse, with an optional same-chapter
  range and an exact source-text preview before adding. Both translations include
  all 66 shared Protestant-canon books: 39 OT, 27 NT and 1,189 chapters each.
  WEB's deuterocanonical books are deliberately not included. Verse numbering and
  blank/omitted references follow each source independently.
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

### Choosing official Bible passages

On Today or Library, select **Choose from the Bible**. The Testament filter
initially follows Preferences; you can change it inside the picker. Search by book
name, choose chapter and verse, then read the exact preview. The default is a
single verse. A range must stay within one chapter and fit **120 words / 2,000
characters**. Longer selections and ranges crossing a blank source reference are
explicitly rejected, never truncated or filled from another translation.

**Add to my library** stores an official reference and selects that translation's
library without replacing the current exercise. The starter six remain. Repeated
adds of the same snapshot/reference are no-ops and keep progress; at most 100
additional official selections are allowed, separately from 100 personal entries.
Choose the new card to run Read → Fill → Arrange → Recall. Curated passages and
catalogue selections remain edition-keyed; no mastery is silently transferred
between different snapshots that happen to share a reference.

The initial bundle contains only a snapshot identifier and manifest SHA-256,
not the full Bible texts. The app fetches its shipped index on first browsing
(or restoration of saved official references), followed only by required chapter
JSON. Each chapter is checked against its manifest hash, and the manifest against
the compiled hash. Runtime requests use this site's static assets, never a
third-party Bible API. Missing/network/integrity errors are visible and do not add
a passage. Concurrent requests for the same index or chapter share the in-flight
load; failed loads are released so a retry can fetch again.

Backups retain the existing version-2 envelope, original storage keys and personal
data. A new optional `official` array contains only reference descriptors:
snapshot, translation, book code, chapter, start and end. Reload/import must
resolve those references against trusted shipped assets before accepting state.
Arbitrary imported text or extra "verified" fields cannot become official
passages. Existing backups without `official` remain supported; older app builds
without the picker cannot read new backups with official selections. Use the
current app on the destination.

A cold offline restore of added official selections needs matching source assets.
If unavailable, the save is preserved and the loading error is shown; restore
connectivity and reload instead of replacing that save. This is not an offline
PWA. Future source updates must retain old snapshots to support their references;
unknown snapshots are rejected rather than substituted with a new edition.

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
Exercises use their loaded text without a remote API, but browsing or restoring
official selections may need additional same-origin chapter assets. A cold
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

### Full catalogue provenance

The WEB British text-only VPL archive at
<https://ebible.org/Scriptures/eng-webbe_vpl.zip> is linked by
<https://ebible.org/find/details.php?id=eng-webbe>. Its included rights page
explicitly identifies British Edition, 2020 stable text and public-domain copying.
The publisher's VPL format removes notes, formatting, introductions and
noncanonical headings. Only original verse text is shipped.

BSB uses <https://bereanbible.com/bsb.txt>, linked by its official downloads page.
The CC0/public-domain dedication above permits text redistribution. No audio,
commentary or third-party source material is included in either catalogue.

`sources\bible-catalog-receipt.json` records input hashes, the manifest hash,
snapshot ID, exact scope and coverage. This snapshot contains 31,098 WEB British
and 31,086 BSB references with text across the shared 66-book scope. Blank source
references are recorded explicitly; totals are edition-specific and do not imply
that every verse number exists in both translations.

`tools\build_bible_catalog.py` reproducibly builds UTF-8 chapter assets from the
official downloads in ignored `verification\bible-sources`:
`eng-webbe_vpl.zip` and `bsb.txt`. It verifies book/chapter coverage and all six
independent starter receipts before updating the manifest trust anchor.
Generated assets are under `public\bibles\<snapshot>\`: 2,378 chapters and one
manifest, about 9.05 MB uncompressed in total. Only the needed chapters load.
`src\bible-version.ts` pins the manifest hash; each manifest entry pins its
chapter hash. Raw ZIP/SQL/XML, notes, rights-page HTML and other archive files
are not distributed as app assets.
Git attributes disable newline conversion for catalogue assets so their integrity
hashes remain valid on Windows as well as Linux checkouts.

To deliberately rebuild a catalogue after obtaining those official inputs:

```powershell
python tools\build_bible_catalog.py
npm run build
npm test
```

Review source and receipt changes before adopting a new edition. Preserve old
snapshot assets when existing saves depend on them.

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
| `src\bible-catalog.ts`, `src\bible-version.ts` | Lazy integrity-checked official source provider and snapshot trust anchor |
| `src\bible-picker.ts` | Searchable, accessible book/chapter/verse selection and exact preview |
| `tools\build_bible_catalog.py` | Deterministic text-only chapter generation and source coverage validation |
| `src\main.ts` | DOM renderer and accessible interactions |
| `src\style.css`, `index.html` | Clawpilot tokens, Consolas-default app-wide typography, preset attributes and responsive layout |

A later external provider can implement `ContentProvider` without changing
scoring. The official picker loads only shipped same-origin files; external API
integration, translation-specific API licence enforcement and key-bearing server
infrastructure remain deliberately out of scope.

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

There are **23 engine/storage/content/transfer tests, 15 browser tests and one
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
Catalogue checks verify every chapter hash and available-verse index, all 66 books
and 1,189 chapters per edition, non-demo OT/NT wording in both translations,
tampered assets, network errors, limits, duplicate adds, reload and source-backed
backup transfer into a fresh browser. The picker is checked on phone, tablet and
desktop without placing full text in the initial bundle.
Screenshots for each preset in Light/Dark at those sizes are written to
`verification`, plus a phone arrangement screenshot. Automated DOM checks do not
replace a full screen-reader audit or testing on physical mobile hardware.

## Next milestone, not implemented

Expanded curated learning plans; fuller spaced-repetition design; installable PWA
with reliable offline updates; encrypted backups, CSV support and further schema
migrations; multi-tab sync;
manual screen-reader/device audit; optional audio and speed mode; licensed API
integration; accounts/sync, name clearance and custom domains.
DNS propagation and initial HTTPS certificate issuance are hosting prerequisites,
not application features. They must be verified separately from a passing build.
