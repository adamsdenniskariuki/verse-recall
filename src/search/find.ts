// Loaded only when someone opens Find a verse, so the main bundle stays small.
import { loadBibleEdition, readBibleChapter, type BibleTranslation } from '../bible-catalog';
import { loadKeywordIndex } from './load';
import { stem, wordSpans } from './normalize';
import { findVerses, type FoundVerse, type MeaningHit } from './rank';
import { matchTopic } from './topics';

export interface Segment { text: string; mark: boolean }
export interface ShownVerse {
  reference: string;
  /** Verse text split for highlighting, or empty when this edition omits the verse. */
  parts: Segment[];
  before: { verse: number; text: string }[];
  after: { verse: number; text: string }[];
}

/** Splits text so words whose stem matched the search can be wrapped in <mark>. */
export function highlight(text: string, terms: readonly string[]): Segment[] {
  const wanted = new Set(terms);
  const parts: Segment[] = [];
  let at = 0;
  for (const span of wordSpans(text)) {
    if (!wanted.has(stem(span.word))) continue;
    if (span.start > at) parts.push({ text: text.slice(at, span.start), mark: false });
    parts.push({ text: text.slice(span.start, span.end), mark: true });
    at = span.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at), mark: false });
  return parts;
}

/** Fetches and verifies the index in the background so the first search is quick. */
export const preload = () => loadKeywordIndex();

export async function search(query: string, translation: BibleTranslation, meaning: readonly MeaningHit[] = []): Promise<FoundVerse[]> {
  const index = await loadKeywordIndex();
  const found = await findVerses(query, index, (book, chapter) => readBibleChapter(translation, book, chapter), matchTopic(query) ? 10 : 6, meaning);
  return found.filter(f => f.confidence >= 0.2);
}

/** Loads the wording of each result in one edition, with two verses of context either side. */
export async function show(found: readonly FoundVerse[], translation: BibleTranslation): Promise<ShownVerse[]> {
  const names = new Map((await loadBibleEdition(translation)).books.map(b => [b.id, b.name]));
  return Promise.all(found.map(async f => {
    const end = f.end ?? f.verse;
    const reference = `${names.get(f.book) ?? f.book} ${f.chapter}:${f.verse}${end !== f.verse ? `–${end}` : ''}`;
    let rows: Record<string, string> = {};
    try { rows = await readBibleChapter(translation, f.book, f.chapter); } catch { /* shown as unavailable */ }
    const text = Array.from({ length: end - f.verse + 1 }, (_, i) => rows[String(f.verse + i)] ?? '').filter(Boolean).join(' ');
    const near = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i)
      .flatMap(verse => rows[String(verse)] ? [{ verse, text: rows[String(verse)] }] : []);
    return { reference, parts: text ? highlight(text, f.terms) : [], before: near(Math.max(1, f.verse - 2), f.verse - 1), after: near(end + 1, end + 2) };
  }));
}
