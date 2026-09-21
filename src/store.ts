import { createProvider, type Filter, type Translation, type PersonalVerse } from './content';
import { activeIndices, words, type Progress, type Run } from './engine';
import { exactKeys, MAX_JSON_BYTES, MAX_PERSONAL, parseBoundedJson, record, safeTree, validPersonal, verifyRevisions } from './personal';

export interface Preferences {
  translation: Translation;
  filter: Filter;
  preset: 'calm' | 'study' | 'focus';
  colour: 'light' | 'dark' | 'system';
  accent: 'rose' | 'neutral' | 'blue' | 'green' | 'purple';
  font: 'segoe' | 'aptos' | 'calibri' | 'mono';
}
export interface SavedState {
  version: 2;
  personal: PersonalVerse[];
  preferences: Preferences;
  progress: Record<string, Progress>;
  run: Run | null;
}
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const STORAGE_KEY = 'wordkeep.prototype.v2';
export const LEGACY_STORAGE_KEY = 'wordkeep.prototype.v1';
export const freshState = (): SavedState => ({
  version: 2, personal: [],
  preferences: { translation: 'webbe', filter: 'both', preset: 'calm', colour: 'system', accent: 'purple', font: 'mono' },
  progress: {}, run: null,
});
const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
const timestamp = (value: unknown): value is number =>
  integer(value) && value <= 8_640_000_000_000_000;
const oneOf = (value: unknown, values: readonly string[]) => typeof value === 'string' && values.includes(value);

export function validState(value: unknown): value is SavedState {
  if (!record(value) || value.version !== 2 || !record(value.preferences) || !record(value.progress) ||
      !safeTree(value) || !exactKeys(value, ['version', 'personal', 'preferences', 'progress', 'run']) ||
      !Array.isArray(value.personal) || value.personal.length > MAX_PERSONAL || !value.personal.every(validPersonal) ||
      new Set(value.personal.map(v => v.id)).size !== value.personal.length ||
      new Set(value.personal.map(v => v.revision)).size !== value.personal.length) return false;
  const provider = createProvider(value.personal);
  const p = value.preferences;
  if (!exactKeys(p, ['translation', 'filter', 'preset', 'colour', 'accent', 'font']) ||
      !oneOf(p.translation, ['webbe', 'bsb', 'personal']) || !oneOf(p.filter, ['both', 'OT', 'NT']) ||
      !oneOf(p.preset, ['calm', 'study', 'focus']) || !oneOf(p.colour, ['light', 'dark', 'system']) ||
      !oneOf(p.accent, ['rose', 'neutral', 'blue', 'green', 'purple']) || !oneOf(p.font, ['segoe', 'aptos', 'calibri', 'mono']) ||
      Object.keys(value.progress).length > MAX_PERSONAL + 6) return false;
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
      !exactKeys(r, ['key', 'stage', 'mode', 'slots', 'order', 'answer', 'hints', 'checks', 'exposed', 'bankCompleted']) ||
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

export async function loadState(storage: StoragePort): Promise<{ state: SavedState; error: string | null; migrated: boolean }> {
  try {
    const current = storage.getItem(STORAGE_KEY);
    const raw = current ?? storage.getItem(LEGACY_STORAGE_KEY);
    if (raw === null) return { state: freshState(), error: null, migrated: false };
    let parsed = parseBoundedJson(raw);
    const migrated = current === null;
    if (migrated) {
      if (!record(parsed) || parsed.version !== 1 || !record(parsed.preferences) ||
          !exactKeys(parsed, ['version', 'preferences', 'progress', 'run']) ||
          !exactKeys(parsed.preferences, ['translation', 'filter', 'preset', 'colour'])) throw new Error('Unsupported legacy save');
      parsed = { ...parsed, version: 2, personal: [], preferences: { ...parsed.preferences, accent: 'purple', font: 'mono' } };
    }
    if (!validState(parsed) || !await verifyRevisions(parsed.personal)) throw new Error('Unsupported or damaged save');
    return { state: parsed, error: null, migrated };
  } catch {
    return { state: freshState(), error: 'Your local save could not be read. It has not been overwritten. You can continue without saving, or explicitly replace it below.', migrated: false };
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
