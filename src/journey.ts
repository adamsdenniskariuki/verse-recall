import type { Progress } from './engine';
import { planProgress, plans } from './plans';

/** Daily rhythm and XP. Optional in saves so older saves and backups load unchanged. */
export interface Journey {
  xp: number;
  current: number;
  best: number;
  /** Local calendar day (days since 1970-01-01) of the last finished practice. */
  lastDay: number | null;
  freezes: number;
}
export interface Reward { xp: number; streak: number; frozen: number; earnedFreeze: boolean; badges: string[] }

export const MAX_FREEZES = 2;
export const FREEZE_EVERY = 7;
export const MAX_XP = 1_000_000_000;
export const freshJourney = (): Journey => ({ xp: 0, current: 0, best: 0, lastDay: null, freezes: 0 });
export const localDay = (time: number): number => {
  const d = new Date(time);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
};
export const xpFor = (progress: Progress): number =>
  10 + (progress.lastResult === 'unaided' ? 15 : progress.lastResult === 'assisted' ? 5 : 0);

/** The streak as it stands today: a gap longer than the saved freezes can cover has ended it. */
export function streakNow(journey: Journey | undefined, now: number): number {
  if (!journey || journey.lastDay === null) return 0;
  const missed = localDay(now) - journey.lastDay - 1;
  return missed <= journey.freezes ? journey.current : 0;
}

/** Records one finished practice. Freezes cover missed days; one is earned every seven days, up to two. */
export function recordPractice(journey: Journey | undefined, progress: Progress, now: number): { journey: Journey; reward: Omit<Reward, 'badges'> } {
  const before = journey ?? freshJourney();
  const day = localDay(now);
  const xp = xpFor(progress);
  let { current, freezes } = before;
  let frozen = 0;
  if (before.lastDay !== day) {
    const missed = before.lastDay === null ? Infinity : day - before.lastDay - 1;
    if (missed < 0) current = Math.max(current, 1);
    else if (missed === 0) current++;
    else if (missed <= freezes) { frozen = missed; freezes -= missed; current++; }
    else current = 1;
  }
  const earnedFreeze = current !== before.current && current % FREEZE_EVERY === 0 && freezes < MAX_FREEZES;
  if (earnedFreeze) freezes++;
  return {
    journey: { xp: Math.min(before.xp + xp, MAX_XP), current, best: Math.max(before.best, current), lastDay: Math.max(day, before.lastDay ?? day), freezes },
    reward: { xp, streak: current, frozen, earnedFreeze },
  };
}

/** Combines two journeys without losing either: later rhythm wins, totals and bests keep their highest. */
export function mergeJourney(a: Journey | undefined, b: Journey | undefined): Journey | undefined {
  if (!a || !b) return a ?? b;
  const later = (b.lastDay ?? -1) > (a.lastDay ?? -1) ? b : a;
  return { ...later, xp: Math.max(a.xp, b.xp), best: Math.max(a.best, b.best, later.current) };
}

export interface Badge { id: string; title: string; text: string }
export interface BadgeState { journey?: Journey; progress: Record<string, Progress> }
const keptCount = (s: BadgeState) => Object.values(s.progress).filter(p => p.unaided > 0).length;
const BADGE_RULES: (Badge & { earned: (s: BadgeState) => boolean })[] = [
  { id: 'first-step', title: 'First step', text: 'Finished your first practice.', earned: s => Object.keys(s.progress).length > 0 },
  { id: 'kept-close', title: 'Kept close', text: 'Your first exact recall without help.', earned: s => keptCount(s) >= 1 },
  { id: 'three-days', title: 'Three days', text: 'Returned three days in a row.', earned: s => (s.journey?.best ?? 0) >= 3 },
  { id: 'seven-days', title: 'A week of days', text: 'Returned seven days in a row.', earned: s => (s.journey?.best ?? 0) >= 7 },
  { id: 'ten-kept', title: 'Ten treasured', text: 'Ten passages kept by heart.', earned: s => keptCount(s) >= 10 },
  { id: 'plan-complete', title: 'Plan complete', text: 'Kept every verse in a memory plan.', earned: s => plans.some(plan => (['webbe', 'bsb'] as const).some(t => { const p = planProgress(plan, t, s.progress); return p.kept === p.total; })) },
  { id: 'thirty-days', title: 'Thirty days', text: 'Returned thirty days in a row.', earned: s => (s.journey?.best ?? 0) >= 30 },
  { id: 'faithful', title: 'Faithful', text: 'Gathered 1,000 XP through steady practice.', earned: s => (s.journey?.xp ?? 0) >= 1000 },
];
export const BADGES: readonly Badge[] = BADGE_RULES.map(({ id, title, text }) => ({ id, title, text }));
export const earnedBadges = (state: BadgeState): string[] => BADGE_RULES.filter(rule => rule.earned(state)).map(rule => rule.id);
