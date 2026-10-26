import { collectionName, editions, passageKey, translationName, type Passage } from '../content';
import { words } from '../engine';
import { escapeHtml as e } from '../html';
import { planProgress, plans, planTranslation, verseOfTheDay } from '../plans';
import { dueReviews } from '../store';
import { BADGES, earnedBadges, streakNow } from '../journey';
import { date, label, plural, provider, runPassage, ui } from '../ui';

const day = (value: Date) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(value);

export function loadStatus(): string {
  if (!ui.loading) return '<p class="load-status" role="status" aria-live="polite"></p>';
  return ui.loading.error
    ? `<p class="load-status error" role="alert">${e(ui.loading.message)}</p>`
    : `<p class="load-status" role="status" aria-live="polite">${e(ui.loading.message)}</p>`;
}

function card(p: Passage, index: number): string {
  const progress = ui.state.progress[passageKey(p)];
  return `<article class="verse-card"><span class="card-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
    <div class="card-copy"><p class="eyebrow">${p.testament === 'OT' ? 'OLD' : 'NEW'} TESTAMENT <span>· ${e(translationName(p))}</span></p>
    <h3>${e(p.reference)}</h3><p>${e(p.title)}</p>
    <p class="small">${words(p.text).length} words · ${progress ? `${plural(progress.unaided, 'unaided recall')}` : 'Not yet practised'}</p></div>
    <button class="card-start" data-start="${e(passageKey(p))}" aria-label="Practise ${e(label(p))}">Practise <span aria-hidden="true">↗</span></button></article>`;
}

function collection(heading: string): string {
  const { translation, filter } = ui.state.preferences;
  const list = provider().list(translation, filter);
  return `<section aria-labelledby="collection-heading"><div class="section-heading"><div><p class="eyebrow">${translation === 'personal' ? 'YOUR PERSONAL COLLECTION' : 'YOUR BIBLE COLLECTION'}</p><h2 id="collection-heading">${heading}</h2></div><span class="pill">${plural(list.length, 'passage')} · ${collectionName(translation)}</span></div>
    <div class="verse-list">${list.map(card).join('') || '<p>No passages match this collection and Testament. Change the filter in Settings, or add a personal passage.</p>'}</div>
    <p class="small collection-note">Official texts stay intact. Personal passages are labelled separately and not independently verified. Progress stays separate for each text, translation and edition.</p>
    <div class="actions"><button data-action="browse-bibles" aria-haspopup="dialog" aria-controls="bible-picker">Choose from the Bible</button><button class="text-button" data-action="add-personal">Add or import your own verses</button></div></section>`;
}

function reviews(): string {
  const due = dueReviews(ui.state, Date.now());
  if (!due.length) return '';
  return `<section aria-labelledby="review-heading" class="review-section"><div class="section-heading"><h2 id="review-heading">Ready to revisit</h2><span class="small">All translations & Testaments</span></div>
    <p class="small">Recall comes first in a review. A hint is always available, and is recorded.</p>
    <div class="review-list">${due.map(item => {
      const p = provider().get(item.key)!;
      return `<button data-review="${e(item.key)}"><span>${e(label(p))}</span><span>Recall again →</span></button>`;
    }).join('')}</div></section>`;
}

function schedule(): string {
  const all = Object.values(ui.state.progress).sort((a, b) => a.due - b.due);
  if (!all.length) return '';
  return `<section class="schedule" aria-labelledby="schedule-heading"><h2 id="schedule-heading">Your next reviews</h2>${all.map(item => {
    const p = provider().get(item.key)!;
    return `<div><span>${e(label(p))}</span><span>${item.due <= Date.now() ? 'Ready now' : e(date(item.due))}</span></div>`;
  }).join('')}</section>`;
}

const method = `<section class="method"><p class="eyebrow">A SIMPLE WAY TO KEEP THE WORD</p><ol><li><b>01</b><span>Read<span>Let the words settle.</span></span></li><li><b>02</b><span>Fill<span>Find the missing words.</span></span></li><li><b>03</b><span>Arrange<span>Put the words in order.</span></span></li><li><b>04</b><span>Recall<span>Try without a word bank.</span></span></li></ol></section>`;

