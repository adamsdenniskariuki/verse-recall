import './style.css';
import { collectionName, createProvider, editions, passageKey, translationName, type Passage } from './content';
import { activeIndices, bankCorrect, compareRecall, finish, hint, nextStage, normalizeWord, placeToken, slotCorrect, startRun, words, type Run } from './engine';
import { dueReviews, LEGACY_STORAGE_KEY, loadState, saveState, STORAGE_KEY, updatePreferences, type StoragePort } from './store';
import { escapeHtml as e } from './html';
import { PreferencesDialog } from './preferences';
import brandMark from './assets/verse-recall-mark.svg?raw';
import { bibleSelectionKey, selectedBiblePassages } from './bible-catalog';
import { BiblePicker } from './bible-picker';

const app = document.querySelector<HTMLDivElement>('#app')!;
const storage: StoragePort = {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
app.textContent = 'Loading saved practice…';
const loaded = await loadState(storage);
let state = loaded.state;
let saveError = loaded.error;
let protectSave = Boolean(loaded.error);
let view: 'today' | 'library' | 'practice' = state.run ? 'practice' : 'today';
let selectedSlot: number | null = null;
let feedback = '';
let showBankFeedback = false;
const media = matchMedia('(prefers-color-scheme: dark)');
const date = (value: number) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(value);
const provider = () => createProvider(state.personal, selectedBiblePassages(state.official));
const label = (p: Passage) => `${p.reference} · ${translationName(p)}`;
const runPassage = () => state.run ? provider().get(state.run.key) : undefined;

function applyAppearance(): void {
  const { colour, preset } = state.preferences;
  const preview = new URLSearchParams(location.search).get('scoutTheme');
  document.documentElement.dataset.theme = colour === 'system'
    ? (preview === 'light' || preview === 'dark' ? preview : media.matches ? 'dark' : 'light') : colour;
  document.documentElement.dataset.preset = preset;
  document.documentElement.dataset.accent = state.preferences.accent;
  document.documentElement.dataset.font = state.preferences.font;
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
  if (!protectSave) saveError = saveState(storage, state);
  renderSaveStatus();
}
function renderSaveStatus(): void {
  const target = document.querySelector('#save-status');
  const warning = document.querySelector('#save-warning');
  if (warning) warning.innerHTML = saveError
    ? `<div class="save-error" role="alert"><strong>Local save needs attention</strong><p>${e(saveError)}</p>
      <button data-action="retry-save">${protectSave ? 'Replace unreadable save with this session' : 'Retry saving'}</button></div>`
    : '';
  if (target) target.innerHTML = `<span class="save-ok">${saveError ? 'Saving paused · See the notice above' : 'Saved on this device · No account needed'}</span>`;
}
function header(): string {
  return `<header class="header"><a class="brand" href="#" data-nav="today" aria-label="Verse Recall home"><span class="brand-mark" aria-hidden="true">${brandMark}</span><span>Verse Recall<small>BIBLE MEMORY</small></span></a>
    <nav aria-label="Main"><button data-nav="today" ${view === 'today' ? 'aria-current="page"' : ''}>Today</button><button data-nav="library" ${view === 'library' ? 'aria-current="page"' : ''}>Library</button>
    ${state.run ? `<button data-nav="practice" ${view === 'practice' ? 'aria-current="page"' : ''}>${state.run.stage === 'results' ? 'Results' : 'Resume'}</button>` : ''}</nav>
    <button id="open-preferences" data-action="preferences" aria-haspopup="dialog" aria-controls="preferences-dialog">Preferences</button></header>`;
}
function card(p: Passage, index: number): string {
  const progress = state.progress[passageKey(p)];
  return `<article class="verse-card"><span class="card-index" aria-hidden="true">0${index + 1}</span>
    <div class="card-copy"><p class="eyebrow">${p.testament === 'OT' ? 'OLD' : 'NEW'} TESTAMENT <span>· ${e(translationName(p))}</span></p>
    <h3>${e(p.reference)}</h3><p>${e(p.title)}</p>
    <p class="small">${words(p.text).length} words · ${progress ? `${progress.unaided} unaided recall${progress.unaided === 1 ? '' : 's'}` : 'Not yet practised'}</p></div>
    <button class="card-start" data-start="${e(passageKey(p))}" aria-label="Practise ${e(label(p))}">Practise <span aria-hidden="true">↗</span></button></article>`;
}
function home(): string {
  const list = provider().list(state.preferences.translation, state.preferences.filter);
  const due = dueReviews(state, Date.now());
  const allProgress = Object.values(state.progress);
  const learned = allProgress.reduce((sum, item) => sum + item.unaided, 0);
  const resume = state.run && state.run.stage !== 'results' ? runPassage() : undefined;
  return `<section class="hero">
      <div><p class="eyebrow">A LITTLE EACH DAY. A WORD FOR LIFE.</p><h1 id="page-title" tabindex="-1">${view === 'library' ? 'Words worth keeping.' : 'Make room for<br> the Word.'}</h1>
      <p class="lead">Joshua 1:8</p>
      <p class="muted hero-note">Read slowly. Build familiarity. Recall in your own time.</p>
      ${resume ? `<button class="primary" data-nav="practice">Continue ${e(resume.reference)} <span aria-hidden="true">→</span></button>`
        : list[0] ? `<button class="primary" data-start="${e(passageKey(list[0]))}">Begin with ${e(list[0].reference)} <span aria-hidden="true">→</span></button>`
        : '<button class="primary" data-action="add-personal">Add your first passage →</button>'}</div>
      <aside class="rhythm" aria-label="Your practice rhythm"><span class="eyebrow">YOUR PRACTICE, NOT A RACE</span><div class="stat-row"><div><strong>${learned}</strong><span>unaided recalls</span></div><div><strong>${due.length}</strong><span>reviews ready</span></div></div>
      <div class="rhythm-line"></div><p>Small moments.<br>Lasting words.</p><span class="small">Inspired by Joshua 1:8</span></aside>
    </section>
    ${due.length ? `<section aria-labelledby="review-heading" class="review-section"><div class="section-heading"><h2 id="review-heading">Ready to revisit</h2><span class="small">All translations & Testaments</span></div>
      <p class="small">Recall comes first in a review. A hint is always available, and is recorded.</p>
      <div class="review-list">${due.map(item => {
        const p = provider().get(item.key)!;
        return `<button data-review="${e(item.key)}"><span>${e(label(p))}</span><span>Recall again →</span></button>`;
      }).join('')}</div></section>` : ''}
    <section aria-labelledby="collection-heading"><div class="section-heading"><div><p class="eyebrow">${state.preferences.translation === 'personal' ? 'YOUR PERSONAL COLLECTION' : 'THE VERIFIED STARTER COLLECTION'}</p><h2 id="collection-heading">${view === 'library' ? 'Choose a passage' : 'Keep something close today'}</h2></div><span class="pill">${list.length} passages · ${collectionName(state.preferences.translation)}</span></div>
    <div class="verse-list">${list.map(card).join('') || '<p>No passages match this collection and Testament. Change the filter in Preferences, or add a personal passage.</p>'}</div>
    <p class="small collection-note">Six official texts stay intact. Personal passages are labelled separately and not independently verified. Progress stays separate for each text, translation and edition.</p>
    <div class="actions"><button data-action="browse-bibles" aria-haspopup="dialog" aria-controls="bible-picker">Choose from the Bible</button><button class="text-button" data-action="add-personal">Add or import your own verses</button></div></section>
    ${allProgress.length ? `<section class="schedule"><h2>Your next reviews</h2>${allProgress.map(item => {
      const p = provider().get(item.key)!;
      return `<div><span>${e(label(p))}</span><span>${item.due <= Date.now() ? 'Ready now' : e(date(item.due))}</span></div>`;
    }).join('')}</section>` : ''}
    <section class="method"><p class="eyebrow">A SIMPLE WAY TO KEEP THE WORD</p><ol><li><b>01</b><span>Read<span>Let the words settle.</span></span></li><li><b>02</b><span>Fill<span>Find the missing words.</span></span></li><li><b>03</b><span>Arrange<span>Put the words in order.</span></span></li><li><b>04</b><span>Recall<span>Try without a word bank.</span></span></li></ol></section>`;
}
function source(p: Passage): string {
  if (p.catalogue && p.translation !== 'personal') return `<details class="source"><summary>Official edition, source & rights</summary>
    <p><strong>${e(editions[p.translation].name)}</strong></p><p>${e(p.edition)}</p>
    <p>${e(editions[p.translation].attribution)}</p><p>${e(editions[p.translation].rights)}</p>
    <p>Source-validated Bible selection. Exact reference: ${e(p.reference)}. Schema: ${e(p.mapping.scheme)}.</p>
    <p><a href="${p.source}" target="_blank" rel="noreferrer">Official text source ↗</a> · <a href="${editions[p.translation].rightsUrl}" target="_blank" rel="noreferrer">Rights ↗</a></p></details>`;
  if (p.translation === 'personal') return `<details class="source"><summary>Personal text & rights</summary>
    <p><strong>Personal passage · not independently verified</strong></p><p>${e(translationName(p))} · ${e(p.edition)}</p>
    <p>Reference supplied by you: ${e(p.reference)}. No official numbering equivalence is asserted.</p>
    <p>Stored locally; no source was fetched. Adding or importing text does not grant copyright or redistribution permission. Keep private backups secure and respect the source's terms.</p></details>`;
  const edition = editions[p.translation];
  return `<details class="source"><summary>Translation, source & rights</summary><p><strong>${edition.name}</strong></p><p>${e(edition.description)}</p>
    <p>${e(edition.attribution)}</p><p>${e(edition.rights)}</p>
    <p><a href="${p.source}" target="_blank" rel="noreferrer">Official source text ↗</a> · <a href="${edition.rightsUrl}" target="_blank" rel="noreferrer">Rights statement ↗</a></p>
    <p class="small">Source mapping: ${e(p.mapping.scheme)} / ${e(p.mapping.book)} ${p.mapping.chapter}:${p.mapping.verses.join(', ')}. Retrieved 20 September 2026.</p></details>`;
}
function exercise(p: Passage, run: Run): string {
  const tokens = words(p.text);
  const active = activeIndices(p, run.stage);
  const bank = run.order.filter(i => active.includes(i) && !run.slots.includes(i));
  return `<p id="bank-instructions" class="instruction">Tap an empty space, then a word. Or tap words to fill the next space. Tab + Enter works too; dragging is optional. Tap a placed word to return it.</p>
    <div class="slots" aria-label="Your verse" aria-describedby="bank-instructions">${tokens.map((token, i) => {
      if (!active.includes(i)) return `<span class="fixed-word">${e(token)}</span>`;
      const placed = run.slots[i];
      const correct = slotCorrect(p, run, i);
      return `<button class="slot ${selectedSlot === i ? 'selected' : ''} ${showBankFeedback ? correct ? 'correct' : 'incorrect' : ''}"
        id="slot-${i}" data-slot="${i}" aria-label="${placed === null ? `Empty space ${i + 1}` : `Remove ${e(tokens[placed])} from position ${i + 1}`}" aria-pressed="${selectedSlot === i}">${placed === null ? `<span class="slot-number">${i + 1}</span>` : e(tokens[placed])}${showBankFeedback ? `<span class="check-symbol" aria-hidden="true">${correct ? '✓' : '!'}</span>` : ''}</button>`;
    }).join('')}</div>
    <div class="bank-header"><p class="eyebrow">WORD BANK <span>· ${bank.length} remaining</span></p><button class="text-button" data-action="clear-bank">Clear placed words</button></div>
    <div class="word-bank" aria-label="Word bank">${bank.map(i => `<button class="word" id="word-${i}" draggable="true" data-token="${i}">${e(tokens[i])}</button>`).join('') || '<p class="small">All words placed. Check your order when you are ready.</p>'}</div>
    <div class="actions"><button class="primary" data-action="check-bank">Check ${run.stage === 'fill' ? 'missing words' : 'word order'}</button><button data-action="hint">Place one word · hint</button></div>`;
}
function practice(): string {
  const run = state.run;
  const p = runPassage();
  if (!run || !p) return home();
  if (run.stage === 'results') return results(p, run);
  const titles = { read: 'Let the words settle.', fill: 'Find what belongs.', arrange: 'Bring the words together.', recall: 'What have you kept?' };
  const stages = ['read', 'fill', 'arrange', 'recall'] as const;
  return `<section class="practice"><div class="practice-top"><button class="text-button" data-nav="today">← Save & return</button><span class="pill">${run.mode === 'review' ? 'REVIEW · ' : ''}${e(translationName(p))}</span></div>
    <ol class="steps" aria-label="Learning stages">${stages.map((stage, i) => `<li ${run.stage === stage ? 'aria-current="step"' : ''}><span>${i + 1}</span>${stage[0].toUpperCase() + stage.slice(1)}</li>`).join('')}</ol>
    <div class="practice-heading"><p class="eyebrow">${e(p.reference)} · ${e(p.title)}</p><h1 id="page-title" tabindex="-1">${titles[run.stage]}</h1><p class="small">${run.stage === 'read' ? p.personal ? 'Personal original text, not independently verified. There is no timer.' : 'Official source text. Take your time; there is no timer.' : 'Learning exercise · Source wording is preserved separately.'}</p></div>
    <div class="practice-card">
      ${run.stage === 'read' ? `<blockquote class="verse">${e(p.text)}</blockquote><p class="verse-citation">${e(p.reference)} · ${e(translationName(p))}</p><div class="actions"><button class="primary" data-action="next">I’m ready to practise →</button></div>`
        : run.stage === 'recall' ? `<label class="recall-label" for="answer">Write the verse from memory</label><p id="recall-help" class="small">No word bank. Capitalisation, spacing, curly apostrophes and sentence punctuation are not scored. Words and their order matter.</p>
          <textarea id="answer" rows="6" maxlength="4000" spellcheck="false" autocomplete="off" autocapitalize="off" aria-describedby="recall-help" placeholder="Start with the words you remember…">${e(run.answer)}</textarea>
          ${run.exposed ? `<aside class="hint-panel"><strong>Source revealed · assisted practice</strong><p class="verse hint-verse">${e(p.text)}</p></aside>` : ''}
          <div class="actions"><button class="primary" data-action="check-recall">Check my recall</button><button data-action="hint">Reveal verse · hint</button></div>`
        : exercise(p, run)}
      <p id="feedback" class="feedback" role="status" aria-live="polite">${e(feedback)}</p>
    </div><p class="practice-note">${run.hints} hint${run.hints === 1 ? '' : 's'} used · Word-bank success builds familiarity. Only an exact recall without hints counts as unaided.</p>
    ${run.stage === 'read' ? source(p) : ''}
    </section>`;
}
function results(p: Passage, run: Run): string {
  const result = compareRecall(p.text, run.answer);
  const progress = state.progress[run.key];
  const unaided = progress.lastResult === 'unaided';
  return `<section class="results"><p class="eyebrow">PRACTICE COMPLETE · ${e(label(p))}</p>
    <div class="result-mark" aria-hidden="true">${unaided ? '✓' : '↗'}</div><h1 id="page-title" tabindex="-1">${unaided ? 'A word kept close.' : result.exact ? 'A good step forward.' : 'Every return is progress.'}</h1>
    <p class="lead">${unaided ? 'An exact, unaided recall.' : result.exact ? 'Exact recall with help — not unaided mastery.' : 'Not yet exact. Here is what to revisit.'}</p>
    <div class="result-stats"><div><strong>${result.correct}/${result.total}</strong><span>words matched in order</span></div><div><strong>${run.hints}</strong><span>hints used</span></div><div><strong>${run.bankCompleted ? 'Complete' : 'Review'}</strong><span>${run.bankCompleted ? 'word-bank practice' : 'recall-only session'}</span></div></div>
    <section class="practice-card comparison"><h2>Your recall</h2><p class="small">Feedback: correct, incorrect (your word → source word), missing, and extra.</p>
    <div class="diff">${result.differences.map(d => `<span class="diff-${d.kind}">${d.kind === 'correct' ? e(d.expected!) : d.kind === 'missing' ? `<b>Missing:</b> ${e(d.expected!)}` : d.kind === 'extra' ? `<b>Extra:</b> ${e(d.actual!)}` : `<b>Incorrect:</b> ${e(d.actual!)} → ${e(d.expected!)}`}</span>`).join('')}</div>
    <h2>Keep the original close</h2><blockquote class="verse">${e(p.text)}</blockquote><p class="verse-citation">${e(label(p))}</p></section>
    <p class="review-plan"><strong>Next review: ${e(date(progress.due))}</strong><br>${unaided ? 'Your interval grows with consecutive unaided recalls.' : 'Return in 10 minutes for a fresh recall, without the bank.'}</p>
    <div class="actions"><button class="primary" data-nav="today">Back to Today →</button><button data-start="${e(run.key)}">Practise from the beginning</button></div>${source(p)}</section>`;
}
function render(focusTitle = false): void {
  app.innerHTML = `<div class="shell">${header()}<div id="save-warning"></div><main id="main">${view === 'practice' ? practice() : home()}</main>
    <footer><div><strong>Verse Recall</strong><span>BY MADE BY FAVOR</span></div><p>Joshua 1:8</p><p class="small">Local prototype · Working name · No tracking</p><div id="save-status" aria-live="polite"></div></footer></div>`;
  applyAppearance();
  renderSaveStatus();
  if (focusTitle) document.querySelector<HTMLElement>('#page-title')?.focus();
}
function start(key: string, mode: Run['mode']): void {
  const p = provider().get(key);
  if (!p) return;
  if (state.run && state.run.stage !== 'results' &&
      !window.confirm('Start a new practice? This replaces your unfinished exercise. Completed progress and reviews will be kept.')) return;
  state.run = startRun(p, mode);
  view = 'practice';
  selectedSlot = null;
  feedback = '';
  showBankFeedback = false;
  persist();
  render(true);
}
function place(token: number, target?: number): void {
  const p = runPassage();
  const run = state.run;
  if (!p || !run) return;
  const slot = target ?? selectedSlot ?? activeIndices(p, run.stage).find(i => run.slots[i] === null);
  if (slot === undefined) return;
  const placed = placeToken(p, run, token, slot);
  if (placed === run) {
    feedback = 'That word cannot be placed here. Choose an unused word from this exercise.';
    render();
    return;
  }
  state.run = placed;
  selectedSlot = null;
  feedback = 'Word placed. You can tap it to return it to the bank.';
  showBankFeedback = false;
  persist();
  render();
  (document.querySelector<HTMLElement>('.word') ?? document.querySelector<HTMLElement>('[data-action="check-bank"]'))?.focus();
}

const preferencesDialog = new PreferencesDialog({
  state: () => state,
  changePreferences: patch => { state = updatePreferences(state, patch); persist(); render(); },
  applyImport: next => {
    state = next;
    selectedSlot = null;
    feedback = '';
    showBankFeedback = false;
    view = state.run ? 'practice' : 'library';
    persist();
    render();
  },
  storageSnapshot: () => storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY),
  saveProblem: () => saveError,
  protectedSave: () => protectSave,
});
const biblePicker = new BiblePicker((selection, passage) => {
  if (protectSave) throw new Error('Resolve the unreadable-save notice before adding a Bible passage. Your old save has not been changed.');
  const key = bibleSelectionKey(selection);
  const existing = state.official ?? [];
  if (existing.some(s => bibleSelectionKey(s) === key)) return `${passage.reference} is already in your library. Progress is unchanged.`;
  if (existing.length >= 100) throw new Error('The library limit is 100 added official selections. No passage was added.');
  state.official = [...existing, selection];
  state.preferences = { ...state.preferences, translation: selection.translation, filter: 'both' };
  persist();
  render();
  return saveError ?? `${passage.reference} added to the ${collectionName(selection.translation)} library. Your current exercise is unchanged.`;
});

