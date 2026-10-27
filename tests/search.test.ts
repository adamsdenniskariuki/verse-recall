import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSearchIndex } from '../tools/build-search-index';
import { decodePostings, encodePostings } from '../src/search/index-format';
import { editDistance, phonetic, stem, terms } from '../src/search/normalize';
import { parseReferences } from '../src/search/reference';
import { phraseScore } from '../src/search/keyword';
import { findVerses, mergeResults, type Candidate } from '../src/search/rank';
import { highlight } from '../src/search/find';
import { SEARCH_INDEX, SEARCH_META_SHA256 } from '../src/search/version';
import { freshState, MAX_SEARCHES, rememberSearch, validState } from '../src/store';
import { confirmImport, exportBackup, parseImport, planImport } from '../src/transfer';
import { diskChapter, loadIndex } from './search-helpers';
import { GOLDEN, GOLDEN_TOP3_THRESHOLD } from './search-golden';

const index = loadIndex();
const ref = (query: string) => parseReferences(query, index.table).map(h =>
  `${h.book} ${h.chapter}:${h.verse}${h.end ? `-${h.end}` : ''}${h.chapterOnly ? ' (chapter)' : ''}`);
const top = async (query: string, n = 3, translation: 'webbe' | 'bsb' | 'kjv' = 'webbe') =>
  (await findVerses(query, index, diskChapter(translation), n)).map(f => `${f.book} ${f.chapter}:${f.verse}`);

test('reference parser reads written and spoken references', () => {
  const cases: [string, string][] = [
    ['John 3:16', 'JOH 3:16'], ['john 3 16', 'JOH 3:16'], ['Jn 3.16', 'JOH 3:16'],
    ['John three sixteen', 'JOH 3:16'], ['John chapter three verse sixteen', 'JOH 3:16'],
    ['1 Cor 13 4', '1CO 13:4'], ['1 Cor 13:4', '1CO 13:4'], ['first Corinthians thirteen verse four', '1CO 13:4'],
    ['1st Corinthians 13 4', '1CO 13:4'], ['I Corinthians 13:4', '1CO 13:4'], ['one corinthians thirteen four', '1CO 13:4'],
    ['II Timothy 3:16', '2TI 3:16'], ['second timothy three sixteen', '2TI 3:16'], ['2 Tim 3 16', '2TI 3:16'],
    ['Psalm one nineteen one oh five', 'PSA 119:105'], ['Psalm 119:105', 'PSA 119:105'], ['Ps 119 105', 'PSA 119:105'],
    ['Psalm one hundred and nineteen verse one hundred five', 'PSA 119:105'], ['psalms 23 1', 'PSA 23:1'],
    ['Romans eight twenty eight', 'ROM 8:28'], ['Rom 8:28-30', 'ROM 8:28-30'], ['Romans 8 verses 28 to 30', 'ROM 8:28-30'],
    ['Genesis one one', 'GEN 1:1'], ['Gen 1:1', 'GEN 1:1'], ['Jude 3', 'JUD 1:3'], ['3 John 4', '3JO 1:4'], ['third john four', '3JO 1:4'],
    ['song of songs 2 4', 'SOL 2:4'], ['Song of Solomon 2:4', 'SOL 2:4'], ['Philippians 4:13', 'PHI 4:13'], ['Phil 4 13', 'PHI 4:13'],
    ['phillipians 4 13', 'PHI 4:13'], ['Revelation twenty one four', 'REV 21:4'], ['Rev 21:4', 'REV 21:4'], ['Isaiah forty thirty one', 'ISA 40:31'],
    ['Matthew 6:33', 'MAT 6:33'], ['Mark 10:27', 'MAR 10:27'], ['Proverbs three five', 'PRO 3:5'], ['Hebrews eleven one', 'HEB 11:1'],
    ['Lamentations 3:22-23', 'LAM 3:22-23'], ['Ecclesiastes three one', 'ECC 3:1'], ['Joshua one nine', 'JOS 1:9'],
  ];
  for (const [query, expected] of cases) assert.equal(ref(query)[0], expected, query);
  assert.deepEqual(ref('Psalm 23'), ['PSA 23:1 (chapter)']);
  assert.deepEqual(ref('psalm xxiii'), ['PSA 23:1 (chapter)']);
});

