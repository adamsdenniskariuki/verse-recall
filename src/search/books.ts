/** Book names, abbreviations and spoken forms for reference parsing. */
const SINGLE: Record<string, string[]> = {
  GEN: ['genesis', 'gen', 'gn'], EXO: ['exodus', 'exod', 'exo'], LEV: ['leviticus', 'lev', 'lv'],
  NUM: ['numbers', 'num', 'nm'], DEU: ['deuteronomy', 'deut', 'dt', 'deu'], JOS: ['joshua', 'josh', 'jos'],
  JDG: ['judges', 'judg', 'jdg'], RUT: ['ruth', 'rth'], EZR: ['ezra', 'ezr'], NEH: ['nehemiah', 'neh'],
  EST: ['esther', 'esth', 'est'], JOB: ['job'], PSA: ['psalm', 'psalms', 'ps', 'psa', 'pss', 'psalter'],
  PRO: ['proverbs', 'proverb', 'prov', 'prv'], ECC: ['ecclesiastes', 'eccl', 'eccles', 'ecc', 'qoheleth'],
  SOL: ['song of solomon', 'song of songs', 'songs of solomon', 'song', 'canticles', 'sos'],
  ISA: ['isaiah', 'isa'], JER: ['jeremiah', 'jer'], LAM: ['lamentations', 'lam'],
  EZE: ['ezekiel', 'ezek', 'eze', 'ezk'], DAN: ['daniel', 'dan', 'dn'], HOS: ['hosea', 'hos'], JOE: ['joel'],
  AMO: ['amos', 'amo'], OBA: ['obadiah', 'obad', 'oba'], JON: ['jonah', 'jon'], MIC: ['micah', 'mic'],
  NAH: ['nahum', 'nah'], HAB: ['habakkuk', 'hab'], ZEP: ['zephaniah', 'zeph', 'zep'], HAG: ['haggai', 'hag'],
  ZEC: ['zechariah', 'zech', 'zec'], MAL: ['malachi', 'mal'],
  MAT: ['matthew', 'matt', 'mt', 'mat'], MAR: ['mark', 'mk', 'mrk'], LUK: ['luke', 'lk', 'luk'],
  JOH: ['john', 'jn', 'jhn', 'joh'], ACT: ['acts', 'act', 'acts of the apostles'], ROM: ['romans', 'rom', 'rm'],
  GAL: ['galatians', 'gal'], EPH: ['ephesians', 'eph'], PHI: ['philippians', 'phil', 'php'],
  COL: ['colossians', 'col'], TIT: ['titus', 'tit'], PHM: ['philemon', 'philem', 'phm'],
  HEB: ['hebrews', 'heb'], JAM: ['james', 'jas', 'jm'], JUD: ['jude', 'jud'],
  REV: ['revelation', 'revelations', 'rev', 'apocalypse'],
};
const NUMBERED: Record<string, [string, number[], string[]]> = {
  SA: ['samuel', [1, 2], ['sam', 'sa', 'sm']], KI: ['kings', [1, 2], ['kgs', 'ki', 'king']],
  CH: ['chronicles', [1, 2], ['chron', 'chr', 'ch']], CO: ['corinthians', [1, 2], ['cor', 'co']],
  TH: ['thessalonians', [1, 2], ['thess', 'thes', 'th']], TI: ['timothy', [1, 2], ['tim', 'ti']],
  PE: ['peter', [1, 2], ['pet', 'pe', 'pt']], JO: ['john', [1, 2, 3], ['jn', 'jhn', 'joh']],
};
export const ORDINALS: Record<number, string[]> = {
  1: ['1', 'i', 'first', '1st', 'one'], 2: ['2', 'ii', 'second', '2nd', 'two'], 3: ['3', 'iii', 'third', '3rd', 'three'],
};
/** Maps a space-separated alias to its book id. Longest aliases are tried first by the parser. */
export const BOOK_ALIASES = new Map<string, string>();
/** Full book names, which also get typo-tolerant matching. */
export const BOOK_NAMES = new Map<string, string>();
for (const [id, names] of Object.entries(SINGLE)) {
  for (const name of names) BOOK_ALIASES.set(name, id);
  BOOK_NAMES.set(names[0], id);
}
for (const [suffix, [name, numbers, short]] of Object.entries(NUMBERED)) {
  for (const n of numbers) {
    const id = `${n}${suffix}`;
    for (const prefix of ORDINALS[n]) {
      for (const alias of [name, ...short]) BOOK_ALIASES.set(`${prefix} ${alias}`, id);
      BOOK_ALIASES.set(`${prefix}${short[0]}`, id);
    }
    BOOK_NAMES.set(`${n} ${name}`, id);
  }
}
export const MAX_ALIAS_WORDS = Math.max(...[...BOOK_ALIASES.keys()].map(a => a.split(' ').length));
