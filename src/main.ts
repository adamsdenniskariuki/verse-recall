import './styles/index.css';
import { collectionName } from './content';
import { DEFAULT_OPEN_IN } from './open-in';
import { activeIndices, bankCorrect, finish, hint, letterHint, nextStage, normalizeWord, placeToken, startRun, type Run } from './engine';
import { choose, LEGACY_STORAGE_KEY, loadState, rememberSearch, saveState, STORAGE_KEY, type StoragePort } from './store';
import { escapeHtml as e } from './html';
import { PreferencesDialog } from './preferences';
import { bibleSelectionKey, MAX_OFFICIAL, resolveBibleSelection, snapshotFor, type BibleSelection, type BibleTranslation } from './bible-catalog';
import { BiblePicker } from './bible-picker';
import { installTheme } from './theme';
import { planSelection, plans, planTranslation, verseOfTheDay } from './plans';
import { plural, provider, runPassage, ui, type View } from './ui';
import { library, progress, review, today } from './views/home';
import { plansView } from './views/plans';
import { findView } from './views/find';
import { refreshVoice, stopVoice, voiceAction, type VoiceHost } from './find-voice';
import { listenLabel, practice } from './views/practice';
import { earnedBadges, recordPractice } from './journey';
import { speak, speaking, stopSpeaking } from './speech';
import { footer, header, notice, tour, TOUR } from './views/shell';

installTheme();

