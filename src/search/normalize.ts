/**
 * Text normalisation shared by the build-time index tool and in-app search, so both sides
 * always agree. Archaic KJV forms map to modern equivalents before light stemming.
 */
const ARCHAIC: Record<string, string> = {
  thee: 'you', thou: 'you', ye: 'you', thy: 'your', thine: 'your', yourselves: 'yourself',
  hath: 'has', hast: 'has', doth: 'does', dost: 'does', art: 'are', wast: 'was', wert: 'were',
  shalt: 'shall', wilt: 'will', canst: 'can', couldest: 'could', wouldest: 'would', shouldest: 'should',
  mayest: 'may', mightest: 'might', didst: 'did', hadst: 'had', saith: 'says', spake: 'spoke',
  unto: 'to', whither: 'where', thither: 'there', hither: 'here', whence: 'where', yea: 'yes', nay: 'no',
  begat: 'beget', brethren: 'brothers', twain: 'two', aught: 'anything', naught: 'nothing',
  verily: 'truly', ere: 'before', lo: 'look', behold: 'look', wherefore: 'therefore', peradventure: 'perhaps',
  shew: 'show', sware: 'swore', wroth: 'angry', ensample: 'example', amongst: 'among', whilst: 'while',
  feet: 'foot', teeth: 'tooth', men: 'man', women: 'woman', children: 'child',
};
/** Very common words carry almost no meaning and are left out of the index to keep it small. */
export const STOPWORDS = new Set((
  'a all also an and any are as at be been but by can did do does even for from had has have he her him his how i if in into ' +
  'is it its let may me might my no nor not of on or our out shall she should so than that the their them then there these they ' +
  'this those to up upon us was we were what when which who whom why will with would you your'
).split(' '));

const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();

/** Splits text into lower-case word tokens, keeping their character offsets for highlighting. */
export function wordSpans(text: string): { word: string; start: number; end: number }[] {
  const spans: { word: string; start: number; end: number }[] = [];
  for (const match of text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu)) {
    spans.push({ word: fold(match[0]).replace(/['’]s$/u, '').replace(/['’]/gu, ''), start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

/** Light, deterministic suffix stripping. It only needs to be consistent, not linguistically perfect. */
export function stem(word: string): string {
  let w = ARCHAIC[word] ?? word;
  if (w.length <= 3 || /^\d+$/u.test(w)) return w;
  if (w.endsWith('ies') && w.length > 4) w = w.slice(0, -3) + 'y';
  else if ((w.endsWith('eth') || w.endsWith('est')) && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith('ing') && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith('ed') && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith('s') && !/(?:ss|us|is)$/u.test(w)) w = w.slice(0, -1);
  if (/([b-df-hj-np-tv-z])\1$/u.test(w) && !/(?:ll|ss)$/u.test(w)) w = w.slice(0, -1);
  if (w.endsWith('e') && w.length > 3) w = w.slice(0, -1);
  return w;
}

export const isStop = (word: string) => STOPWORDS.has(ARCHAIC[word] ?? word);

/** Index terms for a verse or query: folded, stop words removed, stemmed. */
export function terms(text: string): string[] {
  return wordSpans(text).map(s => s.word).filter(w => !isStop(w)).map(stem).filter(Boolean);
}

/** Bounded Damerau–Levenshtein (adjacent swaps count once); returns max + 1 once the limit is exceeded. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let older: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) current[j] = Math.min(current[j], older[j - 2] + 1);
      best = Math.min(best, current[j]);
    }
    if (best > max) return max + 1;
    older = previous;
    previous = current;
  }
  return previous[b.length];
}

/** A rough sound-alike key so misheard words ("lite", "feat") still find "light" and "feet". */
export function phonetic(word: string): string {
  const w = word.replace(/^kn|^wr/u, m => m[1]).replace(/ph/gu, 'f').replace(/gh/gu, '').replace(/ck/gu, 'k')
    .replace(/sh/gu, 'x').replace(/th/gu, '0').replace(/wh/gu, 'w').replace(/c(?=[eiy])/gu, 's').replace(/[cq]/gu, 'k')
    .replace(/z/gu, 's').replace(/dg/gu, 'j').replace(/h/gu, '');
  return (w[0] ?? '') + w.slice(1).replace(/[aeiouyw]/gu, '').replace(/(.)\1+/gu, '$1');
}