app.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLElement>('button, a[data-nav]');
  if (!button) return;
  if (button.dataset.action === 'preferences') return preferencesDialog.open();
  if (button.dataset.action === 'browse-bibles') return biblePicker.open(state.preferences.translation, state.preferences.filter);
  if (button.dataset.action === 'add-personal') return preferencesDialog.open('personal');
  if (button.dataset.nav) {
    event.preventDefault();
    view = button.dataset.nav as typeof view;
    render(true);
    return;
  }
  if (button.dataset.start) return start(button.dataset.start, 'learn');
  if (button.dataset.review) return start(button.dataset.review, 'review');
  if (button.dataset.action === 'retry-save') {
    protectSave = false;
    persist();
    return;
  }
  const p = runPassage();
  const run = state.run;
  if (!p || !run) return;
  if (button.dataset.token !== undefined) return place(Number(button.dataset.token));
  if (button.dataset.slot !== undefined) {
    const index = Number(button.dataset.slot);
    if (run.slots[index] !== null) run.slots[index] = null;
    selectedSlot = index;
    showBankFeedback = false;
    feedback = `Space ${index + 1} selected. Choose a word from the bank.`;
    persist();
    render();
    document.getElementById(`slot-${index}`)?.focus();
    return;
  }
  let stageChanged = false;
  switch (button.dataset.action) {
    case 'next':
      state.run = nextStage(p, run);
      stageChanged = true;
      break;
    case 'clear-bank':
      run.slots.fill(null);
      selectedSlot = null;
      showBankFeedback = false;
      feedback = 'Placed words returned to the bank.';
      break;
    case 'check-bank':
      if (bankCorrect(p, run)) {
        state.run = nextStage(p, run);
        feedback = '';
        showBankFeedback = false;
        selectedSlot = null;
        stageChanged = true;
      } else {
        showBankFeedback = true;
        feedback = 'Not quite yet. Spaces marked ! are missing a word or have the wrong word. ✓ means correct.';
      }
      break;
    case 'hint':
      state.run = hint(p, run);
      feedback = 'Hint recorded. This session will not count as unaided recall.';
      showBankFeedback = false;
      break;
    case 'check-recall':
      if (!normalizeWord(run.answer.trim())) {
        feedback = 'Write a word you remember, or use a hint to get started.';
        break;
      }
      state.progress[run.key] = finish(p, run, state.progress[run.key], Date.now());
      run.stage = 'results';
      run.checks++;
      stageChanged = true;
      break;
    default: return;
  }
  persist();
  render(stageChanged);
  if (!stageChanged) document.querySelector<HTMLElement>(`[data-action="${button.dataset.action}"]`)?.focus();
});

app.addEventListener('input', event => {
  const target = event.target;
  if (target instanceof HTMLTextAreaElement && target.id === 'answer' && state.run) {
    state.run.answer = target.value;
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
// Detect reviews becoming due while Today is left open without disturbing typing.
setInterval(() => {
  if (view !== 'practice' && !preferencesDialog.dialog.open && !biblePicker.dialog.open && document.activeElement === document.body) render();
}, 60_000);
if (loaded.migrated) persist();
render();
