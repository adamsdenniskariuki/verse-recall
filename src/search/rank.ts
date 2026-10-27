import type { VerseRef } from './index-format';
import { phraseScore, type KeywordIndex } from './keyword';
import { parseReferences } from './reference';

export type Strategy = 'reference' | 'keyword';
export const STRATEGY_NAMES: Record<Strategy, string> = { reference: 'Reference', keyword: 'Keywords' };
export interface Candidate { ordinal: number; score: number; strategy: Strategy; terms?: string[]; end?: number; chapterOnly?: boolean }
export interface FoundVerse extends VerseRef {
  ordinal: number;
  /** 0–1, shown as a percentage. */
  confidence: number;
  strategies: Strategy[];
  /** Index terms to highlight in the verse text. */
  terms: string[];
  end?: number;
  chapterOnly?: boolean;
}
/** Reads one chapter of the display translation, used to reward words that appear together. */
export type ChapterText = (book: string, chapter: number) => Promise<Record<string, string>>;

/**
 * Merges candidates from each strategy. A verse found by several strategies keeps its best score
 * plus a small agreement bonus, so independent evidence ranks higher than any single source.
 */
export function mergeResults(lists: Candidate[][], ref: (ordinal: number) => VerseRef, limit = 10): FoundVerse[] {
  const merged = new Map<number, FoundVerse>();
  for (const list of lists) for (const c of list) {
    const found = merged.get(c.ordinal);
    if (!found) {
      merged.set(c.ordinal, { ...ref(c.ordinal), ordinal: c.ordinal, confidence: c.score, strategies: [c.strategy], terms: c.terms ?? [],
        ...(c.end ? { end: c.end } : {}), ...(c.chapterOnly ? { chapterOnly: true } : {}) });
      continue;
    }
    if (!found.strategies.includes(c.strategy)) {
      found.strategies.push(c.strategy);
      found.confidence = Math.max(found.confidence, c.score) + 0.05;
    } else found.confidence = Math.max(found.confidence, c.score);
    found.terms = [...new Set([...found.terms, ...(c.terms ?? [])])];
    if (c.end && !found.end) found.end = c.end;
  }
  return [...merged.values()]
    .map(f => ({ ...f, confidence: Math.max(0, Math.min(1, f.confidence)) }))
    .sort((a, b) => b.confidence - a.confidence || a.ordinal - b.ordinal)
    .slice(0, limit);
}

/** Runs reference parsing and keyword search, refines the best keyword matches with phrase order, and ranks them together. */
export async function findVerses(query: string, index: KeywordIndex, text: ChapterText, limit = 10): Promise<FoundVerse[]> {
  const references: Candidate[] = parseReferences(query, index.table).flatMap(hit => {
    const ordinal = index.table.ordinal(hit.book, hit.chapter, hit.verse);
    return ordinal === undefined ? [] : [{ ordinal, score: hit.confidence, strategy: 'reference' as const, end: hit.end, chapterOnly: hit.chapterOnly }];
  });
  const hits = index.search(query, 40);
  const top = hits.slice(0, 15);
  const keyword: Candidate[] = await Promise.all(top.map(async hit => {
    const ref = index.ref(hit.ordinal);
    let phrase = 0;
    try { phrase = phraseScore(query, (await text(ref.book, ref.chapter))[ref.verse] ?? ''); } catch { /* offline: rank on keywords alone */ }
    return { ordinal: hit.ordinal, score: 0.85 * hit.score + 0.12 * phrase, strategy: 'keyword' as const, terms: hit.terms };
  }));
  const rest: Candidate[] = hits.slice(15).map(hit => ({ ordinal: hit.ordinal, score: 0.85 * hit.score, strategy: 'keyword', terms: hit.terms }));
  return mergeResults([references, keyword, rest], ordinal => index.ref(ordinal), limit);
}
