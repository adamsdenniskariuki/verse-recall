# Verse Recall prototype plan

## Product scope

A calm, accurate Bible-memory puzzle by Made by Favor. Build the complete learning
loop around three curated references in WEB British and BSB before expanding the
catalogue. The standalone app targets GitHub Pages on
`verserecall.madebyfavor.com`, using only reviewed public source and no private saves.

Renamed from WordKeep for display only. Keep the legacy internal package name,
storage keys, JSON format identifiers and passage IDs for saved-data and backup
compatibility; suggested filenames and visible branding use Verse Recall.

## Milestones

1. **Verified content:** retrieve Psalm 119:11, Joshua 1:8 and John 14:27 from
   official sources in both translations. Preserve exact answers, numbering
   mappings, edition IDs and rights metadata with independent source receipts.
2. **Playable engine:** Read, Fill, Arrange, typed Recall and Results. Prefer
   accuracy over speed. Make repeated words interchangeable; record hints and
   distinguish bank familiarity from unaided recall.
3. **Device-local loop:** validate saves, resume unfinished practice, schedule
   reviews and isolate progress by passage/translation/edition. Filters select
   new content but do not discard reviews. Preserve and migrate prototype v1 saves.
4. **Accessible presentation:** native tap/keyboard controls plus optional drag,
   responsive phone/tablet/desktop layouts. Calm, Study and Focus presets, each
   with independently persisted Light/Dark/System mode. Shared Clawpilot colours.
5. **Evidence and handoff:** build/typecheck, functional/browser checks, then
   mutation-verify every test with deliberate failure and restored pass. Inspect
   responsive screenshots, run an attached local server and document limitations.
6. **Approved preferences/transfer iteration:** move settings behind an accessible
   top-right Preferences dialog; offer shared-token Purple/Blue/Green/Rose/Neutral colours and local
   app-font options. Consolas is the app-wide default by explicit user preference;
   preserve existing saved font choices. Purple is the default accent by explicit
   user request; saved accent choices are preserved. Add editable personal passages and bounded bulk JSON import.
   Distinguish them from the six verified official texts.
7. **Private device transfer:** versioned JSON backup of preferences, personal text,
   progress/reviews and valid active session. Validate the complete file, preview a
   non-destructive merge, then explicitly confirm any overwrite. Deduplicate exact
   content, preserve stable IDs, and reset only changed content revisions.
8. **Static hosting:** build with root `/` asset paths for
   `verserecall.madebyfavor.com`, verify the production browser experience at that
   path, then deploy only `dist` with GitHub Pages. Verify DNS and certificate
   readiness independently. Keep personal runtime data and test output private.

## Reversible implementation choices

- Vanilla TypeScript + Vite: no UI framework needed for this bounded prototype.
- Each fill exercise hides every fourth word starting at the third (the first word
  for one-/two-word texts); arrangement uses individual words. Recall ignores
  sentence punctuation, not missing words.
- Any explicit session hint prevents an unaided result. Review intervals are
  1/3/7/14/30 days after unaided recalls, 10 minutes otherwise.
- One resumable exercise, no multi-tab synchronisation. Storage failure is visible;
  corrupted data is not silently replaced.
- Personal collection: at most 100 entries, each 1–120 words / 2,000 characters.
  JSON is bounded to 1 MiB. Exact SHA-256 text/metadata revisions protect progress
  identity; migration retains the original v1 stored value.
- Existing progress and current session win conflicts by default. Replacing them
  needs an explicit option in a read-only preview and final confirmation.
- Exports are private, unencrypted local files. No upload, cloud sync or implied
  copyright permissions; no personal runtime data is written into source files.

## Deferred

30 official passages, full PWA/offline lifecycle, encrypted backups/CSV, external
Bible APIs, more licensed translations, accounts/sync, timers/audio, brand clearance,
automatic cloud sync. API.Bible requires explicit rights review for
exercises and caching. General multi-tab reconciliation and full screen-reader/
physical-device audits remain future work.

See `README.md` for runnable commands, exact provenance and validation scope.
