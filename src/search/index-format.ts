/** Compact keyword index format shared by the build tool and the app. */
export interface IndexMeta {
  format: 'verse-recall-search';
  version: 1;
  /** Bible snapshots the index was built from. */
  sources: string[];
  /** [book id, highest verse number in each chapter across all bundled translations]. */
  books: [string, number[]][];
  /** Sorted index terms; postings.bin stores one list per term in this order. */
  vocab: string[];
  /** SHA-256 of postings.bin. */
  postingsSha256: string;
}
export interface VerseRef { book: string; chapter: number; verse: number }

/** Maps every (book, chapter, verse) to a dense ordinal and back. */
export class VerseTable {
  private readonly starts = new Map<string, number[]>();
  readonly refs: VerseRef[] = [];
  constructor(readonly books: [string, number[]][]) {
    for (const [book, chapters] of books) {
      const starts: number[] = [];
      chapters.forEach((count, i) => {
        starts.push(this.refs.length);
        for (let verse = 1; verse <= count; verse++) this.refs.push({ book, chapter: i + 1, verse });
      });
      this.starts.set(book, starts);
    }
  }
  ordinal(book: string, chapter: number, verse: number): number | undefined {
    const starts = this.starts.get(book);
    const count = this.books.find(b => b[0] === book)?.[1][chapter - 1];
    if (!starts || !count || !Number.isInteger(verse) || verse < 1 || verse > count) return undefined;
    return starts[chapter - 1] + verse - 1;
  }
  chapterCount(book: string): number { return this.starts.get(book)?.length ?? 0; }
  verseCount(book: string, chapter: number): number { return this.books.find(b => b[0] === book)?.[1][chapter - 1] ?? 0; }
}

export function encodePostings(lists: number[][], lengths: Uint8Array): Uint8Array {
  const bytes: number[] = [...lengths];
  const varint = (n: number) => { while (n > 127) { bytes.push((n & 127) | 128); n >>>= 7; } bytes.push(n); };
  for (const list of lists) {
    varint(list.length);
    let last = -1;
    for (const ordinal of list) { varint(ordinal - last); last = ordinal; }
  }
  return Uint8Array.from(bytes);
}

export interface Postings { lengths: Uint8Array; lists: Uint32Array[] }
export function decodePostings(bytes: Uint8Array, verses: number, terms: number): Postings {
  let at = verses;
  const varint = () => {
    let n = 0;
    let shift = 0;
    for (;;) {
      if (at >= bytes.length) throw new Error('Search index is truncated.');
      const b = bytes[at++];
      n += (b & 127) * 2 ** shift;
      if (b < 128) return n;
      shift += 7;
    }
  };
  const lists: Uint32Array[] = [];
  for (let t = 0; t < terms; t++) {
    const list = new Uint32Array(varint());
    let last = -1;
    for (let i = 0; i < list.length; i++) { last += varint(); list[i] = last; }
    if (last >= verses) throw new Error('Search index is damaged.');
    lists.push(list);
  }
  if (at !== bytes.length) throw new Error('Search index has unexpected data.');
  return { lengths: bytes.slice(0, verses), lists };
}
