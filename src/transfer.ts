import { passageKey, personalPassage, type PersonalVerse } from './content';
import { exactKeys, makePersonal, MAX_JSON_BYTES, MAX_PERSONAL, parseBoundedJson, record, validId, validVerseInput, verifyRevisions, verseFields } from './personal';
import { validState, type SavedState } from './store';

export type ImportPayload =
  | { kind: 'verses'; personal: PersonalVerse[] }
  | { kind: 'backup'; state: SavedState };
export interface MergeOptions { preferences: boolean; replaceProgressAndSession: boolean }
export interface ImportPlan {
  base: string;
  next: SavedState;
  added: number;
  updated: number;
  duplicates: number;
  progressAdded: number;
  progressKept: number;
  progressReplaced: number;
  warnings: string[];
}
export const defaultMergeOptions: MergeOptions = { preferences: true, replaceProgressAndSession: false };
export const verseTemplate = {
  format: 'wordkeep-verses', version: 1,
  verses: [{
    reference: 'Practice sample 1', text: 'Keep these sample words close.',
    translationLabel: 'Original practice text', edition: 'My first edition', testament: 'NT',
  }],
};
const keyOf = (verse: PersonalVerse) => passageKey(personalPassage(verse));

export async function parseImport(raw: string): Promise<ImportPayload> {
  let value: unknown;
  try { value = parseBoundedJson(raw); }
  catch (error) { throw new Error(error instanceof SyntaxError ? 'This is not valid JSON. Nothing has been changed.' : error instanceof Error ? error.message : 'Cannot read this JSON.'); }
  if (!record(value)) throw new Error('Expected a Verse Recall JSON object.');
  if (value.format === 'wordkeep-backup') {
    if (!exactKeys(value, ['format', 'version', 'exportedAt', 'state']) || value.version !== 2 ||
        typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt)) ||
        !validState(value.state) || !await verifyRevisions(value.state.personal)) {
      throw new Error('Backup validation failed. Its version, verses, content hashes, preferences, progress or resumable session are invalid. Nothing has changed.');
    }
    return { kind: 'backup', state: value.state };
  }
  if (value.format !== 'wordkeep-verses' || value.version !== 1 ||
      !exactKeys(value, ['format', 'version', 'verses']) || !Array.isArray(value.verses) ||
      value.verses.length === 0 || value.verses.length > MAX_PERSONAL) {
    throw new Error('Expected wordkeep-verses version 1 with 1–100 verses, or a wordkeep-backup version 2.');
  }
  const personal: PersonalVerse[] = [];
  for (const [index, input] of value.verses.entries()) {
    const id = record(input) ? input.id : undefined;
    if (!record(input) || !validVerseInput(input) ||
        !exactKeys(input, Object.hasOwn(input, 'id') ? ['id', ...verseFields] : verseFields) ||
        (Object.hasOwn(input, 'id') && !validId(id))) {
      throw new Error(`Verse ${index + 1} is invalid. Use the template: reference ≤120 characters; translation/edition ≤80; text 1–120 words and ≤2,000 characters; testament OT or NT.`);
    }
    const verse = await makePersonal({
      reference: input.reference, text: input.text, translationLabel: input.translationLabel,
      edition: input.edition, testament: input.testament,
    }, validId(id) ? id : undefined);
    if (personal.some(v => v.id === verse.id)) throw new Error(`Verse ${index + 1} repeats an ID. Each file must have unique IDs.`);
    personal.push(verse);
  }
  return { kind: 'verses', personal };
}

