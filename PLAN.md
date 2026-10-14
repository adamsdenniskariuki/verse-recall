# Verse Recall roadmap

A calm, accurate Bible-memory app by Made by Favor, hosted on GitHub Pages at
`verserecall.madebyfavor.com`. Only public-domain/CC0 text (WEB British, BSB), with no
accounts or private data leaving the device.

## Shipped

1. **Verified content:** the full 66-book WEB British and BSB catalogues are built from
   official downloads. Chapter assets are hash-pinned and loaded on demand. The starter
   verses have independent source receipts.
2. **Learning loop:** Read, Fill, Arrange, typed Recall and Results. Hints (reveal or first
   letters) are recorded and never count as unaided recall. Reviews come back after
   1/3/7/14/30 days for unaided recalls, and after 10 minutes otherwise.
3. **Device-local saves:** strict validation, resumable practice, a visible error rather
   than a silent replacement, v1→v2 migration that keeps the original value, and
   previewed, conservative JSON import/export.
4. **Design system:** serif scripture with a sans interface, a dyslexia-friendly font,
   named colour themes, system-following dark mode, a test that enforces WCAG AA
   contrast, and layouts verified at 360/768/1440 px. Default looks migrate; explicit
   choices are kept.
5. **Content and navigation:** Today, Plans, Library, Review, Progress and Settings; ten
   curated plans with progress; a verse of the day; a replayable welcome tour.
6. **Rhythm:** streaks with earned freezes (up to two), XP and derived badges, plus
   optional read-aloud via `speechSynthesis`.
7. **PWA:** an installable manifest and icons; a production service worker that precaches
   the shell and caches opened chapters for offline use.

## Standing decisions

- Vanilla TypeScript + Vite, with no runtime dependencies.
- Legacy identifiers (`wordkeep.prototype.v1/v2`, `wordkeep-backup`, `wordkeep-verses`,
  passage IDs) are permanent. New state is added only as optional, validated keys.
- Ranges are never truncated or substituted across editions. Old Bible snapshots stay
  published while saves reference them.
- Every behavioural test is mutation-verified (`npm run test:mutations`).

## Deferred

Encrypted backups, CSV, accounts and sync, multi-tab reconciliation, licensed translations
(API.Bible needs a written rights review covering exercises, caching and offline use), and
recorded audio.
