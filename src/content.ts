export type Translation = 'webbe' | 'bsb' | 'personal';
export type Testament = 'OT' | 'NT';
export type Filter = Testament | 'both';

export interface Passage {
  id: string;
  translation: Translation;
  edition: string;
  reference: string;
  testament: Testament;
  title: string;
  text: string;
  source: string;
  personal?: PersonalVerse;
  mapping: {
    scheme: string;
    book: string;
    chapter: number;
    verses: number[];
  };
}

export interface PersonalVerse {
  id: string;
  revision: string;
  reference: string;
  text: string;
  translationLabel: string;
  edition: string;
  testament: Testament;
}
export type VerseInput = Omit<PersonalVerse, 'id' | 'revision'>;

export const editions = {
  webbe: {
    name: 'World English Bible British Edition',
    short: 'WEB British',
    edition: '2020-stable-2026-09-12',
    description: '2020 stable text; official source files dated 12 September 2026.',
    rights: 'Public domain. World English Bible is a trademark. Exercises are learning activities, not a modified Bible translation.',
    rightsUrl: 'https://ebible.org/eng-webbe/copyright.htm',
    attribution: 'World English Bible British Edition, eBible.org.',
  },
  bsb: {
    name: 'Berean Standard Bible',
    short: 'BSB',
    edition: 'official-text-snapshot-2026-09-20',
    description: 'Official plain-text download retrieved 20 September 2026; snapshot date is not a publisher edition number.',
    rights: 'Dedicated to the public domain under CC0 on 30 April 2023. Exercises are learning activities; source text is kept intact.',
    rightsUrl: 'https://berean.bible/terms.htm',
    attribution: 'The Holy Bible, Berean Standard Bible, BSB is produced in cooperation with Bible Hub, Discovery Bible, unfoldingWord, Bible Aquifer, OpenBible.com, and the Berean Bible Translation Committee.',
  },
} as const;

// Each translation maps explicitly to its own source numbering. A future provider
// may return multiple source verses for one curated passage, or no equivalent.
export const passages: readonly Passage[] = [
  {
    id: 'word-in-heart', translation: 'webbe', edition: editions.webbe.edition,
    reference: 'Psalm 119:11', testament: 'OT', title: 'A place in your heart',
    text: 'I have hidden your word in my heart,\nthat I might not sin against you.',
    source: 'https://ebible.org/eng-webbe/PSA119.htm',
    mapping: { scheme: 'eng-webbe', book: 'PSA', chapter: 119, verses: [11] },
  },
  {
    id: 'day-and-night', translation: 'webbe', edition: editions.webbe.edition,
    reference: 'Joshua 1:8', testament: 'OT', title: 'Day and night',
    text: 'This book of the law shall not depart from your mouth, but you shall meditate on it day and night, that you may observe to do according to all that is written in it; for then you shall make your way prosperous, and then you shall have good success.',
    source: 'https://ebible.org/eng-webbe/JOS01.htm',
    mapping: { scheme: 'eng-webbe', book: 'JOS', chapter: 1, verses: [8] },
  },
  {
    id: 'peace-with-you', translation: 'webbe', edition: editions.webbe.edition,
    reference: 'John 14:27', testament: 'NT', title: 'Peace to carry with you',
    text: 'Peace I leave with you. My peace I give to you; not as the world gives, I give to you. Don’t let your heart be troubled, neither let it be fearful.',
    source: 'https://ebible.org/eng-webbe/JHN14.htm',
    mapping: { scheme: 'eng-webbe', book: 'JHN', chapter: 14, verses: [27] },
  },
  {
    id: 'word-in-heart', translation: 'bsb', edition: editions.bsb.edition,
    reference: 'Psalm 119:11', testament: 'OT', title: 'A place in your heart',
    text: 'I have hidden Your word in my heart that I might not sin against You.',
    source: 'https://bereanbible.com/bsb.txt',
    mapping: { scheme: 'bsb', book: 'Psalm', chapter: 119, verses: [11] },
  },
  {
    id: 'day-and-night', translation: 'bsb', edition: editions.bsb.edition,
    reference: 'Joshua 1:8', testament: 'OT', title: 'Day and night',
    text: 'This Book of the Law must not depart from your mouth; meditate on it day and night, so that you may be careful to do everything written in it. For then you will prosper and succeed in all you do.',
    source: 'https://bereanbible.com/bsb.txt',
    mapping: { scheme: 'bsb', book: 'Joshua', chapter: 1, verses: [8] },
  },
  {
    id: 'peace-with-you', translation: 'bsb', edition: editions.bsb.edition,
    reference: 'John 14:27', testament: 'NT', title: 'Peace to carry with you',
    text: 'Peace I leave with you; My peace I give to you. I do not give to you as the world gives. Do not let your hearts be troubled; do not be afraid.',
    source: 'https://bereanbible.com/bsb.txt',
    mapping: { scheme: 'bsb', book: 'John', chapter: 14, verses: [27] },
  },
];

export function passageKey(p: Passage): string {
  if (p.personal) return `personal:${p.personal.id}:${p.personal.revision}`;
  return `${p.id}:${p.translation}:${p.edition}`;
}

export function personalPassage(verse: PersonalVerse): Passage {
  return {
    id: verse.id, translation: 'personal', edition: verse.edition,
    reference: verse.reference, testament: verse.testament, title: 'Personal passage · not independently verified',
    text: verse.text, source: '', personal: verse,
    mapping: { scheme: 'user-supplied-reference', book: verse.reference, chapter: 0, verses: [] },
  };
}
export const translationName = (p: Passage): string =>
  p.personal?.translationLabel ?? (p.translation === 'personal' ? 'Personal verses' : editions[p.translation].short);
export const collectionName = (translation: Translation): string =>
  translation === 'personal' ? 'Personal verses' : editions[translation].short;

export interface ContentProvider {
  list(translation: Translation, filter: Filter): readonly Passage[];
  get(key: string): Passage | undefined;
}

export function createProvider(personal: readonly PersonalVerse[] = []): ContentProvider {
  const all = [...passages, ...personal.map(personalPassage)];
  return {
    list: (translation, filter) => all.filter(p =>
      p.translation === translation && (filter === 'both' || p.testament === filter)),
    get: key => all.find(p => passageKey(p) === key),
  };
}
export const localProvider = createProvider();
