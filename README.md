# Verse Recall — Bible Memory

**By Made by Favor. Inspired by Joshua 1:8.**
A quiet place to learn Scripture, practise recall and return to the words you keep.
Live at **<https://verserecall.madebyfavor.com/>**.

- **Practise:** Read → Fill → Arrange → Recall → Results, with no timer. Hints, including
  first letters, are recorded and never count as unaided recall.
- **Content:** ten curated memory plans (Foundations, Psalm 23, the Romans Road, the
  Beatitudes, the Lord’s Prayer, Fruit of the Spirit, the Armour of God, comfort for
  anxious days, promises, and a verse a week for a year), a verse of the day, and the
  whole 66-book Bible in **WEB British** and **BSB** via a book/chapter/verse picker.
  You can also add personal passages.
- **Rhythm:** spaced reviews, gentle streaks with saved streak freezes, XP and badges.
- **Comfort:** serif scripture with a clean interface, a dyslexia-friendly reading font,
  several colour themes, light/dark mode that follows the system, and optional
  read-aloud using the browser’s own voices.
- **Private and offline:** no account, analytics or backend. Progress stays in browser
  storage. The app installs as a PWA, and the Bible chapters you open are cached for
  offline use. A versioned JSON backup moves progress between devices.

## Run locally

Requires Node.js 22.12+ and a current Chromium, Firefox or Safari. Use the loopback URL,
not `file://`, because content hashing uses Web Crypto.

```powershell
npm ci
npm run dev -- --port 5178 --strictPort   # http://127.0.0.1:5178/
npm run build                             # typecheck + production build into dist
npm run preview -- --port 4178 --strictPort
```

The service worker is registered only in production builds. Browser storage is per
origin, so data does not move automatically between localhost and the live site.
Export a backup on one and import it on the other.

## Tests

```powershell
npm test               # unit, content-fidelity and migration tests (node:test via tsx)
npm run test:browser   # Playwright against the dev server
npm run build; npm run test:pages   # full browser suite + PWA/offline checks on the production build at /
npm run test:mutations # deliberately breaks code per test, expects a failing assertion, then restores
```

`npm run test:pages` blocks service workers for the shared suite, so request mocks still
apply. `tests/pages.spec.ts` opts in to verify the manifest, icons, the precached shell and
an offline reload of an opened chapter. Mutation logs are written to the ignored
`verification/` folder. Responsive layouts are checked at 360, 768 and 1440 px, and every
theme’s text and accent pairs are tested against WCAG AA contrast.

## Deploy (GitHub Pages)

- **Source:** *Settings → Pages → Build and deployment → GitHub Actions*.
  `.github/workflows/pages.yml` runs on every push to `main`: `npm ci`, unit tests, build,
  then the production browser suite. Only `dist` is uploaded. A failing test blocks the deploy.
- **Permissions:** the actions are pinned by SHA. Only the deploy job gets `pages: write` and
  `id-token: write`, and no secrets are used.
- **Domain:** Vite builds for the root `/`, not `/verse-recall/`. `public/CNAME` and the
  repository's Pages custom-domain setting must both be `verserecall.madebyfavor.com`. The DNS
  record is a DNS-only `CNAME verserecall → adamsdenniskariuki.github.io`, with proxying off for
  certificate issuance. Do not change the apex or other subdomains. HTTPS is enforced; after
  any DNS or certificate change, check the Actions run and the Pages settings.
- **Offline:** Vite emits `sw.js` at build time (`vite.config.ts` + `tools/service-worker.js`).
  It precaches the hashed shell, uses network-first for pages and cache-first for
  `/bibles/<snapshot>/` chapters. Old app caches and chapters from other snapshots are pruned
  on activation.
- **Icons:** `public/icons/icon.svg` is the source. Regenerate the PNGs with
  `node tools/make-icons.mjs`.

## Compatibility

Verse Recall was previously called WordKeep. These identifiers must not change, because
existing saves and backups depend on them:

