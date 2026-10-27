import { BOOK_ALIASES, BOOK_NAMES, MAX_ALIAS_WORDS } from './books';
import { editDistance } from './normalize';
import type { VerseTable } from './index-format';

export interface ReferenceHit {
  book: string;
  chapter: number;
  verse: number;
  /** Last verse of a range, when one was given. */
  end?: number;
  /** True when only a chapter was named; verse is then 1. */
  chapterOnly: boolean;
  /** 1 for an exact book name, lower for a typo-tolerant match. */
  confidence: number;
}

const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const VERSE_MARKS = new Set([':', '.', 'v', 'vs', 'vv', 'verse', 'verses']);
const CHAPTER_MARKS = new Set(['chapter', 'chapters', 'chap', 'ch']);
const RANGE_MARKS = new Set(['-', '–', '—', 'to', 'through', 'thru', 'until']);
const ROMAN = /^(?=[ivxlc]{2,}$)c?(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/u;

type Kind = 'typed' | 'unit' | 'two' | 'zero' | 'whole';
interface Atom { text: string; kind: Kind }
type Item = Atom | 'verse' | 'range';
/** A number still being spoken, e.g. "one hundred" or "twenty" waiting for a unit. */
interface Open { atom: Atom; value: number; hundred: boolean; tens: boolean }

function roman(token: string): number {
  const values: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
  let total = 0;
  for (let i = 0; i < token.length; i++) {
    const v = values[token[i]];
    total += v < (values[token[i + 1]] ?? 0) ? -v : v;
  }
  return total;
}

export function tokenize(text: string): string[] {
  return text.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().match(/\d+|[a-z]+|[:.\-–—]/gu) ?? [];
}

/** Reads number words, digits, Roman numerals and separators starting at `from`. */
function readNumbers(tokens: string[], from: number): { items: Item[]; next: number } {
  const items: Item[] = [];
  let open: Open | null = null;
  const set = (o: Open, value: number) => { o.value = value; o.atom.text = String(value); };
  const hasAtom = () => items.some(x => typeof x !== 'string');
  let i = from;
  for (; i < tokens.length; i++) {
    const t = tokens[i];
    const unit = UNITS.indexOf(t);
    const tens = TENS.indexOf(t);
    const last = items.at(-1);
    if (/^\d+$/u.test(t)) { items.push({ text: String(Number(t)), kind: 'typed' }); open = null; }
    else if (ROMAN.test(t)) { items.push({ text: String(roman(t)), kind: 'whole' }); open = null; }
    else if (t === 'a' && tokens[i + 1] === 'hundred') {
      const atom: Atom = { text: '1', kind: 'unit' };
      items.push(atom);
      open = { atom, value: 1, hundred: false, tens: false };
    } else if (t === 'hundred' && open && !open.hundred && open.value < 10) {
      set(open, open.value * 100);
      open.hundred = true;
      open.atom.kind = 'whole';
    } else if (t === 'and' && open?.hundred && open.value % 100 === 0) continue;
    else if (unit > 0) {
      if (open && ((open.hundred && open.value % 100 === 0) || (open.tens && unit < 10))) {
        set(open, open.value + unit);
        open = null;
      } else {
        const atom: Atom = { text: String(unit), kind: unit < 10 ? 'unit' : 'two' };
        items.push(atom);
        open = unit < 10 ? { atom, value: unit, hundred: false, tens: false } : null;
      }
    } else if (tens > 1) {
      if (open?.hundred && open.value % 100 === 0) { set(open, open.value + tens * 10); open.tens = true; }
      else {
        const atom: Atom = { text: String(tens * 10), kind: 'two' };
        items.push(atom);
        open = { atom, value: tens * 10, hundred: false, tens: true };
      }
    } else if ((t === 'zero' || t === 'oh' || t === 'o') && hasAtom()) { items.push({ text: '0', kind: 'zero' }); open = null; }
    else if (VERSE_MARKS.has(t) && hasAtom() && last !== 'verse') { items.push('verse'); open = null; }
    else if (CHAPTER_MARKS.has(t) && !items.length) continue;
    else if (RANGE_MARKS.has(t) && hasAtom() && last !== 'range') { items.push('range'); open = null; }
    else break;
  }
  while (typeof items.at(-1) === 'string') { items.pop(); i--; }
  return { items, next: i };
}

/** Cost of reading two neighbouring atoms as one number ("one nineteen" → 119, but typed "3 16" stays 3:16). */
function joinCost(a: Atom, b: Atom): number {
  if (a.kind === 'typed' && b.kind === 'typed') return 5;
  if (a.kind === 'zero' || b.kind === 'zero') return -1;
  if (a.kind === 'unit' && b.kind === 'two') return -1;
  return 1;
}
const join = (atoms: Atom[]) => ({ value: Number(atoms.map(a => a.text).join('')), cost: atoms.slice(1).reduce((c, a, i) => c + joinCost(atoms[i], a), 0) });

function resolve(book: string, items: Item[], table: VerseTable, confidence: number): ReferenceHit | null {
  const range = items.indexOf('range');
  const main = (range < 0 ? items : items.slice(0, range));
  const endAtoms = range < 0 ? [] : items.slice(range + 1).filter((x): x is Atom => typeof x !== 'string');
  const single = table.chapterCount(book) === 1;
  const candidates: { chapter: number; verse?: number; cost: number }[] = [];
  const marker = main.indexOf('verse');
  if (marker >= 0) {
    const c = join(main.slice(0, marker).filter((x): x is Atom => typeof x !== 'string'));
    const v = join(main.slice(marker + 1).filter((x): x is Atom => typeof x !== 'string'));
    candidates.push({ chapter: c.value, verse: v.value, cost: c.cost + v.cost });
  } else {
    const atoms = main.filter((x): x is Atom => typeof x !== 'string');
    if (!atoms.length || atoms.length > 6) return null;
    const whole = join(atoms);
    if (single) candidates.push({ chapter: 1, verse: whole.value, cost: whole.cost });
    candidates.push({ chapter: whole.value, cost: whole.cost + 0.5 });
    for (let split = 1; split < atoms.length; split++) {
      const c = join(atoms.slice(0, split));
      const v = join(atoms.slice(split));
      candidates.push({ chapter: c.value, verse: v.value, cost: c.cost + v.cost });
    }
  }
  const valid = candidates
    .filter(c => c.chapter >= 1 && c.chapter <= table.chapterCount(book) && (c.verse === undefined || table.ordinal(book, c.chapter, c.verse) !== undefined))
    .sort((a, b) => a.cost - b.cost);
  const best = valid[0];
  if (!best) return null;
  const hit: ReferenceHit = { book, chapter: best.chapter, verse: best.verse ?? 1, chapterOnly: best.verse === undefined, confidence };
  if (endAtoms.length && best.verse !== undefined) {
    const end = join(endAtoms).value;
    if (end > best.verse && end <= table.verseCount(book, best.chapter)) hit.end = end;
  }
  return hit;
}

/** Finds every Bible reference in written or spoken text, e.g. "John three sixteen" or "1 Cor 13:4-7". */
export function parseReferences(text: string, table: VerseTable): ReferenceHit[] {
  const tokens = tokenize(text);
  const hits: ReferenceHit[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let book: string | undefined;
    let used = 0;
    let confidence = 1;
    for (let n = Math.min(MAX_ALIAS_WORDS, tokens.length - i); n >= 1 && !book; n--) {
      book = BOOK_ALIASES.get(tokens.slice(i, i + n).join(' '));
      if (book) used = n;
    }
    if (!book) {
      for (const n of [2, 1]) {
        const phrase = tokens.slice(i, i + n).join(' ');
        if (i + n > tokens.length || phrase.replace(/^\d /u, '').length < 4) continue;
        for (const [name, id] of BOOK_NAMES) {
          if (name.split(' ').length !== n) continue;
          if (editDistance(phrase, name, name.length >= 8 ? 2 : 1) <= (name.length >= 8 ? 2 : 1)) { book = id; used = n; confidence = 0.85; break; }
        }
        if (book) break;
      }
    }
    if (!book) continue;
    const { items, next } = readNumbers(tokens, i + used);
    const hit = items.length ? resolve(book, items, table, confidence) : null;
    if (hit) { hits.push(hit); i = next - 1; }
  }
  return hits;
}
