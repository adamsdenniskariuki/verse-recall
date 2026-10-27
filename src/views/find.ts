import { escapeHtml as e } from '../html';
import { DEFAULT_OPEN_IN, openInLinks } from '../open-in';
import { ui } from '../ui';
import { loadStatus } from './home';

const STRATEGY: Record<string, string> = { reference: 'Reference', keyword: 'Keywords' };
const TRANSLATIONS = [['webbe', 'WEB British'], ['bsb', 'BSB'], ['kjv', 'KJV']] as const;
const EXAMPLES = ['lamp for my feet', 'John three sixteen', '1 Cor 13 4', 'the Lord is my shepherd', 'do not be anxious about anything'];

/** A plain-HTML diagram so it reads well with screen readers and in every theme. */
const diagram = () => `<details class="find-help"><summary>How Find a verse works</summary>
  <ol class="find-diagram" aria-label="How Find a verse works">
    <li><strong>You type</strong><span>A reference, a remembered phrase, or a few words. Voice input is coming soon.</span></li>
    <li><strong>Three searches</strong><span><b>Reference</b> reads “John three sixteen” or “1 Cor 13 4”. <b>Keywords</b> forgive typos, sound-alike words and old forms such as “thee” and “hath”. <b>Meaning</b> search is coming soon.</span></li>
    <li><strong>Ranked results</strong><span>Matches are merged. A verse found by more than one search ranks higher. Each shows how it was found.</span></li>
  </ol>
  <p class="small">Everything runs on this device. The search index is downloaded once (about 0.6 MB), checked for integrity and kept for offline use. Searches are saved only on this device and in your backups.</p></details>`;

function result(index: number): string {
  const f = ui.find.found![index];
  const shown = ui.find.shown[index];
  if (!shown) return '';
  const id = `find-result-${index}`;
  const text = shown.parts.length
    ? shown.parts.map(p => p.mark ? `<mark>${e(p.text)}</mark>` : e(p.text)).join('')
    : '<span class="muted">This verse is not available in this translation, or could not be loaded offline. Try another translation.</span>';
  const context = shown.before.length || shown.after.length ? `<details class="find-context"><summary>Show nearby verses</summary>
    ${shown.before.map(v => `<p><sup>${v.verse}</sup> ${e(v.text)}</p>`).join('')}
    <p class="current"><sup>${f.verse}</sup> ${shown.parts.map(p => e(p.text)).join('')}</p>
    ${shown.after.map(v => `<p><sup>${v.verse}</sup> ${e(v.text)}</p>`).join('')}</details>` : '';
  const share = typeof navigator.share === 'function' ? `<button data-find-share="${index}" aria-label="Share ${e(shown.reference)}">Share</button>` : '';
  return `<li><article class="find-result" aria-labelledby="${id}">
    <div class="find-result-head"><h3 id="${id}">${e(shown.reference)}</h3>
    <span class="find-score"><span>${Math.round(f.confidence * 100)}% match</span> · ${f.strategies.map(s => e(STRATEGY[s] ?? s)).join(' + ')}</span></div>
    <blockquote class="find-text">${text}</blockquote>${context}
    <div class="find-actions">
      <button class="primary" data-find-practise="${index}" ${shown.parts.length ? '' : 'disabled'}>Practise</button>
      <button data-find-add="${index}" ${shown.parts.length ? '' : 'disabled'} aria-label="Add to my verses: ${e(shown.reference)}">Add to my verses</button>
      <button data-find-open="${index}" aria-label="Open in reader: ${e(shown.reference)}">Open in reader</button>
      <button data-find-copy="${index}" ${shown.parts.length ? '' : 'disabled'} aria-label="Copy ${e(shown.reference)}">Copy</button>${share}
    </div>${openInLinks(shown.reference, ui.state.preferences.openIn ?? DEFAULT_OPEN_IN)}</article></li>`;
}

export function findView(): string {
  const find = ui.find;
  const history = ui.state.searches ?? [];
  const results = find.found === null ? ''
    : find.found.length === 0 ? '<p class="empty-state">No verses matched. Try fewer words, a different phrase, or a reference such as “Romans 8:28”.</p>'
    : `<ol class="find-results" aria-label="Search results">${find.found.map((_, i) => result(i)).join('')}</ol>`;
  return `<header class="page-head"><p class="eyebrow">FIND A VERSE</p><h1 id="page-title" tabindex="-1">What do you remember?</h1>
    <p class="muted">Type a reference, a phrase you half-remember, or a few words. Verse Recall searches the WEB British, BSB and KJV on this device.</p></header>
    <form class="find-form" role="search" aria-label="Find a verse" data-find-form>
      <label for="find-query">Words, phrase or reference</label>
      <div class="find-row"><input id="find-query" type="search" name="q" autocomplete="off" spellcheck="false" maxlength="200" value="${e(find.query)}" placeholder="For example, a lamp for my feet">
      <button class="primary" type="submit" ${find.busy ? 'aria-disabled="true"' : ''}>Search</button></div>
    </form>
    <div class="find-chips" aria-label="Examples"><span class="small">Try</span>${EXAMPLES.map(q => `<button class="chip" data-find-query="${e(q)}">${e(q)}</button>`).join('')}</div>
    ${history.length ? `<section class="find-history" aria-labelledby="find-history-title"><h2 id="find-history-title" class="small">Recent searches</h2>
      <div class="find-chips">${history.slice(0, 8).map(q => `<button class="chip" data-find-query="${e(q)}">${e(q)}</button>`).join('')}
      <button class="text-button" data-action="find-clear-history">Clear history</button></div></section>` : ''}
    <div class="find-toolbar"><div class="segmented" role="group" aria-label="Show results in">${TRANSLATIONS.map(([id, name]) =>
      `<button data-find-translation="${id}" aria-pressed="${find.translation === id}">${name}</button>`).join('')}</div></div>
    <p id="find-status" class="load-status${find.status?.error ? ' error' : ''}" role="status" aria-live="polite">${e(find.status?.message ?? '')}</p>${loadStatus()}
    ${results}${diagram()}`;
}