const app = document.querySelector<HTMLDivElement>('#app')!;
const storage: StoragePort = {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
/** Kept outside the saved state so backups and save validation are unaffected. */
const TOUR_KEY = 'verse-recall.tour.v1';
app.textContent = 'Loading saved practice…';
const loaded = await loadState(storage);
const tourSeen = (() => { try { return storage.getItem(TOUR_KEY) !== null; } catch { return true; } })();
Object.assign(ui, {
  state: loaded.state,
  view: loaded.state.run ? 'practice' : 'today',
  selectedSlot: null,
  feedback: '',
  showBankFeedback: false,
  saveError: loaded.error,
  protectSave: Boolean(loaded.error),
  appearanceNotice: loaded.appearance,
  plan: null,
  loading: null,
  tour: null,
  reward: null,
  tourInvite: !tourSeen && !loaded.state.run && Object.keys(loaded.state.progress).length === 0,
  find: { query: '', translation: planTranslation(loaded.state.preferences.translation), busy: false, status: null, found: null, shown: [], voice: { phase: 'idle', progress: 0, downloaded: null } },
});
const media = matchMedia('(prefers-color-scheme: dark)');

function applyAppearance(): void {
  const { colour, preset } = ui.state.preferences;
  const preview = new URLSearchParams(location.search).get('scoutTheme');
  document.documentElement.dataset.theme = colour === 'system'
    ? (preview === 'light' || preview === 'dark' ? preview : media.matches ? 'dark' : 'light') : colour;
  document.documentElement.dataset.preset = preset;
  document.documentElement.dataset.accent = ui.state.preferences.accent;
  document.documentElement.dataset.font = ui.state.preferences.font;
}
media.addEventListener('change', applyAppearance);
// Text inputs may match :focus-visible after a pointer click; track real input
// modality so they keep their caret/border without adding a pointer-only ring.
document.addEventListener('pointerdown', () => {
  document.documentElement.dataset.focusModality = 'pointer';
}, { capture: true });
document.addEventListener('keydown', () => {
  document.documentElement.dataset.focusModality = 'keyboard';
}, { capture: true });

function persist(): void {
  if (!ui.protectSave) ui.saveError = saveState(storage, ui.state);
  renderSaveStatus();
}
function renderSaveStatus(): void {
  const target = document.querySelector('#save-status');
  const warning = document.querySelector('#save-warning');
  if (warning) warning.innerHTML = ui.saveError
    ? `<div class="save-error" role="alert"><strong>Local save needs attention</strong><p>${e(ui.saveError)}</p>
      <button data-action="retry-save">${ui.protectSave ? 'Replace unreadable save with this session' : 'Retry saving'}</button></div>`
    : '';
  if (target) target.innerHTML = `<span class="save-ok">${ui.saveError ? 'Saving paused · See the notice above' : 'Saved on this device · No account needed'}</span>`;
}

function page(): string {
  if (ui.view === 'practice') {
    const html = practice();
    if (html !== null) return html;
    ui.view = 'today';
  }
  switch (ui.view) {
    case 'plans': return plansView();
    case 'find': return findView();
    case 'library': return library();
    case 'review': return review();
    case 'progress': return progress();
    default: return today();
  }
}
function render(focus: 'title' | 'tour' | false = false): void {
  const main = page();
  app.innerHTML = `<div class="shell">${header()}<div id="save-warning"></div>${notice()}${tour()}<main id="main">${main}</main>${footer()}</div>`;
  applyAppearance();
  renderSaveStatus();
  if (speaking() && !document.querySelector('[data-action="listen"]')) stopSpeaking();
  if (focus) document.querySelector<HTMLElement>(focus === 'tour' ? '#tour-title' : '#page-title')?.focus();
}
function go(view: View): void {
  ui.view = view;
  ui.loading = null;
  ui.plan = null;
  // Start downloading the offline search index as soon as Find opens.
  if (view === 'find') {
    void findRuntime().then(m => m.preload()).catch(() => undefined);
    void refreshVoice(voiceHost);
  } else stopVoice();
}
/** Re-renders and puts focus back on the same control, so typing and keyboard use are not interrupted. */
function renderKeepingFocus(): void {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const attr = active && [...active.attributes].find(a => a.name.startsWith('data-find') || a.name === 'data-action');
  const selector = active?.id ? `#${CSS.escape(active.id)}` : attr ? `[${attr.name}="${CSS.escape(attr.value)}"]` : null;
  render();
  if (selector) document.querySelector<HTMLElement>(selector)?.focus();
}

type FindRuntime = typeof import('./search/find');
let findLoading: Promise<FindRuntime> | null = null;
/** The search code and index load only when Find a verse is used. */
function findRuntime(): Promise<FindRuntime> {
  findLoading ??= import('./search/find');
  findLoading.catch(() => { findLoading = null; });
  return findLoading;
}
/** Updates the Find status and re-announces it to screen readers. */
function findStatus(message: string, error = false): void {
  ui.find.status = { message, error };
  if (ui.view !== 'find') return;
  renderKeepingFocus();
  const node = document.querySelector('#find-status');
  if (!node) return;
  node.textContent = '';
  setTimeout(() => { if (node.isConnected) node.textContent = message; }, 60);
}
const voiceHost: VoiceHost = { status: findStatus, render: renderKeepingFocus };
const failure = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
async function runSearch(query: string): Promise<void> {
  const q = query.trim();
  ui.find.query = query;
  if (!q) return findStatus('Type a few words, a phrase or a reference to search.', true);
  if (ui.find.busy) return;
  ui.find.busy = true;
  findStatus(`Searching for “${q}”…`);
  try {
    const runtime = await findRuntime();
    const translation = ui.find.translation;
    const found = await runtime.search(q, translation);
    ui.find.shown = await runtime.show(found, translation);
    ui.find.found = found;
    ui.state.searches = rememberSearch(ui.state.searches, q);
    persist();
    ui.find.busy = false;
    findStatus(found.length ? `${plural(found.length, 'verse')} found. Best match: ${ui.find.shown[0].reference}.` : `No verses matched “${q}”.`);
  } catch (error) {
    ui.find.busy = false;
    findStatus(failure(error, 'Search failed. Please try again.'), true);
  }
}
function foundSelection(index: number): { selection: BibleSelection; reference: string } | null {
  const f = ui.find.found?.[index];
  const shown = ui.find.shown[index];
  if (!f || !shown) return null;
  const translation = ui.find.translation;
  return { selection: { snapshot: snapshotFor(translation), translation, book: f.book, chapter: f.chapter, start: f.verse, end: f.end ?? f.verse }, reference: shown.reference };
}
const shownText = (index: number) => ui.find.shown[index]?.parts.map(p => p.text).join('') ?? '';
const TRANSLATION_NAMES: Record<BibleTranslation, string> = { webbe: 'WEB British', bsb: 'BSB', kjv: 'KJV' };
async function findAction(button: HTMLElement): Promise<void> {
  const data = button.dataset;
  if (data.findQuery !== undefined) {
    ui.find.query = data.findQuery;
    return runSearch(data.findQuery);
  }
  if (data.findTranslation) {
    ui.find.translation = data.findTranslation as BibleTranslation;
    const name = TRANSLATION_NAMES[ui.find.translation];
    if (!ui.find.found?.length) return findStatus(`Results will show in the ${name}.`);
    try {
      ui.find.shown = await (await findRuntime()).show(ui.find.found, ui.find.translation);
      findStatus(`Showing results in the ${name}.`);
    } catch (error) { findStatus(failure(error, 'This translation could not be loaded.'), true); }
    return;
  }
  const index = Number(data.findPractise ?? data.findAdd ?? data.findOpen ?? data.findCopy ?? data.findShare);
  const chosen = foundSelection(index);
  if (!chosen) return;
  const { selection, reference } = chosen;
  if (data.findOpen !== undefined) return biblePicker.open(selection.translation, 'both', selection);
  if (data.findPractise !== undefined || data.findAdd !== undefined) {
    try {
      await resolveBibleSelection(selection);
    } catch (error) { return findStatus(failure(error, `${reference} could not be opened.`), true); }
    if (data.findPractise !== undefined) return practiseSelection(selection, reference);
    try {
      const added = addOfficial(selection);
      if (added) persist();
      findStatus(added ? `${reference} added to your library. Practise it any time from Library.` : `${reference} is already in your library.`);
    } catch (error) { findStatus(failure(error, 'This passage could not be added.'), true); }
    return;
  }
  const text = `${shownText(index)}\n— ${reference} (${TRANSLATION_NAMES[selection.translation]})`;
  if (data.findCopy !== undefined) {
    try {
      await navigator.clipboard.writeText(text);
      findStatus(`${reference} copied.`);
    } catch { findStatus('Copying is not available in this browser. Select the verse text to copy it instead.', true); }
    return;
  }
  try { await navigator.share({ title: reference, text }); }
  catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) findStatus('Sharing is not available here. Use Copy instead.', true); }
}

