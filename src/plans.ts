import { bibleSelectionKey, type BibleSelection, type BibleTranslation } from './bible-catalog';
import { BIBLE_SNAPSHOT } from './bible-version';
import type { Progress } from './engine';

export interface PlanVerse { book: string; chapter: number; start: number; end: number; reference: string }
export interface Plan { id: string; title: string; summary: string; cadence: string; verses: PlanVerse[] }

/** Book names exactly as they appear in the verified Bible manifest. */
export const PLAN_BOOKS: Record<string, string> = {
  GEN: 'Genesis', NUM: 'Numbers', DEU: 'Deuteronomy', JOS: 'Joshua', PSA: 'Psalm', PRO: 'Proverbs',
  ISA: 'Isaiah', JER: 'Jeremiah', LAM: 'Lamentations', MIC: 'Micah', ZEP: 'Zephaniah',
  MAT: 'Matthew', MAR: 'Mark', LUK: 'Luke', JOH: 'John', ACT: 'Acts', ROM: 'Romans',
  '1CO': '1 Corinthians', '2CO': '2 Corinthians', GAL: 'Galatians', EPH: 'Ephesians', PHI: 'Philippians',
  COL: 'Colossians', '1TH': '1 Thessalonians', '2TI': '2 Timothy', HEB: 'Hebrews', JAM: 'James',
  '1PE': '1 Peter', '1JO': '1 John', REV: 'Revelation',
};

function verse(ref: string): PlanVerse {
  const match = /^([1-3]?[A-Z]{2,3}) (\d+):(\d+)(?:-(\d+))?$/u.exec(ref);
  if (!match || !PLAN_BOOKS[match[1]]) throw new Error(`Invalid plan reference ${ref}`);
  const [, book, chapter, start, end = start] = match;
  return {
    book, chapter: Number(chapter), start: Number(start), end: Number(end),
    reference: `${PLAN_BOOKS[book]} ${chapter}:${start}${end !== start ? `–${end}` : ''}`,
  };
}
const list = (refs: string) => refs.split(';').map(ref => verse(ref.trim()));

