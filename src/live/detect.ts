// Live mode: spots verses that are quoted or referenced in a running transcript, for example during a sermon.
// It works on text only; audio never reaches this module.
import type { KeywordIndex } from '../search/keyword';
import { editDistance, phonetic, terms } from '../search/normalize';
import type { ChapterText } from '../search/rank';
import { parseReferences } from '../search/reference';

export interface Detection {
  ordinal: number;
  book: string;
  chapter: number;
  verse: number;
  end?: number;
  how: 'reference' | 'quote';
  /** The words that were heard, shortened for display. */
  heard: string;
  /** Seconds since live mode started. */
  at: number;
}

/** Words kept from earlier segments, so a reference or quote split across two segments is still found. */
const CARRY_WORDS = 11;
const WINDOW = 12;
const STRIDE = 4;
/** A quote needs this many verse words heard in order (or half the verse), or every word of a short verse. */
const MIN_QUOTE = 4;
const MIN_SHORT = 3;
const LONG_QUOTE = 6;

const same = (a: string, b: string) => a === b ||
  (Math.min(a.length, b.length) >= 4 && editDistance(a, b, 1) <= 1) ||
  (Math.min(a.length, b.length) >= 3 && phonetic(a) === phonetic(b));

/** Length of the longest in-order run of heard words that matches the verse, allowing small mishearings. */
export function inOrder(heard: readonly string[], verse: readonly string[]): number {
  let previous = new Array<number>(verse.length + 1).fill(0);
  for (const word of heard) {
    const current = [0];
    for (let j = 1; j <= verse.length; j++) current[j] = same(word, verse[j - 1]) ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    previous = current;
  }
  return previous[verse.length];
}

interface Quote { ordinal: number; fit: number; words: string[] }
/** Verses with nearly the same wording, such as the closing blessings of the letters. */
const parallel = (a: readonly string[], b: readonly string[]) => inOrder(a, b) >= 0.75 * Math.min(a.length, b.length);

const clip = (text: string) => text.length > 100 ? `…${text.slice(-99)}` : text;

export class LiveDetector {
  private words: string[] = [];
  private seen = new Set<number>();
  /** Wording of the verses already reported as quotes. */
  private quotes: string[][] = [];
  constructor(private readonly index: KeywordIndex, private readonly texts: readonly ChapterText[]) {}

  /** Forgets earlier detections, so a cleared list can fill again. */
  reset(): void { this.words = []; this.seen.clear(); this.quotes = []; }

  /** Adds a finished piece of transcript and returns any verses newly heard in it. */
  async add(segment: string, at: number): Promise<Detection[]> {
    const fresh = segment.replace(/\s+/gu, ' ').trim();
    if (!fresh) return [];
    const recent = [...this.words.slice(-6), fresh].join(' ');
    const found: Detection[] = [];
    const report = (ordinal: number, how: Detection['how'], heard: string, end?: number) => {
      if (this.seen.has(ordinal)) return;
      this.seen.add(ordinal);
      found.push({ ordinal, ...this.index.ref(ordinal), ...(end ? { end } : {}), how, heard: clip(heard), at });
    };
    for (const hit of parseReferences(recent, this.index.table)) {
      if (hit.chapterOnly || hit.confidence < 1) continue;
      const ordinal = this.index.table.ordinal(hit.book, hit.chapter, hit.verse);
      if (ordinal !== undefined) report(ordinal, 'reference', recent, hit.end);
    }
    const added = fresh.split(' ').length;
    const words = [...this.words, ...fresh.split(' ')];
    this.words = words.slice(-CARRY_WORDS);
    const first = Math.max(0, words.length - added - (WINDOW - 1));
    const starts = new Set<number>([Math.max(0, words.length - WINDOW)]);
    for (let start = first; start < words.length - STRIDE; start += STRIDE) starts.add(start);
    for (const start of [...starts].sort((a, b) => a - b)) {
      const window = words.slice(start, start + WINDOW).join(' ');
      const heard = terms(window);
      if (heard.length < MIN_SHORT) continue;
      // Wording repeated across the Bible (a closing blessing, say) matches many verses: report the closest
      // and treat the rest as already heard, so one quote is one detection.
      const quotes: Quote[] = [];
      for (const hit of this.index.search(window, 8)) {
        if (this.seen.has(hit.ordinal) || hit.terms.length < MIN_SHORT) continue;
        const quote = await this.quoted(hit.ordinal, heard);
        if (quote) quotes.push(quote);
      }
      const best = quotes.reduce<Quote | null>((a, b) => !a || b.fit > a.fit ? b : a, null);
      if (best && !this.quotes.some(earlier => parallel(earlier, best.words))) {
        report(best.ordinal, 'quote', window);
        this.quotes.push(best.words);
      }
      for (const q of quotes) this.seen.add(q.ordinal);
    }
    return found.sort((a, b) => a.ordinal - b.ordinal);
  }

  /** How closely the heard words follow the verse in its best-matching translation, or null when they do not quote it. */
  private async quoted(ordinal: number, heard: readonly string[]): Promise<Quote | null> {
    let best: Quote | null = null;
    const ref = this.index.ref(ordinal);
    for (const text of this.texts) {
      let wording = '';
      try { wording = (await text(ref.book, ref.chapter))[String(ref.verse)] ?? ''; } catch { continue; }
      const verse = terms(wording);
      if (!verse.length) continue;
      const matched = inOrder(heard, verse);
      const quote = matched >= MIN_QUOTE && (matched >= LONG_QUOTE || matched >= verse.length * 0.5);
      const fit = matched + matched / verse.length;
      if ((quote || (matched >= MIN_SHORT && matched === verse.length)) && fit > (best?.fit ?? 0)) best = { ordinal, fit, words: verse };
    }
    return best;
  }
}