function start(key: string, mode: Run['mode']): void {
  const p = provider().get(key);
  if (!p) return;
  if (ui.state.run && ui.state.run.stage !== 'results' &&
      !window.confirm('Start a new practice? This replaces your unfinished exercise. Completed progress and reviews will be kept.')) return;
  ui.state.run = startRun(p, mode);
  ui.view = 'practice';
  ui.loading = null;
  ui.selectedSlot = null;
  ui.feedback = '';
  ui.showBankFeedback = false;
  ui.reward = null;
  persist();
  render('title');
}
/** Adds an official selection to the library; returns false when it was already there. */
function addOfficial(selection: BibleSelection): boolean {
  if (ui.protectSave) throw new Error('Resolve the unreadable-save notice before adding a Bible passage. Your old save has not been changed.');
  const key = bibleSelectionKey(selection);
  const existing = ui.state.official ?? [];
  if (existing.some(s => bibleSelectionKey(s) === key)) return false;
  if (existing.length >= MAX_OFFICIAL) throw new Error(`The library limit is ${MAX_OFFICIAL} added official selections. No passage was added.`);
  ui.state.official = [...existing, selection];
  return true;
}
/** Loads a verified Bible selection on demand, keeps it in the library and starts practice. */
async function practiseSelection(selection: BibleSelection, reference: string): Promise<void> {
  const key = bibleSelectionKey(selection);
  if (!provider().get(key)) {
    ui.loading = { message: `Opening ${reference}…`, error: false };
    render();
    try {
      await resolveBibleSelection(selection);
      if (addOfficial(selection)) persist();
    } catch (error) {
      ui.loading = { message: `${reference} could not be opened. ${error instanceof Error ? error.message : 'Please try again.'}`, error: true };
      render();
      return;
    }
  }
  ui.loading = null;
  start(key, 'learn');
  if (ui.view !== 'practice') render();
}
function place(token: number, target?: number): void {
  const p = runPassage();
  const run = ui.state.run;
  if (!p || !run) return;
  const slot = target ?? ui.selectedSlot ?? activeIndices(p, run.stage).find(i => run.slots[i] === null);
  if (slot === undefined) return;
  const placed = placeToken(p, run, token, slot);
  if (placed === run) {
    ui.feedback = 'That word cannot be placed here. Choose an unused word from this exercise.';
    render();
    return;
  }
  ui.state.run = placed;
  ui.selectedSlot = null;
  ui.feedback = 'Word placed. You can tap it to return it to the bank.';
  ui.showBankFeedback = false;
  persist();
  render();
  (document.querySelector<HTMLElement>('.word') ?? document.querySelector<HTMLElement>('[data-action="check-bank"]'))?.focus();
}
function refreshListen(): void {
  for (const button of document.querySelectorAll<HTMLElement>('[data-action="listen"]')) {
    button.setAttribute('aria-pressed', String(speaking()));
    button.innerHTML = listenLabel();
  }
}
function setTour(step: number | null): void {
  ui.tourInvite = false;
  ui.tour = step;
  if (step === null) {
    try { storage.setItem(TOUR_KEY, '1'); } catch { /* the invitation simply returns next visit */ }
    render('title');
    return;
  }
  go(TOUR[step].view);
  render('tour');
}

