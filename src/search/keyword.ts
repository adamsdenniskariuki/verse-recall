import { decodePostings, VerseTable, type IndexMeta, type VerseRef } from './index-format';
import { editDistance, isStop, phonetic, stem, terms, wordSpans } from './normalize';

export interface KeywordHit { ordinal: number; score: number; coverage: number; terms: string[] }
interface Expansion { term: number; weight: number }

/** Typo-tolerant keyword search over the prebuilt inverted index. */
export class KeywordIndex {
  readonly table: VerseTable;
  private readonly lists: Uint32Array[];
  private readonly lengths: Uint8Array;
  private readonly termIds = new Map<string, number>();
  private readonly byLength = new Map<number, number[]>();

  constructor(readonly meta: IndexMeta, postings: Uint8Array) {
    this.table = new VerseTable(meta.books);
    ({ lists: this.lists, lengths: this.lengths } = decodePostings(postings, this.table.refs.length, meta.vocab.length));
    meta.vocab.forEach((term, id) => {
      this.termIds.set(term, id);
      (this.byLength.get(term.length) ?? this.byLength.set(term.length, []).get(term.length)!).push(id);
    });
  }

  get verses(): number { return this.table.refs.length; }
  ref(ordinal: number): VerseRef { return this.table.refs[ordinal]; }
  private idf(term: number): number { return Math.log(1 + this.verses / this.lists[term].length); }

  /** Exact, typo-tolerant, sound-alike and prefix matches for one query term, weighted 0–1. */
  expand(word: string, last: boolean): Expansion[] {
    const found = new Map<number, number>();
    const exact = this.termIds.get(word);
    if (exact !== undefined) found.set(exact, 1);
    // Close variants of a word that exists are usually different words ("lord" → "lod"), so trust them less.
    const damp = exact === undefined ? 1 : 0.6;
    const max = word.length >= 7 ? 2 : word.length >= 4 ? 1 : 0;
    const sound = word.length >= 4 ? phonetic(word) : '';
    const reach = Math.max(max, sound ? 2 : 0);
    for (let length = word.length - reach; length <= word.length + reach; length++) {
      for (const id of this.byLength.get(length) ?? []) {
        if (found.has(id)) continue;
        const term = this.meta.vocab[id];
        const distance = editDistance(word, term, reach);
        if (distance <= max) found.set(id, damp * (distance === 1 ? 0.8 : 0.6));
        else if (distance <= 2 && sound && phonetic(term) === sound) found.set(id, damp * 0.7);
      }
    }
    if (word.length >= 3) {
      const extra = last ? Infinity : word.length >= 4 ? 3 : 0;
      for (const [term, id] of this.termIds) {
        if (!found.has(id) && term.length > word.length && term.length - word.length <= extra && term.startsWith(word)) found.set(id, damp * 0.6);
      }
    }
    // Keep the closest few so a short typo does not flood results with unrelated words.
    return [...found].map(([term, weight]) => ({ term, weight }))
      .sort((a, b) => b.weight - a.weight || this.lists[b.term].length - this.lists[a.term].length).slice(0, 12);
  }

  search(query: string, limit = 40): KeywordHit[] {
    const words = [...new Set(terms(query))];
    if (!words.length) return [];
    const best = new Float32Array(this.verses);
    const total = new Float32Array(this.verses);
    const matched = new Uint8Array(this.verses);
    const termsFor = new Map<number, Set<string>>();
    let possible = 0;
    words.forEach((word, i) => {
      const expansions = this.expand(word, i === words.length - 1 && !/\s$/u.test(query));
      if (!expansions.length) { possible += 1; return; }
      // A word is worth its own rarity; a misspelling is worth the rarity of what it most likely meant.
      const exact = this.termIds.get(word);
      const worth = exact !== undefined ? this.idf(exact) : this.idf(expansions[0].term);
      possible += worth;
      best.fill(0);
      for (const { term, weight } of expansions) {
        const score = weight * Math.min(worth, this.idf(term));
        for (const ordinal of this.lists[term]) {
          if (score > best[ordinal]) best[ordinal] = score;
          (termsFor.get(ordinal) ?? termsFor.set(ordinal, new Set()).get(ordinal)!).add(this.meta.vocab[term]);
        }
      }
      for (let ordinal = 0; ordinal < this.verses; ordinal++) if (best[ordinal]) { total[ordinal] += best[ordinal]; matched[ordinal]++; }
    });
    const hits: KeywordHit[] = [];
    for (const [ordinal, set] of termsFor) {
      const coverage = Math.min(1, total[ordinal] / possible);
      // Shorter verses that use the same words are more likely to be the one remembered.
      const score = coverage - 0.004 * Math.max(0, this.lengths[ordinal] - matched[ordinal]);
      hits.push({ ordinal, score, coverage, terms: [...set] });
    }
    return hits.sort((a, b) => b.score - a.score || a.ordinal - b.ordinal).slice(0, limit);
  }
}

/** Bonus for query words that appear next to each other, in order, in the verse text (0–1). Tolerates typos. */
export function phraseScore(query: string, text: string): number {
  const q = wordSpans(query).map(s => s.word).filter(w => !isStop(w)).map(stem);
  if (q.length < 2) return 0;
  const t = wordSpans(text).map(s => s.word).filter(w => !isStop(w)).map(stem);
  const same = (a: string, b: string) => a === b ||
    (a.length >= 4 && editDistance(a, b, a.length >= 7 ? 2 : 1) <= (a.length >= 7 ? 2 : 1)) ||
    (a.length >= 4 && editDistance(a, b, 2) <= 2 && phonetic(a) === phonetic(b));
  let pairs = 0;
  for (let i = 0; i < q.length - 1; i++) {
    for (let j = 0; j < t.length - 1; j++) {
      if (same(q[i], t[j]) && t.slice(j + 1, j + 3).some(w => same(q[i + 1], w))) { pairs++; break; }
    }
  }
  return pairs / (q.length - 1);
}