| What | Value |
|---|---|
| Save keys | `localStorage["wordkeep.prototype.v2"]` (current) and `wordkeep.prototype.v1` (migrated in memory; the original value is kept untouched) |
| Backup | `{ "format": "wordkeep-backup", "version": 2, "exportedAt", "state" }` |
| Bulk verse template | `{ "format": "wordkeep-verses", "version": 1, "verses": [...] }` |
| Passage IDs/versions | Curated IDs, `user-<uuid>` personal IDs with SHA-256 revisions, official snapshot references |
| Test setting | `WORDKEEP_TEST_URL` |

Later additions are optional keys with explicit validation, so older saves load unchanged.
These additions are appearance flags (unchosen defaults move to the new look; explicit
choices, including Consolas or Purple, are kept), plan progress, the welcome tour and the
`journey` (streak/XP). Damaged saves are never silently replaced: the user sees a notice and
must choose to replace. Imports are fully validated, previewed and merged conservatively
before confirmation.

**Limits:** 100 personal entries (1–120 words, 2,000 characters each), 100 added official
selections, JSON files up to 1 MiB, and ranges within one chapter. Backups are
**unencrypted** and contain typed answers, so keep them private. One active exercise per
device; no multi-tab sync.

## Content provenance and rights

Only public-domain/CC0 texts are bundled. **NIV, ESV, NKJV and KJV are not included**, and no
licence is claimed for them. Shuffled or hidden text is presented as a learning exercise,
not an altered translation.

| Translation | Source | Rights |
|---|---|---|
| WEB British Edition (2020 stable) | [eng-webbe VPL](https://ebible.org/Scriptures/eng-webbe_vpl.zip) via [ebible.org](https://ebible.org/find/details.php?id=eng-webbe); not the American WEB | [Public domain](https://ebible.org/eng-webbe/copyright.htm). “World English Bible” is a trademark. |
| Berean Standard Bible | [bsb.txt](https://bereanbible.com/bsb.txt) from [official downloads](https://berean.bible/downloads.htm), snapshot 20 September 2026 | [CC0 / public domain](https://berean.bible/terms.htm) since 30 April 2023 |

BSB attribution: “The Holy Bible, Berean Standard Bible, BSB is produced in cooperation with
Bible Hub, Discovery Bible, unfoldingWord, Bible Aquifer, OpenBible.com, and the Berean
Bible Translation Committee.”

- `sources/official-verses.json` holds independent receipts (URL, time, SHA-256) for the
  starter verses. The fidelity test compares the bundled text to them.
- `sources/bible-catalog-receipt.json` records input hashes and coverage: 31,098 WEB British
  and 31,086 BSB references across 66 books. Blank source references are listed explicitly.
- `tools/build_bible_catalog.py` rebuilds `public/bibles/<snapshot>/` (2,378 chapter files
  plus a manifest) from the official downloads. `src/bible-version.ts` pins the manifest
  hash, and each manifest entry pins its chapter hash. Chapters load on demand and are
  verified. Git attributes disable newline conversion so the hashes hold on every OS.
- Every curated plan verse is tested to resolve in both editions. Keep old snapshot
  folders when publishing a new one, because saves reference them.
- API.Bible and other licensed translations remain deferred until rights for hiding,
  shuffling, caching and offline use are granted in writing.

## Architecture

Vanilla TypeScript + Vite, with no UI framework or runtime dependencies.

| Area | Files |
|---|---|
| Controller and screens | `src/main.ts`, `src/ui.ts`, `src/views/*` (shell, today/library/review/progress, plans, practice) |
| Learning engine | `src/engine.ts` (stages, hints, scoring, review intervals), `src/journey.ts` (streaks, XP, badges) |
| Content | `src/content.ts`, `src/plans.ts`, `src/bible-catalog.ts`, `src/bible-picker.ts` |
| Saves and transfer | `src/store.ts` (validation, migration), `src/transfer.ts`, `src/personal.ts`, `src/preferences.ts` |
| Look and sound | `src/theme.ts`, `src/styles/*.css`, `src/speech.ts`, `src/assets/verse-recall-mark.svg` |
