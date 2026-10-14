import { createProvider, type Filter, type Translation, type PersonalVerse } from './content';
import { activeIndices, words, type Progress, type Run } from './engine';
import { exactKeys, MAX_JSON_BYTES, MAX_PERSONAL, parseBoundedJson, record, safeTree, validPersonal, verifyRevisions } from './personal';
import { MAX_FREEZES, MAX_XP, type Journey } from './journey';
import { bibleSelectionKey, MAX_OFFICIAL, prepareOfficialSelections, selectedBiblePassages, validBibleSelection, type BibleSelection } from './bible-catalog';

export interface Preferences {
  translation: Translation;
  filter: Filter;
  preset: 'calm' | 'study' | 'focus';
  colour: 'light' | 'dark' | 'system';
  accent: 'teal' | 'amber' | 'rose' | 'neutral' | 'blue' | 'green' | 'purple';
  font: 'serif' | 'readable' | 'segoe' | 'aptos' | 'calibri' | 'mono';
  /** Appearance settings the person explicitly chose. Unlisted settings follow the current defaults. */
  chosen?: AppearanceKey[];
}
export const APPEARANCE_KEYS = ['preset', 'colour', 'accent', 'font'] as const;
export type AppearanceKey = typeof APPEARANCE_KEYS[number];
export const ACCENTS = ['teal', 'amber', 'rose', 'neutral', 'blue', 'green', 'purple'] as const;
export const FONTS = ['serif', 'readable', 'segoe', 'aptos', 'calibri', 'mono'] as const;
/** Appearance defaults before the 2026 refresh. Saves without `chosen` used these implicitly. */
export const PREVIOUS_DEFAULTS = { preset: 'calm', colour: 'system', accent: 'purple', font: 'mono' } as const;
export interface SavedState {
  version: 2;
  personal: PersonalVerse[];
  official?: BibleSelection[];
  preferences: Preferences;
  progress: Record<string, Progress>;
  run: Run | null;
  /** Streak and XP. Added after version 2 shipped, so it stays optional. */
  journey?: Journey;
}
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const STORAGE_KEY = 'wordkeep.prototype.v2';
export const LEGACY_STORAGE_KEY = 'wordkeep.prototype.v1';
export const freshState = (): SavedState => ({
  version: 2, personal: [],
  preferences: { translation: 'webbe', filter: 'both', preset: 'calm', colour: 'system', accent: 'teal', font: 'serif', chosen: [] },
  progress: {}, run: null,
});
export type AppearanceMigration = Partial<Pick<Preferences, 'accent' | 'font'>>;
/**
 * Saves and backups made before `chosen` existed cannot say whether a value was picked or inherited.
 * Values that differ from the previous defaults were explicit choices and are kept. Previous defaults
 * move to the new defaults. Returns the replaced values so the person can restore them, or null.
 */
export function migratePreferences(state: unknown): AppearanceMigration | null {
  if (!record(state) || !record(state.preferences) || Object.hasOwn(state.preferences, 'chosen')) return null;
  const p = state.preferences;
  const next = freshState().preferences;
  const chosen = APPEARANCE_KEYS.filter(key => Object.hasOwn(p, key) && p[key] !== PREVIOUS_DEFAULTS[key]);
  const replaced: AppearanceMigration = {};
  for (const key of ['accent', 'font'] as const) {
    if (chosen.includes(key)) continue;
    if (p[key] !== next[key]) (replaced as Record<string, unknown>)[key] = p[key] ?? PREVIOUS_DEFAULTS[key];
    p[key] = next[key];
  }
  p.chosen = chosen;
  return replaced;
}
export function choose(state: SavedState, patch: Partial<Preferences>): SavedState {
  const chosen = new Set(state.preferences.chosen ?? []);
  for (const key of APPEARANCE_KEYS) if (Object.hasOwn(patch, key)) chosen.add(key);
  return updatePreferences(state, { ...patch, chosen: APPEARANCE_KEYS.filter(key => chosen.has(key)) });
}
const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
const timestamp = (value: unknown): value is number =>
  integer(value) && value <= 8_640_000_000_000_000;