test('reference parser ignores ordinary words and impossible verses', () => {
  for (const query of ['I love you', 'Mark my words', 'the lord is my shepherd', 'job well done', 'John 3:99', 'Jude 40', 'Psalm 151']) {
    assert.deepEqual(ref(query), [], query);
  }
  assert.equal(parseReferences('phillipians 4 13', index.table)[0].confidence < 1, true, 'fuzzy book names are less certain');
});

test('normaliser folds archaic forms, stems and sound-alikes', () => {
  assert.equal(stem('hath'), stem('has'));
  assert.equal(stem('loveth'), stem('love'));
  assert.equal(stem('believeth'), stem('believe'));
  assert.equal(stem('thee'), stem('you'));
  assert.equal(stem('thy'), stem('your'));
  assert.equal(stem('saith'), stem('says'));
  assert.deepEqual(terms('Thou shalt love the Lord thy God'), terms('you shall love the Lord your God'));
  assert.equal(editDistance('shepard', 'shepherd', 2), 2);
  assert.equal(editDistance('lord', 'lrod', 1), 1);
  assert.equal(editDistance('grace', 'faith', 2), 3);
  assert.equal(phonetic('feat'), phonetic('feet'));
  assert.equal(phonetic('lite'), phonetic('light'));
  assert.notEqual(phonetic('faith'), phonetic('feet'));
});

test('keyword search tolerates typos, mishearing and King James wording', async () => {
  assert.equal((await top('lamp unto my feat and a lite unto my path'))[0], 'PSA 119:105');
  assert.ok((await top('the lord is my shepard')).includes('PSA 23:1'));
  assert.equal((await top('thy word is a lamp unto my feet', 3, 'kjv'))[0], 'PSA 119:105');
  assert.equal((await top('he restoreth my soul', 3, 'kjv'))[0], 'PSA 23:3');
  assert.equal((await top('for god so lovd the wrld'))[0], 'JOH 3:16');
  assert.equal((await top('lamp for my feet'))[0], 'PSA 119:105');
  assert.deepEqual(await top('qwxz zzvv'), []);
});

test('phrase order rewards words that appear together', () => {
  assert.equal(phraseScore('lamp to my feet', 'Your word is a lamp to my feet'), 1);
  assert.equal(phraseScore('feet lamp', 'Your word is a lamp to my feet'), 0);
  assert.equal(phraseScore('word', 'Your word'), 0);
});

test('ranking merges strategies and rewards agreement', () => {
  const table = (o: number) => ({ book: 'JOH', chapter: 3, verse: o });
  const lists: Candidate[][] = [
    [{ ordinal: 16, score: 1, strategy: 'reference' }],
    [{ ordinal: 16, score: 0.6, strategy: 'keyword', terms: ['god'] }, { ordinal: 17, score: 0.7, strategy: 'keyword', terms: ['world'] }],
    [{ ordinal: 18, score: 0.3, strategy: 'keyword' }, { ordinal: 17, score: 0.5, strategy: 'keyword' }],
  ];
  const merged = mergeResults(lists, table);
  assert.deepEqual(merged.map(m => m.ordinal), [16, 17, 18]);
  assert.equal(merged[0].confidence, 1, 'confidence is clamped to 1');
  assert.deepEqual(merged[0].strategies, ['reference', 'keyword']);
  assert.deepEqual(merged[0].terms, ['god']);
  assert.equal(merged[1].confidence, 0.7, 'the same strategy twice keeps the best score without a bonus');
  const agreed = mergeResults([[{ ordinal: 1, score: 0.5, strategy: 'reference' }], [{ ordinal: 1, score: 0.6, strategy: 'keyword' }]], table);
  assert.ok(Math.abs(agreed[0].confidence - 0.65) < 1e-9, 'two strategies agreeing add a bonus');
  assert.equal(mergeResults(lists, table, 2).length, 2);
  const tie = mergeResults([[{ ordinal: 9, score: 0.5, strategy: 'keyword' }, { ordinal: 3, score: 0.5, strategy: 'keyword' }]], table);
  assert.deepEqual(tie.map(m => m.ordinal), [3, 9], 'ties keep Bible order');
});

test('references jump straight to the verse ahead of keyword matches', async () => {
  const found = await findVerses('John three sixteen', index, diskChapter('webbe'), 5);
  assert.equal(`${found[0].book} ${found[0].chapter}:${found[0].verse}`, 'JOH 3:16');
  assert.ok(found[0].strategies.includes('reference'));
  const range = await findVerses('Rom 8:28-30', index, diskChapter('webbe'), 5);
  assert.equal(range[0].end, 30);
});

