import { editions, translationName, type Passage } from '../content';
import { activeIndices, compareRecall, firstLetters, slotCorrect, words, type Run } from '../engine';
import { BADGES } from '../journey';
import { openInLinks } from '../open-in';
import { canSpeak, speaking } from '../speech';
import { escapeHtml as e } from '../html';
import { date, label, plural, runPassage, ui } from '../ui';

export function source(p: Passage): string {
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
      return `<button class="slot ${ui.selectedSlot === i ? 'selected' : ''} ${ui.showBankFeedback ? correct ? 'correct' : 'incorrect' : ''}"
        id="slot-${i}" data-slot="${i}" aria-label="${placed === null ? `Empty space ${i + 1}` : `Remove ${e(tokens[placed])} from position ${i + 1}`}" aria-pressed="${ui.selectedSlot === i}">${placed === null ? `<span class="slot-number">${i + 1}</span>` : e(tokens[placed])}${ui.showBankFeedback ? `<span class="check-symbol" aria-hidden="true">${correct ? '✓' : '!'}</span>` : ''}</button>`;
    }).join('')}</div>
    <div class="bank-header"><p class="eyebrow">WORD BANK <span>· ${bank.length} remaining</span></p><button class="text-button" data-action="clear-bank">Clear placed words</button></div>
    <div class="word-bank" aria-label="Word bank">${bank.map(i => `<button class="word" id="word-${i}" draggable="true" data-token="${i}">${e(tokens[i])}</button>`).join('') || '<p class="small">All words placed. Check your order when you are ready.</p>'}</div>
    <div class="actions"><button class="primary" data-action="check-bank">Check ${run.stage === 'fill' ? 'missing words' : 'word order'}</button><button data-action="hint">Place one word · hint</button></div>`;
}

export const listenLabel = () => speaking() ? '<span aria-hidden="true">■</span> Stop reading' : '<span aria-hidden="true">▶</span> Listen';
export const listenButton = () => canSpeak()
  ? `<button class="listen" data-action="listen" aria-pressed="${speaking()}">${listenLabel()}</button>` : '';

function reward(run: Run): string {
  const r = ui.reward;
  if (!r || r.key !== run.key) return '';
  const badges = BADGES.filter(b => r.badges.includes(b.id));
  return `<section class="reward" aria-labelledby="reward-heading"><h2 id="reward-heading">+${r.xp} XP</h2>
    <p>Day ${r.streak} of your rhythm.${r.frozen ? ` A streak freeze kept your rhythm through ${plural(r.frozen, 'quiet day')}.` : ''}${r.earnedFreeze ? ' You earned a streak freeze for a day you need to rest.' : ''}</p>
    ${badges.map(b => `<p class="badge-earned"><span class="badge-mark" aria-hidden="true">✦</span><span><strong>New badge: ${e(b.title)}</strong> ${e(b.text)}</span></p>`).join('')}</section>`;
}

const titles = { read: 'Let the words settle.', fill: 'Find what belongs.', arrange: 'Bring the words together.', recall: 'What have you kept?' };
const stages = ['read', 'fill', 'arrange', 'recall'] as const;

/** Returns null when there is no playable exercise, so the caller can fall back to Today. */
export function practice(): string | null {
  const run = ui.state.run;
  const p = runPassage();
  if (!run || !p) return null;
  if (run.stage === 'results') return results(p, run);
  return `<section class="practice"><div class="practice-top"><button class="text-button" data-nav="today">← Save & return</button><span class="pill">${run.mode === 'review' ? 'REVIEW · ' : ''}${e(translationName(p))}</span></div>
    <ol class="steps" aria-label="Learning stages">${stages.map((stage, i) => `<li ${run.stage === stage ? 'aria-current="step"' : ''}><span>${i + 1}</span>${stage[0].toUpperCase() + stage.slice(1)}</li>`).join('')}</ol>
    <div class="practice-heading"><p class="eyebrow">${e(p.reference)} · ${e(p.title)}</p><h1 id="page-title" tabindex="-1">${titles[run.stage]}</h1><p class="small">${run.stage === 'read' ? p.personal ? 'Personal original text, not independently verified. There is no timer.' : 'Official source text. Take your time; there is no timer.' : 'Learning exercise · Source wording is preserved separately.'}</p></div>
    <div class="practice-card">
      ${run.stage === 'read' ? `<blockquote class="verse">${e(p.text)}</blockquote><p class="verse-citation">${e(p.reference)} · ${e(translationName(p))}</p>${p.personal ? '' : openInLinks(p.reference, ui.state.preferences.openIn)}<div class="actions"><button class="primary" data-action="next">I’m ready to practise →</button>${listenButton()}</div>`
        : run.stage === 'recall' ? `<label class="recall-label" for="answer">Write the verse from memory</label><p id="recall-help" class="small">No word bank. Capitalisation, spacing, curly apostrophes and sentence punctuation are not scored. Words and their order matter.</p>
          <textarea id="answer" rows="6" maxlength="4000" spellcheck="false" autocomplete="off" autocapitalize="off" aria-describedby="recall-help" placeholder="Start with the words you remember…">${e(run.answer)}</textarea>
          ${run.letters && !run.exposed ? `<aside class="hint-panel"><strong>First letters · hint</strong><p class="letters">${e(firstLetters(p.text))}</p></aside>` : ''}
          ${run.exposed ? `<aside class="hint-panel"><strong>Source revealed · assisted practice</strong><p class="verse hint-verse">${e(p.text)}</p></aside>` : ''}
          <div class="actions"><button class="primary" data-action="check-recall">Check my recall</button>${run.letters || run.exposed ? '' : '<button data-action="letters">First letters · hint</button>'}<button data-action="hint">Reveal verse · hint</button></div>`
        : exercise(p, run)}
      <p id="feedback" class="feedback" role="status" aria-live="polite">${e(ui.feedback)}</p>
    </div><p class="practice-note">${plural(run.hints, 'hint')} used · Word-bank success builds familiarity. Only an exact recall without hints counts as unaided.</p>
    ${run.stage === 'read' ? source(p) : ''}
    </section>`;
}

function results(p: Passage, run: Run): string {
  const result = compareRecall(p.text, run.answer);
  const progress = ui.state.progress[run.key];
  const unaided = progress.lastResult === 'unaided';
  return `<section class="results"><p class="eyebrow">PRACTICE COMPLETE · ${e(label(p))}</p>
    <div class="result-mark" aria-hidden="true">${unaided ? '✓' : '↗'}</div><h1 id="page-title" tabindex="-1">${unaided ? 'A word kept close.' : result.exact ? 'A good step forward.' : 'Every return is progress.'}</h1>
    <p class="lead">${unaided ? 'An exact, unaided recall.' : result.exact ? 'Exact recall with help — not unaided mastery.' : 'Not yet exact. Here is what to revisit.'}</p>
    ${reward(run)}<div class="result-stats"><div><strong>${result.correct}/${result.total}</strong><span>words matched in order</span></div><div><strong>${run.hints}</strong><span>hints used</span></div><div><strong>${run.bankCompleted ? 'Complete' : 'Review'}</strong><span>${run.bankCompleted ? 'word-bank practice' : 'recall-only session'}</span></div></div>
    <section class="practice-card comparison"><h2>Your recall</h2><p class="small">Feedback: correct, incorrect (your word → source word), missing, and extra.</p>
    <div class="diff">${result.differences.map(d => `<span class="diff-${d.kind}">${d.kind === 'correct' ? e(d.expected!) : d.kind === 'missing' ? `<b>Missing:</b> ${e(d.expected!)}` : d.kind === 'extra' ? `<b>Extra:</b> ${e(d.actual!)}` : `<b>Incorrect:</b> ${e(d.actual!)} → ${e(d.expected!)}`}</span>`).join('')}</div>
    <h2>Keep the original close</h2><blockquote class="verse">${e(p.text)}</blockquote><p class="verse-citation">${e(label(p))}</p>${listenButton()}</section>
    <p class="review-plan"><strong>Next review: ${e(date(progress.due))}</strong><br>${unaided ? 'Your interval grows with consecutive unaided recalls.' : 'Return in 10 minutes for a fresh recall, without the bank.'}</p>
    <div class="actions"><button class="primary" data-nav="today">Back to Today →</button><button data-start="${e(run.key)}">Practise from the beginning</button></div>${source(p)}</section>`;
}
