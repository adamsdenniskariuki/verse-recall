import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inOrder, LiveDetector } from '../src/live/detect';
import { terms } from '../src/search/normalize';
import { diskChapter, loadIndex } from './search-helpers';

const index = loadIndex();
const detector = () => new LiveDetector(index, [diskChapter('webbe'), diskChapter('bsb'), diskChapter('kjv')]);
const names = (found: { book: string; chapter: number; verse: number; how: string }[]) => found.map(f => `${f.book} ${f.chapter}:${f.verse} ${f.how}`);

async function feed(segments: string[]) {
  const live = detector();
  const all = [];
  for (const [i, segment] of segments.entries()) all.push(...await live.add(segment, i * 8));
  return all;
}

test('a sermon transcript yields the quoted and referenced verses, once each', async () => {
  const found = await feed([
    'good morning church it is lovely to see you all this morning',
    'we all know the verse for God so loved the world that he gave his one and only son',
    'that whoever believes in him should not perish and if you turn with me to Romans eight twenty-eight',
    'we know that all things work together for good for those who love God',
    'and as the psalmist says the Lord is my shepherd I shall not want',
    'so let us remember for God so loved the world and Romans 8:28 again this week',
  ]);
  const shown = names(found);
  assert.ok(shown.includes('JOH 3:16 quote'), shown.join(', '));
  assert.ok(shown.includes('ROM 8:28 reference'), shown.join(', '));
  assert.ok(shown.includes('PSA 23:1 quote'), shown.join(', '));
  assert.equal(new Set(found.map(f => f.ordinal)).size, found.length, 'each verse is reported once');
  assert.ok(found.length <= 4, `unexpected extra detections: ${shown.join(', ')}`);
  const rom = found.find(f => f.book === 'ROM')!;
  assert.equal(rom.at, 16);
  assert.ok(rom.heard.length <= 100);
});

test('ordinary chatter detects nothing', async () => {
  const found = await feed([
    'thanks for coming everyone the coffee is in the hall after the service',
    'the children will meet upstairs and there is parking at the back',
    'next week we have a shared lunch so please bring something to share and sign up by Thursday',
    'we are grateful for all the volunteers who make this happen',
  ]);
  assert.deepEqual(names(found), []);
});

test('references and quotes split across segments are found', async () => {
  const ref = await feed(['please turn to First Corinthians', 'thirteen verse four']);
  assert.deepEqual(names(ref), ['1CO 13:4 reference']);
  const quote = await feed(['your word is a lamp', 'to my feet and a light to my path']);
  assert.deepEqual(names(quote), ['PSA 119:105 quote']);
});

test('KJV wording, ranges and spoken references are detected', async () => {
  const found = await feed(['thy word is a lamp unto my feet and a light unto my path', 'read John three sixteen to eighteen with me']);
  assert.deepEqual(names(found), ['PSA 119:105 quote', 'JOH 3:16 reference']);
  assert.equal(found[1].end, 18);
});

test('chapter-only and fuzzy book names are not reported, and reset clears what was seen', async () => {
  const live = detector();
  assert.deepEqual(await live.add('we are in Romans eight today', 0), []);
  assert.deepEqual(await live.add('', 1), []);
  assert.deepEqual(names(await live.add('Romans 8:1', 2)), ['ROM 8:1 reference']);
  assert.deepEqual(await live.add('Romans 8:1', 3), []);
  live.reset();
  assert.deepEqual(names(await live.add('Romans 8:1', 4)), ['ROM 8:1 reference']);
  assert.deepEqual(names(await feed(['Romens 8:1'])), []);
});

test('wording repeated across the Bible is one detection, not many', async () => {
  const found = await feed(['the grace of our Lord Jesus Christ be with you all', 'the grace of our Lord Jesus Christ be with you all amen']);
  assert.equal(found.length, 1, names(found).join(', '));
  assert.equal(found[0].how, 'quote');
});

test('in-order matching tolerates small mishearings but not shuffled words', () => {
  const verse = terms('Your word is a lamp to my feet, and a light for my path.');
  assert.equal(inOrder(terms('your word is a lamp to my feet and a light for my path'), verse), verse.length);
  assert.equal(inOrder(terms('your wurd is a lamb to my feat and a lite for my path'), verse), verse.length);
  assert.ok(inOrder(terms('path light feet lamp word'), verse) <= 2);
  assert.equal(inOrder([], verse), 0);
});