const oneOf = (value: unknown, values: readonly string[]) => typeof value === 'string' && values.includes(value);

export function validJourney(j: unknown): j is Journey {
  return record(j) && exactKeys(j, ['xp', 'current', 'best', 'lastDay', 'freezes']) &&
    integer(j.xp) && j.xp <= MAX_XP && integer(j.current) && integer(j.best) && j.current <= j.best &&
    integer(j.freezes) && j.freezes <= MAX_FREEZES &&
    (j.lastDay === null ? j.current === 0 : integer(j.lastDay) && j.lastDay <= 100_000_000);
}

export function validState(value: unknown): value is SavedState {
  if (!record(value) || value.version !== 2 || !record(value.preferences) || !record(value.progress) ||
      !safeTree(value) || !exactKeys(value, ['version', 'personal', 'preferences', 'progress', 'run', ...(Object.hasOwn(value, 'official') ? ['official'] : []), ...(Object.hasOwn(value, 'journey') ? ['journey'] : [])]) ||
      (Object.hasOwn(value, 'journey') && !validJourney(value.journey)) ||
      !Array.isArray(value.personal) || value.personal.length > MAX_PERSONAL || !value.personal.every(validPersonal) ||
      new Set(value.personal.map(v => v.id)).size !== value.personal.length ||
      new Set(value.personal.map(v => v.revision)).size !== value.personal.length) return false;
  if (Object.hasOwn(value, 'official') && (!Array.isArray(value.official) || value.official.length > MAX_OFFICIAL ||
      !value.official.every(validBibleSelection) || new Set(value.official.map(bibleSelectionKey)).size !== value.official.length ||
      selectedBiblePassages(value.official).length !== value.official.length)) return false;
  const official = Array.isArray(value.official) && value.official.every(validBibleSelection) ? value.official : [];
  const provider = createProvider(value.personal, selectedBiblePassages(official));
  const p = value.preferences;
  if (!exactKeys(p, ['translation', 'filter', 'preset', 'colour', 'accent', 'font', ...(Object.hasOwn(p, 'chosen') ? ['chosen'] : [])]) ||
      !oneOf(p.translation, ['webbe', 'bsb', 'personal']) || !oneOf(p.filter, ['both', 'OT', 'NT']) ||
      !oneOf(p.preset, ['calm', 'study', 'focus']) || !oneOf(p.colour, ['light', 'dark', 'system']) ||
      !oneOf(p.accent, ACCENTS) || !oneOf(p.font, FONTS) ||
      (Object.hasOwn(p, 'chosen') && (!Array.isArray(p.chosen) || !p.chosen.every(key => oneOf(key, APPEARANCE_KEYS)) ||
        new Set(p.chosen).size !== p.chosen.length)) ||
      Object.keys(value.progress).length > MAX_PERSONAL + official.length + 6) return false;
  for (const [key, progress] of Object.entries(value.progress)) {
    if (!provider.get(key) || !record(progress) || progress.key !== key ||
        !exactKeys(progress, ['key', 'attempts', 'unaided', 'streak', 'bankCompleted', 'lastResult', 'lastPractised', 'due']) ||
        !integer(progress.attempts) || !integer(progress.unaided) || !integer(progress.streak) ||
        progress.unaided > progress.attempts || progress.streak > progress.unaided ||
        !timestamp(progress.lastPractised) || !timestamp(progress.due) || progress.due < progress.lastPractised ||
        typeof progress.bankCompleted !== 'boolean' || !oneOf(progress.lastResult, ['unaided', 'assisted', 'practice'])) return false;
  }
  if (value.run === null) return true;
  const r = value.run;
  if (!record(r) || typeof r.key !== 'string') return false;
  const passage = provider.get(r.key);
  if (!passage || !oneOf(r.stage, ['read', 'fill', 'arrange', 'recall', 'results']) ||
      !exactKeys(r, ['key', 'stage', 'mode', 'slots', 'order', 'answer', 'hints', 'checks', 'exposed', 'bankCompleted', ...(Object.hasOwn(r, 'letters') ? ['letters'] : [])]) ||
      (Object.hasOwn(r, 'letters') && (r.letters !== true || !(integer(r.hints) && r.hints > 0))) ||
      !oneOf(r.mode, ['learn', 'review']) || typeof r.answer !== 'string' || r.answer.length > 4000 ||
      !integer(r.hints) || !integer(r.checks) || typeof r.exposed !== 'boolean' ||
      typeof r.bankCompleted !== 'boolean') return false;
  const length = words(passage.text).length;
  if (!Array.isArray(r.order) || r.order.length !== length || new Set(r.order).size !== length ||
      !r.order.every(i => integer(i) && i < length) ||
      !Array.isArray(r.slots) || r.slots.length !== length ||
      !r.slots.every(i => i === null || integer(i) && i < length)) return false;
  const used = r.slots.filter(i => i !== null);
  if (new Set(used).size !== used.length) return false;
  if (r.stage === 'read' && r.slots.some(token => token !== null)) return false;
  if (r.mode === 'review' && r.stage !== 'recall' && r.stage !== 'results') return false;
  if (r.stage === 'fill') {
    const active = activeIndices(passage, 'fill');
    if (r.slots.some((token, index) => token !== null && (!active.includes(index) || !active.includes(token)))) return false;
  }
  if (r.stage === 'results' && !value.progress[r.key]) return false;
  return true;
}