function daily(): string {
  const today = new Date();
  const verse = verseOfTheDay(today);
  const plan = plans.find(p => p.verses.includes(verse))!;
  return `<article class="feature-card daily" aria-labelledby="daily-heading"><p class="eyebrow">VERSE OF THE DAY · ${e(day(today).toUpperCase())}</p>
    <h2 id="daily-heading">${e(verse.reference)}</h2><p class="muted">From ${e(plan.title)}. The same verse for everyone today.</p>
    <button data-action="daily">Read today’s verse <span aria-hidden="true">→</span></button>${loadStatus()}</article>`;
}

function currentPlan(): string {
  const translation = planTranslation(ui.state.preferences.translation);
  const active = plans.map(plan => ({ plan, progress: planProgress(plan, translation, ui.state.progress) }))
    .find(({ progress }) => progress.started > 0 && progress.next !== null);
  if (!active) return `<article class="feature-card" aria-labelledby="plan-heading"><p class="eyebrow">MEMORY PLANS</p>
    <h2 id="plan-heading">Begin a guided plan</h2><p class="muted">${plans.length} plans, from Psalm 23 to a verse a week for a year.</p>
    <button data-nav="plans">Browse plans <span aria-hidden="true">→</span></button></article>`;
  const { plan, progress } = active;
  return `<article class="feature-card" aria-labelledby="plan-heading"><p class="eyebrow">YOUR PLAN</p>
    <h2 id="plan-heading">${e(plan.title)}</h2>${meter(progress.kept, progress.total)}
    <button data-plan="${e(plan.id)}">Continue with ${e(plan.verses[progress.next!].reference)} <span aria-hidden="true">→</span></button></article>`;
}

export const meter = (kept: number, total: number) =>
  `<span class="meter"><span class="meter-track" aria-hidden="true"><span style="width:${Math.round(kept / total * 100)}%"></span></span><span class="small">${kept} of ${total} kept</span></span>`;

export function today(): string {
  const list = provider().list(ui.state.preferences.translation, ui.state.preferences.filter);
  const due = dueReviews(ui.state, Date.now());
  const streak = streakNow(ui.state.journey, Date.now());
  const resume = ui.state.run && ui.state.run.stage !== 'results' ? runPassage() : undefined;
  return `<section class="hero">
      <div><p class="eyebrow">A LITTLE EACH DAY. A WORD FOR LIFE.</p><h1 id="page-title" tabindex="-1">Make room for<br> the Word.</h1>
      <p class="lead">Joshua 1:8</p>
      <p class="muted hero-note">Read slowly. Build familiarity. Recall in your own time.</p>
      ${resume ? `<button class="primary" data-nav="practice">Continue ${e(resume.reference)} <span aria-hidden="true">→</span></button>`
        : list[0] ? `<button class="primary" data-start="${e(passageKey(list[0]))}">Begin with ${e(list[0].reference)} <span aria-hidden="true">→</span></button>`
        : '<button class="primary" data-action="add-personal">Add your first passage →</button>'}</div>
      <aside class="rhythm" aria-label="Your practice rhythm"><span class="eyebrow">YOUR PRACTICE, NOT A RACE</span><div class="stat-row"><div><strong>${streak}</strong><span>${streak === 1 ? 'day' : 'days'} in a row</span></div><div><strong>${due.length}</strong><span>reviews ready</span></div></div>
      <p class="small xp-line">${ui.state.journey?.xp ?? 0} XP · ${plural(ui.state.journey?.freezes ?? 0, 'streak freeze')} saved</p>
      <div class="rhythm-line"></div><p>Small moments.<br>Lasting words.</p><span class="small">Inspired by Joshua 1:8</span></aside>
    </section>
    <div class="feature-grid">${daily()}${currentPlan()}</div>
    ${reviews()}
    ${collection('Keep something close today')}`;
}

