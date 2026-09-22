import { BIBLE_MANIFEST_SHA256, BIBLE_SNAPSHOT } from './bible-version';
import type { Passage, Testament } from './content';
import { exactKeys, record } from './personal';

export type BibleTranslation = 'webbe' | 'bsb';
export interface BibleSelection {
  snapshot: string;
  translation: BibleTranslation;
  book: string;
  chapter: number;
  start: number;
  end: number;
}
export interface BibleChapter { number: number; path: string; sha256: string; verses: number[] }
export interface BibleBook { id: string; name: string; testament: Testament; chapters: BibleChapter[] }
interface BibleEdition { edition: string; source: string; sourceSha256: string; books: BibleBook[] }
export interface BibleManifest {
  version: 1;
  snapshot: string;
  translations: Record<BibleTranslation, BibleEdition>;
}
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
const hashString = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v);
const stringRecord = (v: unknown): v is Record<string, string> => record(v) && Object.values(v).every(s => typeof s === 'string');
function validManifest(value: unknown): value is BibleManifest {
  if (!record(value) || value.version !== 1 || value.snapshot !== BIBLE_SNAPSHOT || !record(value.translations)) return false;
  const translations = value.translations;
  return ['webbe', 'bsb'].every(id => {
    const edition = translations[id];
    return record(edition) && typeof edition.edition === 'string' && typeof edition.source === 'string' &&
      edition.source.startsWith(id === 'webbe' ? 'https://ebible.org/' : 'https://bereanbible.com/') &&
      hashString(edition.sourceSha256) && Array.isArray(edition.books) && edition.books.length === 66 &&
      edition.books.every(b => record(b) && typeof b.id === 'string' && typeof b.name === 'string' &&
        (b.testament === 'OT' || b.testament === 'NT') && Array.isArray(b.chapters) && b.chapters.length > 0 &&
        b.chapters.every(c => record(c) && integer(c.number) && typeof c.path === 'string' &&
          c.path === `${id}/${b.id}-${c.number}.json` && hashString(c.sha256) &&
          Array.isArray(c.verses) && c.verses.length > 0 && c.verses.every(integer)));
  });
}

let manifest: BibleManifest | undefined;
let manifestLoading: Promise<BibleManifest> | undefined;
const chapters = new Map<string, Record<string, string>>();
const chaptersLoading = new Map<string, Promise<Record<string, string>>>();
const verified = new Map<string, Passage>();
const base = () => `${import.meta.env?.BASE_URL ?? '/'}bibles/${BIBLE_SNAPSHOT}/`;
const digest = async (bytes: Uint8Array<ArrayBuffer>) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');