test('golden paraphrases reach the top-3 accuracy threshold', async () => {
  assert.ok(GOLDEN.length >= 40);
  let hits = 0;
  const misses: string[] = [];
  for (const [query, expected] of GOLDEN) {
    const found = await top(query);
    if (found.some(id => expected.includes(id))) hits++;
    else misses.push(`${query} => ${found.join(', ')}`);
  }
  const score = hits / GOLDEN.length;
  console.log(`Find a verse golden set: ${hits}/${GOLDEN.length} top-3 (${(score * 100).toFixed(1)}%)`);
  assert.ok(score >= GOLDEN_TOP3_THRESHOLD, `top-3 accuracy ${score.toFixed(3)} below ${GOLDEN_TOP3_THRESHOLD}\n${misses.join('\n')}`);
});

test('highlighting marks only matched words', () => {
  const parts = highlight('Your word is a lamp to my feet, and a light for my path.', [stem('lamp'), stem('feet')]);
  assert.deepEqual(parts.filter(p => p.mark).map(p => p.text), ['lamp', 'feet']);
  assert.equal(parts.map(p => p.text).join(''), 'Your word is a lamp to my feet, and a light for my path.');
  assert.deepEqual(highlight('Jesus wept.', []), [{ text: 'Jesus wept.', mark: false }]);
});

test('postings round-trip and the committed index matches the Bible text', () => {
  const lengths = Uint8Array.from([2, 1, 0, 3]);
  const decoded = decodePostings(encodePostings([[0, 3], [1, 2, 3], [3]], lengths), 4, 3);
  assert.deepEqual([...decoded.lengths], [...lengths]);
  assert.deepEqual(decoded.lists.map(l => [...l]), [[0, 3], [1, 2, 3], [3]]);
  const built = buildSearchIndex();
  assert.equal(built.id, SEARCH_INDEX, 'run npm run build:search after changing the normaliser or Bible text');
  assert.equal(built.metaSha256, SEARCH_META_SHA256);
  const dir = join('public', 'search', SEARCH_INDEX);
  assert.equal(createHash('sha256').update(readFileSync(join(dir, 'meta.json'))).digest('hex'), SEARCH_META_SHA256);
  assert.equal(createHash('sha256').update(readFileSync(join(dir, 'postings.bin'))).digest('hex'),
    (JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as { postingsSha256: string }).postingsSha256);
  assert.deepEqual(index.table.refs[0], { book: 'GEN', chapter: 1, verse: 1 });
});

test('search history is bounded, validated and kept in backups', async () => {
  let history: string[] = [];
  for (let i = 0; i < 25; i++) history = rememberSearch(history, `query ${i}`);
  assert.equal(history.length, MAX_SEARCHES);
  assert.equal(history[0], 'query 24');
  history = rememberSearch(history, '  query   10 ');
  assert.equal(history[0], 'query 10');
  assert.equal(history.filter(q => q === 'query 10').length, 1);
  assert.deepEqual(rememberSearch(['a'], '   '), ['a']);
  assert.equal(rememberSearch([], 'x'.repeat(300))[0].length, 200);

  const state = freshState();
  assert.ok(validState(state), 'saves without history stay valid');
  assert.ok(validState({ ...state, searches: ['lamp for my feet'] }));
  for (const bad of [['', 'x'], ['dup', 'dup'], [' padded'], [42], 'text', Array.from({ length: 21 }, (_, i) => `q${i}`), ['x'.repeat(201)]]) {
    assert.equal(validState({ ...state, searches: bad }), false, JSON.stringify(bad).slice(0, 40));
  }

  const withHistory = { ...freshState(), searches: ['grace', 'peace'] };
  const raw = exportBackup(withHistory, new Date('2026-09-21T00:00:00Z'));
  assert.ok(raw.includes('"searches"'));
  const current = { ...freshState(), searches: ['peace', 'hope'] };
  const merged = confirmImport(current, planImport(current, await parseImport(raw)));
  assert.deepEqual(merged.searches, ['peace', 'hope', 'grace']);
  const old = exportBackup(freshState(), new Date('2026-09-21T00:00:00Z'));
  assert.ok(!old.includes('searches'), 'backups without history keep their old shape');
  const kept = confirmImport(current, planImport(current, await parseImport(old)));
  assert.deepEqual(kept.searches, ['peace', 'hope']);
});