export interface Loaded { state: SavedState; error: string | null; migrated: boolean; appearance: AppearanceMigration | null }
export async function loadState(storage: StoragePort): Promise<Loaded> {
  try {
    const current = storage.getItem(STORAGE_KEY);
    const raw = current ?? storage.getItem(LEGACY_STORAGE_KEY);
    if (raw === null) return { state: freshState(), error: null, migrated: false, appearance: null };
    let parsed = parseBoundedJson(raw);
    if (current === null) {
      if (!record(parsed) || parsed.version !== 1 || !record(parsed.preferences) ||
          !exactKeys(parsed, ['version', 'preferences', 'progress', 'run']) ||
          !exactKeys(parsed.preferences, ['translation', 'filter', 'preset', 'colour'])) throw new Error('Unsupported legacy save');
      parsed = { ...parsed, version: 2, personal: [], preferences: { ...parsed.preferences } };
    }
    const appearance = migratePreferences(parsed);
    await prepareOfficialSelections(parsed);
    if (!validState(parsed) || !await verifyRevisions(parsed.personal)) throw new Error('Unsupported or damaged save');
    const changed = appearance && Object.keys(appearance).length ? appearance : null;
    return { state: parsed, error: null, migrated: current === null || appearance !== null, appearance: changed };
  } catch (error) {
    const catalogueProblem = error instanceof Error && /Bible|chapter|edition|verse|selection/i.test(error.message)
      ? ` ${error.message} If the connection failed, restore it and reload before considering replacement.` : '';
    return { state: freshState(), error: 'Your local save could not be read. It has not been overwritten.' + catalogueProblem + ' You can continue without saving, or explicitly replace it below.', migrated: false, appearance: null };
  }
}

export function saveState(storage: StoragePort, state: SavedState): string | null {
  if (!validState(state)) return 'This session could not be saved because its data failed validation. Your previous save is unchanged.';
  try {
    const raw = JSON.stringify(state);
    if (new TextEncoder().encode(raw).length > MAX_JSON_BYTES) return 'This session exceeds the 1 MiB save limit. Your previous save is unchanged.';
    storage.setItem(STORAGE_KEY, raw);
    return null;
  } catch {
    return 'Saving is unavailable. Your work is still here in this tab, but may be lost when you close it. Free device storage or allow site storage, then retry.';
  }
}

export function updatePreferences(state: SavedState, patch: Partial<Preferences>): SavedState {
  return { ...state, preferences: { ...state.preferences, ...patch } };
}

export function dueReviews(state: SavedState, now: number): Progress[] {
  return Object.values(state.progress).filter(p => p.due <= now).sort((a, b) => a.due - b.due);
}
