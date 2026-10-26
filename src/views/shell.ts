import brandMark from '../assets/verse-recall-mark.svg?raw';
import { escapeHtml as e } from '../html';
import { dueReviews } from '../store';
import { accents, fonts } from '../theme';
import { NAV, ui, type View } from '../ui';

export function header(): string {
  const due = dueReviews(ui.state, Date.now()).length;
  return `<header class="header"><a class="brand" href="#" data-nav="today" aria-label="Verse Recall home"><span class="brand-mark" aria-hidden="true">${brandMark}</span><span>Verse Recall<small>BIBLE MEMORY</small></span></a>
    <nav aria-label="Main">${NAV.map(item => `<button data-nav="${item.view}" ${ui.view === item.view ? 'aria-current="page"' : ''}>${item.label}${item.view === 'review' && due ? ` <span class="count"><span aria-hidden="true">${due}</span><span class="sr-only">(${due} ready)</span></span>` : ''}</button>`).join('')}</nav>
    <button id="open-preferences" data-action="preferences" aria-haspopup="dialog" aria-controls="preferences-dialog"><span aria-hidden="true" class="gear">⚙</span> Settings</button></header>`;
}

export function notice(): string {
  const n = ui.appearanceNotice;
  if (!n) return '';
  const previous = [n.font && fonts[n.font].label, n.accent && accents[n.accent].label.toLowerCase()].filter(Boolean).join(' and ');
  return `<aside class="notice" aria-labelledby="notice-title"><div><strong id="notice-title">We’ve refreshed the look</strong>
    <p>Verse Recall now uses easier-to-read type and calmer colours. Your verses, progress and reviews are unchanged.</p></div>
    <div class="notice-actions"><button class="primary" data-action="keep-look">Keep the new look</button><button data-action="restore-look">Restore ${e(previous)}</button></div></aside>`;
}

export const TOUR: readonly { view: Exclude<View, 'practice'>; title: string; body: string }[] = [
  { view: 'today', title: 'Today', body: 'Each day brings a verse of the day, your current plan and any reviews that are ready. Small moments, kept faithfully.' },
  { view: 'plans', title: 'Plans', body: 'Curated plans walk through Psalm 23, the Beatitudes, the Armour of God, a verse a week for a year and more, one passage at a time.' },
  { view: 'library', title: 'Library', body: 'Every passage you are learning lives here. Choose any verse from the WEB British, Berean Standard Bible or King James Version, or add your own.' },
  { view: 'review', title: 'Practice & review', body: 'Read, fill the gaps, arrange the words, then recall from memory. Hints are always there and honestly recorded. Reviews return when it is time.' },
  { view: 'progress', title: 'Progress', body: 'A gentle record of what you have kept. Settings holds themes, readable fonts, dark mode and private backups. Nothing leaves this device.' },
];

export function tour(): string {
  if (ui.tour !== null) {
    const step = TOUR[ui.tour];
    const last = ui.tour === TOUR.length - 1;
    return `<aside class="tour" aria-labelledby="tour-title"><p class="eyebrow">WELCOME TOUR · ${ui.tour + 1} OF ${TOUR.length}</p>
      <h2 id="tour-title" tabindex="-1">${e(step.title)}</h2><p>${e(step.body)}</p>
      <div class="tour-actions">${ui.tour > 0 ? '<button data-action="tour-back">Back</button>' : ''}
      <button class="tour-next" data-action="${last ? 'tour-end' : 'tour-next'}">${last ? 'Finish' : 'Next'}</button>
      ${last ? '' : '<button class="text-button" data-action="tour-end">Skip tour</button>'}</div></aside>`;
  }
  if (!ui.tourInvite) return '';
  return `<aside class="tour invite" aria-labelledby="tour-title"><div><h2 id="tour-title">New to Verse Recall?</h2>
    <p>Take a short tour of plans, practice and reviews. You can replay it any time from Progress.</p></div>
    <div class="tour-actions"><button class="tour-next" data-action="tour">Take the tour</button><button class="text-button" data-action="tour-end">Not now</button></div></aside>`;
}

export const footer = () => `<footer><div><strong>Verse Recall</strong><span>BY MADE BY FAVOR</span></div><p>Joshua 1:8</p>
  <p class="small">Private by design · No account · No tracking</p><div id="save-status" aria-live="polite"></div></footer>`;