export const plans: readonly Plan[] = [
  { id: 'foundations', title: 'Foundations', cadence: '10 verses · about two weeks',
    summary: 'Ten short, well-loved verses to begin with: grace, trust, courage and a lamp for the path.',
    verses: list('JOH 3:16; ROM 3:23; EPH 2:8-9; 2CO 5:17; PRO 3:5-6; JOS 1:9; ROM 8:28; PHI 4:13; PSA 119:105; 1JO 1:9') },
  { id: 'psalm-23', title: 'Psalm 23', cadence: '4 steps · the whole psalm',
    summary: 'The shepherd psalm, learned two verses at a time and then held together as one.',
    verses: list('PSA 23:1-2; PSA 23:3-4; PSA 23:5-6; PSA 23:1-6') },
  { id: 'romans-road', title: 'The Romans Road', cadence: '8 verses',
    summary: 'A path through Romans that tells the good news simply: our need, God’s gift and peace with him.',
    verses: list('ROM 3:23; ROM 3:10-12; ROM 6:23; ROM 5:8; ROM 10:9-10; ROM 10:13; ROM 5:1; ROM 8:1') },
  { id: 'beatitudes', title: 'The Beatitudes', cadence: '3 passages',
    summary: 'Jesus’ blessings from the Sermon on the Mount, in three gentle parts.',
    verses: list('MAT 5:3-6; MAT 5:7-10; MAT 5:11-12') },
  { id: 'lords-prayer', title: 'The Lord’s Prayer', cadence: '3 steps',
    summary: 'The prayer Jesus taught, in two halves and then whole.',
    verses: list('MAT 6:9-10; MAT 6:11-13; MAT 6:9-13') },
  { id: 'fruit-of-the-spirit', title: 'Fruit of the Spirit', cadence: '3 passages',
    summary: 'Walking by the Spirit, and the fruit he grows: love, joy, peace and more.',
    verses: list('GAL 5:16; GAL 5:22-23; GAL 5:24-25') },
  { id: 'armour-of-god', title: 'The Armour of God', cadence: '3 passages',
    summary: 'Standing firm in God’s strength, piece by piece, ending in prayer.',
    verses: list('EPH 6:10-12; EPH 6:13-15; EPH 6:16-18') },
  { id: 'peace', title: 'Comfort for anxious days', cadence: '12 verses',
    summary: 'Words to carry when you are weary, worried or grieving: comfort, rest and peace.',
    verses: list('PHI 4:6-7; 1PE 5:7; MAT 11:28-30; JOH 14:27; ISA 41:10; PSA 46:1; PSA 34:18; ISA 26:3; MAT 6:34; 2CO 1:3-4; PSA 55:22; JOH 16:33') },
  { id: 'promises', title: 'Promises to stand on', cadence: '12 verses',
    summary: 'God’s faithfulness, presence and care, for the days you need reminding.',
    verses: list('LAM 3:22-23; DEU 31:8; ISA 43:2; HEB 13:5; JAM 1:5; PHI 1:6; 2CO 12:9; REV 21:4; MAT 7:7; ROM 8:38-39; JER 29:11; ISA 40:31') },
  { id: 'year', title: 'A verse a week', cadence: '52 verses · one year',
    summary: 'One verse each week for a year, from Genesis to 1 John. Go at your own pace.',
    verses: list([
      'GEN 1:1; DEU 6:4-5; JOS 1:9; NUM 6:24-26; PSA 19:14; PSA 27:1; PSA 46:10; PSA 51:10; PSA 103:12; PSA 118:24',
      'PSA 139:14; PRO 3:5-6; PRO 18:10; ISA 9:6; ISA 40:31; ISA 53:5; JER 29:11; MIC 6:8; ZEP 3:17; LAM 3:22-23',
      'MAT 5:14; MAT 5:16; MAT 6:33; MAT 22:37-39; MAT 28:19-20; MAR 10:45; LUK 6:31; JOH 1:1; JOH 1:14; JOH 3:16',
      'JOH 8:12; JOH 10:10; JOH 11:25; JOH 13:34-35; JOH 14:6; JOH 15:5; ACT 1:8; ROM 8:28; ROM 12:1-2; ROM 12:12',
      'ROM 15:13; 1CO 10:13; 2CO 5:17; GAL 2:20; EPH 2:10; EPH 4:32; PHI 4:8; COL 3:23; 1TH 5:16-18; 2TI 1:7',
      'HEB 11:1; 1JO 4:19',
    ].join('; ')) },
];

export const planSelection = (v: PlanVerse, translation: BibleTranslation): BibleSelection =>
  ({ snapshot: BIBLE_SNAPSHOT, translation, book: v.book, chapter: v.chapter, start: v.start, end: v.end });
export const planVerseKey = (v: PlanVerse, translation: BibleTranslation) => bibleSelectionKey(planSelection(v, translation));
/** Plans use the chosen Bible; a personal collection falls back to WEB British. */
export const planTranslation = (translation: string): BibleTranslation => translation === 'bsb' ? 'bsb' : 'webbe';

export interface PlanProgress { total: number; started: number; kept: number; next: number | null }
/** Started means practised at least once; kept means recalled exactly without help at least once. */
export function planProgress(plan: Plan, translation: BibleTranslation, progress: Record<string, Progress>): PlanProgress {
  const rows = plan.verses.map(v => progress[planVerseKey(v, translation)]);
  const next = rows.findIndex(row => !row || row.unaided < 1);
  return {
    total: rows.length, started: rows.filter(Boolean).length,
    kept: rows.filter(row => row && row.unaided >= 1).length, next: next === -1 ? null : next,
  };
}

export const dayNumber = (date: Date) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
/** Every distinct plan passage, in plan order, for the verse of the day. */
export const dailyPool: readonly PlanVerse[] = [...new Map(plans.flatMap(p => p.verses)
  .filter(v => v.end - v.start < 3).map(v => [`${v.book} ${v.chapter}:${v.start}-${v.end}`, v])).values()];
const stride = [7, 11, 13, 17, 19].find(n => dailyPool.length % n !== 0)!;
/** Same verse all day for everyone, stepping through the pool so neighbouring days differ in theme. */
export const verseOfTheDay = (date: Date): PlanVerse => dailyPool[(dayNumber(date) * stride) % dailyPool.length];