export function planImport(current: SavedState, incoming: ImportPayload, options = defaultMergeOptions): ImportPlan {
  const next = structuredClone(current);
  const plan: ImportPlan = { base: JSON.stringify(current), next, added: 0, updated: 0, duplicates: 0, progressAdded: 0, progressKept: 0, progressReplaced: 0, warnings: [] };
  const remap = new Map<string, string>();
  const verses = incoming.kind === 'backup' ? incoming.state.personal : incoming.personal;
  for (const verse of verses) {
    const byId = next.personal.findIndex(v => v.id === verse.id);
    const identical = next.personal.find(v => v.revision === verse.revision);
    if (byId >= 0 && next.personal[byId].revision !== verse.revision) {
      if (identical && identical.id !== verse.id) throw new Error('This file updates an ID to duplicate a different personal verse. Remove the conflicting entry before importing.');
      const oldKey = keyOf(next.personal[byId]);
      delete next.progress[oldKey];
      if (next.run?.key === oldKey) {
        next.run = null;
        plan.warnings.push('The current exercise uses a changed personal verse and will be cleared.');
      }
      next.personal[byId] = structuredClone(verse);
      plan.updated++;
      plan.warnings.push(`Changed content or metadata: ${verse.reference}. Its previous progress/reviews will be reset; unrelated data stays.`);
      remap.set(keyOf(verse), keyOf(verse));
    } else if (identical) {
      plan.duplicates++;
      remap.set(keyOf(verse), keyOf(identical));
    } else {
      next.personal.push(structuredClone(verse));
      remap.set(keyOf(verse), keyOf(verse));
      plan.added++;
    }
  }
  if (incoming.kind === 'backup') {
    for (const progress of Object.values(incoming.state.progress)) {
      const key = remap.get(progress.key) ?? progress.key;
      if (Object.hasOwn(next.progress, key)) {
        if (!options.replaceProgressAndSession) { plan.progressKept++; continue; }
        plan.progressReplaced++;
      } else plan.progressAdded++;
      next.progress[key] = { ...progress, key };
    }
    if (options.preferences) {
      next.preferences = structuredClone(incoming.state.preferences);
      plan.warnings.push('Appearance and content preferences will use the backup values.');
    }
    if (!next.run || options.replaceProgressAndSession) {
      const run = incoming.state.run ? structuredClone(incoming.state.run) : null;
      if (run) run.key = remap.get(run.key) ?? run.key;
      // A completed result must not display another device's different record.
      const sourceProgress = incoming.state.run ? incoming.state.progress[incoming.state.run.key] : undefined;
      if (run?.stage === 'results' && JSON.stringify(next.progress[run.key]) !== JSON.stringify({ ...sourceProgress, key: run.key })) {
        plan.warnings.push('Completed results were not restored because the retained progress record differs.');
      } else {
        if (current.run) plan.warnings.push('The current session will be replaced by the backup session (or cleared if the backup has none).');
        next.run = run;
      }
    } else plan.warnings.push('Your current exercise is kept. The backup session is not restored.');
    if (plan.progressReplaced) plan.warnings.push(`${plan.progressReplaced} matching progress record(s) will be replaced, not added together.`);
  } else next.preferences = { ...next.preferences, translation: 'personal', filter: 'both' };
  if (!validState(next) || new TextEncoder().encode(JSON.stringify(next)).length > MAX_JSON_BYTES) {
    throw new Error('The merged result exceeds the 100 personal-verse / 1 MiB limit or has incompatible data. Nothing has changed.');
  }
  return plan;
}

export function confirmImport(current: SavedState, plan: ImportPlan): SavedState {
  if (JSON.stringify(current) !== plan.base) throw new Error('Your data changed after this preview. Preview the import again before confirming.');
  if (!validState(plan.next)) throw new Error('The import preview is no longer valid.');
  return structuredClone(plan.next);
}
export function exportBackup(state: SavedState, now = new Date()): string {
  if (!validState(state)) throw new Error('Cannot export invalid session data.');
  const raw = JSON.stringify({ format: 'wordkeep-backup', version: 2, exportedAt: now.toISOString(), state }, null, 2);
  if (new TextEncoder().encode(raw).length > MAX_JSON_BYTES) throw new Error('Backup exceeds the 1 MiB transfer limit.');
  return raw;
}