async function checkedJson(path: string, hash: string, limit: number): Promise<unknown> {
  let response: Response;
  try { response = await fetch(base() + path, { signal: AbortSignal.timeout(12_000) }); }
  catch { throw new Error('Bible text could not be loaded. Check your connection and try again; no passage was added.'); }
  if (!response.ok) throw new Error(`Bible text is unavailable (${response.status}). Please retry; no passage was added.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > limit || await digest(bytes) !== hash) throw new Error('Bible source validation failed. Reload the app to use its matching official edition; no passage was added.');
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export async function loadBibleManifest(): Promise<BibleManifest> {
  if (manifest) return manifest;
  if (manifestLoading) return manifestLoading;
  manifestLoading = (async () => {
    const value = await checkedJson('manifest.json', BIBLE_MANIFEST_SHA256, 1_500_000);
    if (!validManifest(value)) throw new Error('Invalid Bible catalogue.');
    // The exact manifest digest is compiled into the app; source selection never trusts imported metadata.
    manifest = value;
    return manifest;
  })();
  try { return await manifestLoading; }
  finally { manifestLoading = undefined; }
}

export function validBibleSelection(value: unknown): value is BibleSelection {
  return record(value) && exactKeys(value, ['snapshot', 'translation', 'book', 'chapter', 'start', 'end']) &&
    value.snapshot === BIBLE_SNAPSHOT && ['webbe', 'bsb'].includes(String(value.translation)) &&
    typeof value.book === 'string' && /^[1-3]?[A-Z]{2,3}$/u.test(value.book) &&
    [value.chapter, value.start, value.end].every(n => Number.isSafeInteger(n) && Number(n) > 0 && Number(n) <= 176) &&
    Number(value.end) >= Number(value.start) && Number(value.end) - Number(value.start) < 120;
}
export const bibleSelectionKey = (s: BibleSelection) =>
  `catalog:${s.snapshot}:${s.translation}:${s.book}:${s.chapter}:${s.start}-${s.end}`;
export const selectedBiblePassages = (selections: readonly BibleSelection[] = []): Passage[] =>
  selections.flatMap(s => { const p = verified.get(bibleSelectionKey(s)); return p ? [p] : []; });

export async function readBibleChapter(translation: BibleTranslation, bookId: string, chapterNumber: number): Promise<Record<string, string>> {
  const index = await loadBibleManifest();
  const book = index.translations[translation].books.find(b => b.id === bookId);
  const chapter = book?.chapters.find(c => c.number === chapterNumber);
  if (!chapter) throw new Error('This chapter is not in the selected Bible edition.');
  const cached = chapters.get(chapter.path);
  if (cached) return cached;
  const inFlight = chaptersLoading.get(chapter.path);
  if (inFlight) return inFlight;
  const loading = (async () => {
    const value = await checkedJson(chapter.path, chapter.sha256, 250_000);
    if (!record(value) || value.snapshot !== BIBLE_SNAPSHOT || value.translation !== translation ||
        value.book !== bookId || value.chapter !== chapterNumber || !stringRecord(value.verses)) throw new Error('Invalid official chapter data.');
    const verses = value.verses;
    chapters.set(chapter.path, verses);
    return verses;
  })();
  chaptersLoading.set(chapter.path, loading);
  try { return await loading; }
  finally { chaptersLoading.delete(chapter.path); }
}

export async function resolveBibleSelection(value: unknown): Promise<Passage> {
  if (!validBibleSelection(value)) throw new Error('Unsupported Bible reference or edition. No passage was added.');
  const key = bibleSelectionKey(value);
  const cached = verified.get(key);
  if (cached) return cached;
  const index = await loadBibleManifest();
  const edition = index.translations[value.translation];
  const book = edition.books.find(b => b.id === value.book);
  if (!book) throw new Error('Book not found in the selected edition.');
  const rows = await readBibleChapter(value.translation, value.book, value.chapter);
  const numbers = Array.from({ length: value.end - value.start + 1 }, (_, i) => value.start + i);
  const text = numbers.map(n => {
    const verse = rows[String(n)];
    if (!verse) throw new Error(`Verse ${n} has no text in this edition. Choose only available verse numbers; no text is substituted from another translation.`);
    return verse;
  }).join('\n');
  if (text.length > 2000 || text.trim().split(/\s+/u).length > 120) {
    throw new Error('This selection exceeds the exercise limit of 120 words / 2,000 characters. Choose a shorter range; nothing is truncated.');
  }
  const reference = `${book.name} ${value.chapter}:${value.start}${value.end !== value.start ? `–${value.end}` : ''}`;
  const passage: Passage = {
    id: key, translation: value.translation, edition: edition.edition, reference,
    testament: book.testament, title: 'Official Bible selection', text, source: edition.source,
    mapping: { scheme: value.translation === 'webbe' ? 'eng-webbe-vpl' : 'bsb-official-txt', book: value.book, chapter: value.chapter, verses: numbers },
    catalogue: { key, sourceSha256: edition.sourceSha256, snapshot: value.snapshot },
  };
  verified.set(key, passage);
  return passage;
}

export async function prepareOfficialSelections(state: unknown): Promise<void> {
  if (!record(state) || !Object.hasOwn(state, 'official')) return;
  if (!Array.isArray(state.official) || state.official.length > 100 ||
      !state.official.every(validBibleSelection) ||
      new Set(state.official.map(bibleSelectionKey)).size !== state.official.length) {
    throw new Error('Invalid official Bible selections. Nothing was imported.');
  }
  // Serial resolution bounds simultaneous requests when restoring a large backup.
  for (const selection of state.official) await resolveBibleSelection(selection);
}