const pageHead = (eyebrow: string, title: string, intro: string) =>
  `<header class="page-head"><p class="eyebrow">${eyebrow}</p><h1 id="page-title" tabindex="-1">${title}</h1><p class="muted">${intro}</p></header>`;

export const library = () => `${pageHead('LIBRARY', 'Words worth keeping.', 'Every passage you are learning, from the Bible or your own notes.')}
  ${collection('Choose a passage')}${schedule()}`;

export function review(): string {
  const any = Object.keys(ui.state.progress).length > 0;
  return `${pageHead('REVIEW', 'Return to what you’ve learned.', 'Reviews come back at growing intervals after each exact, unaided recall.')}
    ${reviews() || `<section class="empty-state"><h2>Nothing is waiting right now.</h2><p class="muted">${any ? 'Your next review time is listed below. Rest is part of remembering.' : 'Practise a passage and it will return here when it is time to recall it again.'}</p>
      <button data-nav="${any ? 'library' : 'plans'}">${any ? 'Open your library' : 'Find a plan to begin'}</button></section>`}
    ${schedule()}`;
}

function journey(): string {
  const j = ui.state.journey;
  const streak = streakNow(j, Date.now());
  const earned = earnedBadges(ui.state);
  return `<section aria-labelledby="rhythm-heading"><div class="section-heading"><h2 id="rhythm-heading">Your rhythm</h2><span class="small">A streak freeze covers a day you need to rest. One is earned every seven days; you can hold two.</span></div>
    <div class="stat-grid" aria-label="Rhythm summary">
      <div><strong>${streak}</strong><span>${streak === 1 ? 'day' : 'days'} in a row</span></div>
      <div><strong>${j?.best ?? 0}</strong><span>longest rhythm</span></div>
      <div><strong>${j?.xp ?? 0}</strong><span>XP gathered</span></div>
      <div><strong>${j?.freezes ?? 0}</strong><span>streak freezes saved</span></div>
    </div></section>
    <section aria-labelledby="badges-heading"><div class="section-heading"><h2 id="badges-heading">Badges</h2><span class="pill">${earned.length} of ${BADGES.length}</span></div>
    <ul class="badge-grid">${BADGES.map(b => {
      const has = earned.includes(b.id);
      return `<li class="badge ${has ? 'earned' : ''}"><span class="badge-mark" aria-hidden="true">${has ? '✦' : '○'}</span><span><strong>${e(b.title)}</strong><span class="small">${e(b.text)}</span><span class="badge-status">${has ? 'Earned' : 'Not yet'}</span></span></li>`;
    }).join('')}</ul></section>`;
}

export function progress(): string {
  const all = Object.values(ui.state.progress);
  const learned = all.reduce((sum, item) => sum + item.unaided, 0);
  const kept = all.filter(item => item.unaided > 0).length;
  const translation = planTranslation(ui.state.preferences.translation);
  return `${pageHead('PROGRESS', 'A gentle record.', 'Faithfulness over speed. Every return counts.')}
    <section class="stat-grid" aria-label="Practice summary">
      <div><strong>${all.length}</strong><span>passages practised</span></div>
      <div><strong>${kept}</strong><span>passages kept</span></div>
      <div><strong>${learned}</strong><span>unaided recalls</span></div>
      <div><strong>${dueReviews(ui.state, Date.now()).length}</strong><span>reviews ready</span></div>
    </section>
    ${journey()}
    <section aria-labelledby="plan-progress-heading"><div class="section-heading"><h2 id="plan-progress-heading">Plans</h2><span class="pill">${e(translation === 'webbe' ? 'WEB British' : editions[translation].name)}</span></div>
      <div class="plan-progress">${plans.map(plan => {
        const p = planProgress(plan, translation, ui.state.progress);
        return `<button data-plan="${e(plan.id)}"><span>${e(plan.title)}</span>${meter(p.kept, p.total)}</button>`;
      }).join('')}</div></section>
    ${method}
    <p class="tour-replay"><button class="text-button" data-action="tour">Replay the welcome tour</button></p>`;
}
