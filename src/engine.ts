import { passageKey, type Passage } from './content';

export type Stage = 'read' | 'fill' | 'arrange' | 'recall' | 'results';
export interface Run {
  key: string;
  stage: Stage;
  mode: 'learn' | 'review';
  slots: (number | null)[];
  order: number[];
  answer: string;
  hints: number;
  checks: number;
  exposed: boolean;
  bankCompleted: boolean;
}
export interface Progress {
  key: string;
  attempts: number;
  unaided: number;
  streak: number;
  bankCompleted: boolean;
  lastResult: 'unaided' | 'assisted' | 'practice';
  lastPractised: number;
  due: number;
}
export interface Difference {
  kind: 'correct' | 'incorrect' | 'missing' | 'extra';
  expected?: string;
  actual?: string;
}
export interface RecallResult {
  exact: boolean;
  correct: number;
  total: number;
  differences: Difference[];
}
export const words = (text: string): string[] => text.trim().split(/\s+/u);
export const normalizeWord = (text: string): string =>
  text.normalize('NFC').toLocaleLowerCase('en-GB').replace(/[’‘]/gu, "'").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
export const normalizedWords = (text: string): string[] =>
  text.trim() ? words(text).map(normalizeWord).filter(Boolean) : [];

export function compareRecall(expected: string, answer: string): RecallResult {
  const a = normalizedWords(expected);
  const b = normalizedWords(answer);
  const rows = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) rows[i][0] = i;
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1, rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 2),
      );
    }
  }
  const differences: Difference[] = [];
  let i = a.length;
  let j = b.length;
  while (i || j) {
    if (i && j && rows[i][j] === rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 2)) {
      differences.unshift({ kind: a[i - 1] === b[j - 1] ? 'correct' : 'incorrect', expected: a[--i], actual: b[--j] });
    } else if (i && rows[i][j] === rows[i - 1][j] + 1) {
      differences.unshift({ kind: 'missing', expected: a[--i] });
    } else {
      differences.unshift({ kind: 'extra', actual: b[--j] });
    }
  }
  return { exact: rows[a.length][b.length] === 0, correct: differences.filter(d => d.kind === 'correct').length, total: a.length, differences };
}

export const gapIndices = (p: Passage): number[] => {
  const tokens = words(p.text);
  return tokens.length < 3 ? [0] : tokens.flatMap((_, i) => i % 4 === 2 ? [i] : []);
};
export const activeIndices = (p: Passage, stage: Stage): number[] =>
  stage === 'fill' ? gapIndices(p) : words(p.text).map((_, i) => i);

export function shuffled(count: number, random = Math.random): number[] {
  const result = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  if (count > 1 && result.every((value, i) => value === i)) result.push(result.shift()!);
  return result;
}

export function startRun(p: Passage, mode: Run['mode'] = 'learn'): Run {
  return {
    key: passageKey(p), stage: mode === 'review' ? 'recall' : 'read', mode,
    slots: Array<null>(words(p.text).length).fill(null), order: shuffled(words(p.text).length),
    answer: '', hints: 0, checks: 0, exposed: false, bankCompleted: false,
  };
}

export function slotCorrect(p: Passage, run: Run, index: number): boolean {
  const token = run.slots[index];
  return token !== null && normalizeWord(words(p.text)[token]) === normalizeWord(words(p.text)[index]);
}

export function bankCorrect(p: Passage, run: Run): boolean {
  return activeIndices(p, run.stage).every(i => slotCorrect(p, run, i));
}

export function placeToken(p: Passage, run: Run, token: number, slot: number): Run {
  const active = activeIndices(p, run.stage);
  if (!['fill', 'arrange'].includes(run.stage) || !active.includes(slot) ||
      !active.includes(token) || run.slots.includes(token)) return run;
  const slots = [...run.slots];
  slots[slot] = token;
  return { ...run, slots };
}

export function hint(p: Passage, run: Run): Run {
  if (run.stage === 'recall') return { ...run, hints: run.hints + 1, exposed: true };
  const index = activeIndices(p, run.stage).find(i => !slotCorrect(p, run, i));
  if (index === undefined) return run;
  const slots = [...run.slots];
  const oldSlot = slots.indexOf(index);
  if (oldSlot !== -1) slots[oldSlot] = null;
  slots[index] = index;
  return { ...run, slots, hints: run.hints + 1 };
}

export function nextStage(p: Passage, run: Run): Run {
  if (run.stage === 'read') return { ...run, stage: 'fill' };
  if (run.stage === 'fill' && bankCorrect(p, run)) {
    return { ...run, stage: 'arrange', slots: run.slots.map(() => null), order: shuffled(run.slots.length) };
  }
  if (run.stage === 'arrange' && bankCorrect(p, run)) return { ...run, stage: 'recall', bankCompleted: true };
  return run;
}

export function finish(p: Passage, run: Run, previous: Progress | undefined, now: number): Progress {
  const exact = compareRecall(p.text, run.answer).exact;
  const unaided = exact && run.hints === 0 && !run.exposed;
  const streak = unaided ? (previous?.streak ?? 0) + 1 : 0;
  const interval = unaided ? [1, 3, 7, 14, 30][Math.min(streak - 1, 4)] * 86_400_000 : 600_000;
  return {
    key: run.key, attempts: (previous?.attempts ?? 0) + 1,
    unaided: (previous?.unaided ?? 0) + Number(unaided), streak,
    bankCompleted: run.bankCompleted || (previous?.bankCompleted ?? false),
    lastResult: unaided ? 'unaided' : exact ? 'assisted' : 'practice',
    lastPractised: now, due: now + interval,
  };
}