const preferencesDialog = new PreferencesDialog({
  state: () => ui.state,
  changePreferences: patch => {
    ui.state = choose(ui.state, patch);
    persist();
    if (Object.hasOwn(patch, 'voice')) {
      stopVoice();
      ui.find.voice = { phase: 'idle', progress: 0, downloaded: null };
      void refreshVoice(voiceHost);
    }
    render();
  },
  applyImport: next => {
    ui.state = next;
    ui.selectedSlot = null;
    ui.feedback = '';
    ui.showBankFeedback = false;
    go(ui.state.run ? 'practice' : 'library');
    persist();
    render();
  },
  storageSnapshot: () => storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY),
  saveProblem: () => ui.saveError,
  protectedSave: () => ui.protectSave,
});
const biblePicker = new BiblePicker((selection, passage) => {
  if (!addOfficial(selection)) return `${passage.reference} is already in your library. Progress is unchanged.`;
  ui.state.preferences = { ...ui.state.preferences, translation: selection.translation, filter: 'both' };
  persist();
  render();
  return ui.saveError ?? `${passage.reference} added to the ${collectionName(selection.translation)} library. Your current exercise is unchanged.`;
}, () => ui.state.preferences.openIn ?? DEFAULT_OPEN_IN);

app.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLElement>('button, a[data-nav]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'preferences') return preferencesDialog.open();
  if (action === 'browse-bibles') return biblePicker.open(ui.state.preferences.translation, ui.state.preferences.filter);
  if (action === 'add-personal') return preferencesDialog.open('personal');
  if (action === 'find-voice' || action?.startsWith('voice-')) return void voiceAction(action, voiceHost);
  if (Object.keys(button.dataset).some(key => key.startsWith('find'))) return void findAction(button);
  if (action === 'find-clear-history') {
    delete ui.state.searches;
    persist();
    findStatus('Search history cleared.');
    document.querySelector<HTMLElement>('#find-query')?.focus();
    return;
  }
  if (button.dataset.nav) {
    event.preventDefault();
    go(button.dataset.nav as View);
    render('title');
    return;
  }
  if (button.dataset.plan) {
    go('plans');
    ui.plan = button.dataset.plan;
    render('title');
    return;
  }
  if (button.dataset.planVerse !== undefined) {
    const plan = plans.find(p => p.id === ui.plan);
    const verse = plan?.verses[Number(button.dataset.planVerse)];
    if (verse) void practiseSelection(planSelection(verse, planTranslation(ui.state.preferences.translation)), verse.reference);
    return;
  }
  if (action === 'daily') {
    const verse = verseOfTheDay(new Date());
    void practiseSelection(planSelection(verse, planTranslation(ui.state.preferences.translation)), verse.reference);
    return;
  }
  if (action === 'tour') return setTour(0);
  if (action === 'tour-next' && ui.tour !== null) return setTour(Math.min(ui.tour + 1, TOUR.length - 1));
  if (action === 'tour-back' && ui.tour !== null) return setTour(Math.max(ui.tour - 1, 0));
  if (action === 'tour-end') return setTour(null);
  if (button.dataset.start) return start(button.dataset.start, 'learn');
  if (button.dataset.review) return start(button.dataset.review, 'review');
  if (action === 'retry-save') {
    ui.protectSave = false;
    persist();
    return;
  }
  if (action === 'keep-look' || action === 'restore-look') {
    if (action === 'restore-look' && ui.appearanceNotice) ui.state = choose(ui.state, ui.appearanceNotice);
    ui.appearanceNotice = null;
    persist();
    render('title');
    return;
  }
  const p = runPassage();
  const run = ui.state.run;
  if (!p || !run) return;
  if (action === 'listen') {
    if (speaking()) stopSpeaking();
    else speak(`${p.reference}. ${p.text}`, refreshListen);
    refreshListen();
    return;
  }
  if (button.dataset.token !== undefined) return place(Number(button.dataset.token));
  if (button.dataset.slot !== undefined) {
    const index = Number(button.dataset.slot);
    if (run.slots[index] !== null) run.slots[index] = null;
    ui.selectedSlot = index;
    ui.showBankFeedback = false;
    ui.feedback = `Space ${index + 1} selected. Choose a word from the bank.`;
    persist();
    render();
    document.getElementById(`slot-${index}`)?.focus();
    return;
  }
  let stageChanged = false;
  switch (action) {
    case 'next':
      ui.state.run = nextStage(p, run);
      stageChanged = true;
      break;
    case 'clear-bank':
      run.slots.fill(null);
      ui.selectedSlot = null;
      ui.showBankFeedback = false;
      ui.feedback = 'Placed words returned to the bank.';
      break;
    case 'check-bank':
      if (bankCorrect(p, run)) {
        ui.state.run = nextStage(p, run);
        ui.feedback = '';
        ui.showBankFeedback = false;
        ui.selectedSlot = null;
        stageChanged = true;
      } else {
        ui.showBankFeedback = true;
        ui.feedback = 'Not quite yet. Spaces marked ! are missing a word or have the wrong word. ✓ means correct.';
      }
      break;
    case 'hint':
      ui.state.run = hint(p, run);
      ui.feedback = 'Hint recorded. This session will not count as unaided recall.';
      ui.showBankFeedback = false;
      break;
    case 'letters':
      ui.state.run = letterHint(run);
      ui.feedback = 'First letters shown. This session will not count as unaided recall.';
      break;
    case 'check-recall':
      if (!normalizeWord(run.answer.trim())) {
        ui.feedback = 'Write a word you remember, or use a hint to get started.';
        break;
      }
      {
        const now = Date.now();
        const before = earnedBadges(ui.state);
        const result = finish(p, run, ui.state.progress[run.key], now);
        ui.state.progress[run.key] = result;
        const recorded = recordPractice(ui.state.journey, result, now);
        ui.state.journey = recorded.journey;
        ui.reward = { ...recorded.reward, key: run.key, badges: earnedBadges(ui.state).filter(id => !before.includes(id)) };
      }
      run.stage = 'results';
      run.checks++;
      stageChanged = true;
      break;
    default: return;
  }
  persist();
  render(stageChanged && 'title');
  if (!stageChanged) document.querySelector<HTMLElement>(`[data-action="${action}"]`)?.focus();
});

