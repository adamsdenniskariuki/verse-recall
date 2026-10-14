import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Each new test must observe a real behavioural defect, not a compile failure.
// Source is restored in finally, and the same targeted test must then pass.
const cases = [
  ['official source fidelity', 'src/content.ts', 'I have hidden your word in my heart,', 'I have lost your word in my heart,'],
  ['recall normalization', 'src/engine.ts', ".toLocaleLowerCase('en-GB')", ''],
  ['recall alignment feedback', 'src/engine.ts', "kind: 'missing', expected: a[--i]", "kind: 'extra', expected: a[--i]"],
  ['bank interchangeability and placement', 'src/engine.ts',
    'normalizeWord(words(p.text)[token]) === normalizeWord(words(p.text)[index])', 'token === index'],
  ['learning stages and recorded hints', 'src/engine.ts',
    "if (run.stage === 'read') return { ...run, stage: 'fill' };", "if (run.stage === 'read') return { ...run, stage: 'recall' };"],
  ['honest recall scheduling', 'src/engine.ts',
    'exact && run.hints === 0 && !run.exposed', 'exact'],
  ['save validation and recovery', 'src/store.ts',
    '!record(value) || value.version !== 2 ||', '!record(value) ||'],
  ['preferences preserve exercise and persist', 'src/store.ts',
    'return { ...state, preferences: { ...state.preferences, ...patch } };',
    'return { ...state, run: null, preferences: { ...state.preferences, ...patch } };'],
  ['review queue survives content filters', 'src/store.ts',
    '.filter(p => p.due <= now)', '.filter(p => p.due <= now && p.key.includes(state.preferences.translation))'],
  ['six playable passages and separate progress', 'src/engine.ts',
    "if (run.stage === 'arrange' && bankCorrect(p, run)) return { ...run, stage: 'recall', bankCompleted: true };",
    "if (run.stage === 'arrange' && bankCorrect(p, run)) return { ...run, stage: 'arrange', bankCompleted: true };", 'browser'],
  ['theme preferences preserve typed recall', 'src/main.ts',
    'document.documentElement.dataset.preset = preset;', "document.documentElement.dataset.preset = preset === 'study' ? 'calm' : preset;", 'browser'],
  ['responsive layouts and accessible targets', 'src/styles/layout.css',
    '.shell { max-width: 1120px;', '.shell { min-width: 1100px; max-width: 1120px;', 'browser'],
  ['save corruption and write errors are visible', 'src/main.ts',
    'if (warning) warning.innerHTML = ui.saveError', 'if (warning) warning.innerHTML = false', 'browser'],
  ['keyboard drag hints and unfiltered reviews', 'src/engine.ts',
    'exact && run.hints === 0 && !run.exposed', 'exact', 'browser'],
  ['legacy saves migrate without overwriting originals', 'src/store.ts',
    'p[key] = next[key];', 'void next;'],
  ['unflagged appearance moves to new defaults while explicit choices stay', 'src/store.ts',
    'p[key] !== PREVIOUS_DEFAULTS[key]);', 'true);'],
  ['old backups without appearance flags migrate on import', 'src/transfer.ts',
    '    migratePreferences(value.state);', '    void migratePreferences;'],
  ['every theme meets WCAG AA contrast', 'src/theme.ts',
    "'--cp-text-soft': '#66625b'", "'--cp-text-soft': '#8a857c'"],
  ['first-paint tokens match the default theme', 'index.html',
    '--cp-accent: #0f6b66;', '--cp-accent: #b11f4b;'],
  ['refreshed look can be kept or restored for older saves', 'src/main.ts',
    'ui.state = choose(ui.state, ui.appearanceNotice);', 'ui.state = choose(ui.state, {});', 'browser'],
  ['personal content identity and playable filters', 'src/personal.ts',
    'verseFields.map(field => input[field])', "verseFields.filter(field => field !== 'edition').map(field => input[field])"],
  ['backup round trip restores complete state', 'src/transfer.ts',
    "exportedAt: now.toISOString(), state }, null, 2", "exportedAt: now.toISOString(), state: { ...state, run: null } }, null, 2"],
  ['content updates reset only matching progress', 'src/transfer.ts',
    'delete next.progress[oldKey];', 'void oldKey;'],
  ['untrusted JSON is rejected atomically', 'src/transfer.ts',
    '!validState(value.state) || !await verifyRevisions(value.state.personal)', '!validState(value.state)'],
  ['backup conflicts keep local data by default', 'src/transfer.ts',
    'if (!options.replaceProgressAndSession) { plan.progressKept++; continue; }', 'if (false) { plan.progressKept++; continue; }'],
  ['duplicate content remaps backup session safely', 'src/transfer.ts',
    'remap.set(keyOf(verse), keyOf(identical));', 'remap.set(keyOf(verse), keyOf(verse));'],
  ['preferences dialog focus colour font and responsive sheet', 'src/preferences.ts',
    "if (event.key !== 'Tab') return;", 'if (true) return;', 'browser'],
  ['personal editor plays and safely revises text', 'src/content.ts',
    "text: verse.text, source: '', personal: verse,", "text: 'Changed ' + verse.text, source: '', personal: verse,", 'browser'],
  ['bulk import and private backup transfer round trip', 'src/transfer.ts',
    'next.preferences = structuredClone(incoming.state.preferences);', 'next.preferences = structuredClone(current.preferences);', 'browser'],
  ['short personal passages stay playable', 'src/engine.ts',
    'tokens.length < 3 ? [0]', 'tokens.length < 3 ? []'],
  ['font defaults preserve saved choices', 'src/store.ts',
    "colour: 'system', accent: 'teal', font: 'serif'", "colour: 'system', accent: 'teal', font: 'segoe'"],
  ['default fonts pair serif scripture with a clean interface and honor saved choices', 'src/styles/base.css',
    'input::file-selector-button { font: inherit; }', 'input::file-selector-button { font: initial; }', 'browser'],
  ['accent defaults preserve saved choices', 'src/store.ts',
    "colour: 'system', accent: 'teal', font: 'serif'", "colour: 'system', accent: 'rose', font: 'serif'"],
  ['accent palettes contrast persist and preserve practice', 'src/theme.ts',
    "hover: '#5b21b6'", "hover: '#ffffff'", 'browser'],
  ['focus indicators follow keyboard and pointer input', 'src/styles/base.css',
    'outline: 1px solid var(--cp-focus);', 'outline: 3px solid var(--cp-focus);', 'browser'],
  ['Verse Recall branding preserves legacy saves and backup formats', 'src/preferences.ts',
    "'verse-recall-backup.verse-recall.json'", "'wordkeep-backup.wordkeep.json'", 'browser'],
  ['Bible thought logo adapts without changing accessible branding', 'src/assets/verse-recall-mark.svg',
    'd="M30 3.5H38.5A6 6 0 0 1 38.5 15.5H34.5L31.5 18V15.5H30A6 6 0 0 1 30 3.5Z"', 'd=""', 'browser'],
  ['Pages production assets and navigation use the custom-domain root', 'vite.config.ts',
    "base: '/'", "base: '/verse-recall/'", 'pages'],
  ['official catalogue covers both Testaments with exact source words', 'src/bible-catalog.ts',
    "}).join('\\n');", "}).join('\\n') + ' altered';"],
  ['official selections restore and transfer without trusting imported text', 'src/transfer.ts',
    'next.official = [...selections.values()];', 'next.official = [];'],
  ['Bible loading validates assets and rejects unsupported ranges', 'src/bible-catalog.ts',
    'bytes.length > limit || await digest(bytes) !== hash', 'bytes.length > limit'],
  ['Bible picker adds official OT and NT verses and transfers progress', 'src/main.ts',
    'ui.state.official = [...existing, selection];', 'ui.state.official = [...existing];', 'browser'],
  ['Bible picker shows loading errors and rejects oversized ranges', 'src/bible-catalog.ts',
    'text.length > 2000 || text.trim().split(/\\s+/u).length > 120', 'text.length > 200000 || text.trim().split(/\\s+/u).length > 12000', 'browser'],
  ['concurrent Bible loads share requests and retry failures', 'src/bible-catalog.ts',
    'if (inFlight) return inFlight;', 'if (false) return inFlight;', undefined],
  ['every memory plan verse resolves in both verified editions with manifest names', 'src/plans.ts',
    'const next = rows.findIndex(row => !row || row.unaided < 1);', 'const next = rows.findIndex(row => !row);'],
  ['the library accepts up to the official selection limit', 'src/store.ts',
    'value.official.length > MAX_OFFICIAL', 'value.official.length > 100'],
  ['memory plans load verified verses on demand and track plan progress', 'src/views/plans.ts',
    "progress.unaided > 0 ? 'Kept' : 'Practised'", "'Practised'", 'browser'],
  ['verse of the day is stable, loads only when opened and reports failures', 'src/views/home.ts',
    '<p class="load-status error" role="alert">', '<p class="load-status error" role="status">', 'browser'],
  ['welcome tour invites new visitors, walks every section and can be replayed', 'src/main.ts',
    "try { storage.setItem(TOUR_KEY, '1'); }", 'try { void TOUR_KEY; }', 'browser'],
  ['every section fits phones, tablets and desktops', 'src/styles/views.css',
    'grid-template-columns: repeat(5, minmax(0, 1fr));', 'grid-template-columns: repeat(5, 120px);', 'browser'],
  ['streaks, freezes and XP follow local days gently', 'src/journey.ts',
    'else if (missed <= freezes) { frozen = missed; freezes -= missed; current++; }', 'else if (missed <= freezes) { frozen = missed; current++; }'],
  ['streaks, freezes and XP follow local days gently', 'src/journey.ts',
    'current % FREEZE_EVERY === 0 && freezes < MAX_FREEZES;', 'current % FREEZE_EVERY === 0;'],
  ['streaks, freezes and XP follow local days gently', 'src/journey.ts',
    'return missed <= journey.freezes ? journey.current : 0;', 'return journey.current;'],
  ['journey and first-letter hints validate, save and travel in backups', 'src/store.ts',
    'integer(j.best) && j.current <= j.best &&', 'integer(j.best) &&'],
  ['journey and first-letter hints validate, save and travel in backups', 'src/engine.ts',
    "if (run.stage !== 'recall' || run.letters) return run;", "if (run.stage !== 'recall') return run;"],
  ['journey and first-letter hints validate, save and travel in backups', 'src/transfer.ts',
    'if (journey) next.journey = structuredClone(journey);', 'if (journey) void journey;'],
  ['streaks, freezes, XP and badges celebrate practice gently', 'src/main.ts',
    'badges: earnedBadges(ui.state).filter(id => !before.includes(id))', 'badges: earnedBadges(ui.state)', 'browser'],
  ['first-letter hints and optional read-aloud', 'src/main.ts',
    `if (speaking() && !document.querySelector('[data-action="listen"]')) stopSpeaking();`, 'if (false) stopSpeaking();', 'browser'],
  ['read-aloud stays hidden when the browser cannot speak', 'src/speech.ts',
    "typeof window.speechSynthesis?.speak === 'function'", "'speechSynthesis' in window", 'browser'],
];
await mkdir('verification', { recursive: true });
const report = [];
function run(name, browser) {
  if (browser === 'pages') {
    const build = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { encoding: 'utf8', timeout: 180_000 });
    if (build.error || build.status !== 0) throw new Error(`Production build failed: ${build.error ?? build.stdout + build.stderr}`);
  }
  const args = browser === 'pages'
    ? ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.pages.config.ts', '--grep', `${name}$`]
    : browser
    ? ['node_modules/@playwright/test/cli.js', 'test', '--grep', `${name}$`]
    : ['node_modules/tsx/dist/cli.mjs', '--test', '--test-name-pattern', `^${name}$`, 'tests/engine.test.ts'];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 180_000 });
  if (result.error) throw result.error;
  return { exit: result.status, output: result.stdout + result.stderr, command: `node ${args.join(' ')}` };
}
for (const [name, file, before, after, browser] of cases) {
  const original = await readFile(file, 'utf8');
  if (original.split(before).length !== 2) throw new Error(`Mutation anchor must occur exactly once: ${name}`);
  const baseline = run(name, browser);
  if (baseline.exit !== 0) throw new Error(`Baseline failed: ${name}\n${baseline.output}`);
  let broken;
  try {
    await writeFile(file, original.replace(before, after));
    broken = run(name, browser);
    if (broken.exit === 0) throw new Error(`Mutation survived: ${name}`);
    if (!/AssertionError|Error: expect|Expected|not ok/u.test(broken.output)) {
      throw new Error(`Mutation did not fail an assertion: ${name}\n${broken.output}`);
    }
  } finally {
    await writeFile(file, original);
  }
  const restored = run(name, browser);
  if (restored.exit !== 0) throw new Error(`Restored test failed: ${name}\n${restored.output}`);
  if (await readFile(file, 'utf8') !== original) throw new Error(`Source restoration failed: ${file}`);
  const id = String(report.length + 1).padStart(2, '0');
  await writeFile(`verification/mutation-${id}.log`, `BASELINE\n${baseline.output}\nMUTANT\n${broken.output}\nRESTORED\n${restored.output}`);
  report.push({ test: name, file, mutation: { before, after }, baseline: baseline.exit, mutant: broken.exit, restored: restored.exit,
    restoredSha256: createHash('sha256').update(original).digest('hex'), command: restored.command });
  await writeFile('verification/mutation-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(`KILLED + RESTORED ${report.length}/${cases.length}: ${name}`);
}
console.log(`${report.length} tests mutation-verified; all source restored and every targeted test passing.`);
