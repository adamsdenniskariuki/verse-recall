import { editions } from '../content';
import { escapeHtml as e } from '../html';
import { planProgress, plans, planTranslation, planVerseKey } from '../plans';
import { ui } from '../ui';
import { loadStatus, meter } from './home';

function list(): string {
  const translation = planTranslation(ui.state.preferences.translation);
  return `<header class="page-head"><p class="eyebrow">MEMORY PLANS</p><h1 id="page-title" tabindex="-1">Walk with a plan.</h1>
    <p class="muted">Curated passages, one at a time, in the ${e(editions[translation].name)}. Change the Bible in Settings.</p></header>
    <div class="plan-grid">${plans.map(plan => {
      const p = planProgress(plan, translation, ui.state.progress);
      return `<article class="plan-tile" aria-labelledby="plan-${e(plan.id)}"><p class="eyebrow">${e(plan.cadence.toUpperCase())}</p>
        <h2 id="plan-${e(plan.id)}">${e(plan.title)}</h2><p class="muted">${e(plan.summary)}</p>${meter(p.kept, p.total)}
        <button data-plan="${e(plan.id)}" aria-label="${p.started ? 'Continue' : 'Open'} ${e(plan.title)}">${p.started ? 'Continue' : 'Open plan'} <span aria-hidden="true">→</span></button></article>`;
    }).join('')}</div>`;
}

function detail(id: string): string {
  const plan = plans.find(p => p.id === id)!;
  const translation = planTranslation(ui.state.preferences.translation);
  const p = planProgress(plan, translation, ui.state.progress);
  const nextLabel = p.next === null ? 'Every verse kept. Review any of them below.' : `${p.started ? 'Continue' : 'Begin'} with ${plan.verses[p.next].reference}`;
  return `<div class="practice-top"><button class="text-button" data-nav="plans">← All plans</button><span class="pill">${e(translation === 'webbe' ? 'WEB British' : editions[translation].name)}</span></div>
    <header class="page-head"><p class="eyebrow">${e(plan.cadence.toUpperCase())}</p><h1 id="page-title" tabindex="-1">${e(plan.title)}</h1>
    <p class="muted">${e(plan.summary)}</p>${meter(p.kept, p.total)}</header>
    ${p.next === null ? `<p class="plan-done">${e(nextLabel)}</p>` : `<button class="primary" data-plan-verse="${p.next}">${e(nextLabel)} <span aria-hidden="true">→</span></button>`}
    ${loadStatus()}
    <ol class="plan-verses">${plan.verses.map((verse, i) => {
      const progress = ui.state.progress[planVerseKey(verse, translation)];
      const status = !progress ? 'Not yet practised' : progress.unaided > 0 ? 'Kept' : 'Practised';
      return `<li class="${progress?.unaided ? 'kept' : ''}"><span class="plan-step" aria-hidden="true">${progress?.unaided ? '✓' : i + 1}</span>
        <span class="plan-ref"><strong>${e(verse.reference)}</strong><span class="small">${status}</span></span>
        <button data-plan-verse="${i}" aria-label="Practise ${e(verse.reference)}">Practise</button></li>`;
    }).join('')}</ol>
    <p class="small collection-note">Plan verses are added to your library when you first practise them, so progress and reviews work as usual.</p>`;
}

export const plansView = () => ui.plan && plans.some(p => p.id === ui.plan) ? detail(ui.plan) : list();