app.addEventListener('submit', event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-find-form')) return;
  event.preventDefault();
  void runSearch(form.querySelector<HTMLInputElement>('#find-query')!.value);
});
app.addEventListener('input', event => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.id === 'find-query') ui.find.query = target.value;
  if (target instanceof HTMLTextAreaElement && target.id === 'answer' && ui.state.run) {
    ui.state.run.answer = target.value;
    persist();
  }
});
app.addEventListener('dragstart', event => {
  const target = (event.target as Element).closest<HTMLElement>('[data-token]');
  if (target && event.dataTransfer) {
    event.dataTransfer.setData('text/plain', target.dataset.token!);
    event.dataTransfer.effectAllowed = 'move';
  }
});
app.addEventListener('dragover', event => {
  if ((event.target as Element).closest('[data-slot]')) event.preventDefault();
});
app.addEventListener('drop', event => {
  const target = (event.target as Element).closest<HTMLElement>('[data-slot]');
  const raw = event.dataTransfer?.getData('text/plain');
  if (target && raw && /^\d+$/u.test(raw)) {
    event.preventDefault();
    place(Number(raw), Number(target.dataset.slot));
  }
});
// Detect reviews becoming due while a page is left open without disturbing typing.
setInterval(() => {
  if (ui.view !== 'practice' && !ui.loading && !preferencesDialog.dialog.open && !biblePicker.dialog.open && document.activeElement === document.body) render();
}, 60_000);
if (loaded.migrated) persist();
render();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}
