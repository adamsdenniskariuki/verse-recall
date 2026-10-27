import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOPICS } from '../src/search/topic-data';
import { matchTopic, topicHits, topicVerses } from '../src/search/topics';
import { findVerses } from '../src/search/rank';
import { diskChapter, loadIndex } from './search-helpers';

const index = loadIndex();

test('every topic reference exists and has text in WEB British, BSB and KJV', async () => {
  for (const translation of ['webbe', 'bsb', 'kjv'] as const) {
    const read = diskChapter(translation);
    for (const topic of TOPICS) for (const v of topicVerses(topic)) {
      const rows = await read(v.book, v.chapter);
      for (let verse = v.verse; verse <= (v.end ?? v.verse); verse++) {
        assert.ok(index.table.ordinal(v.book, v.chapter, verse) !== undefined, `${topic.id}: ${v.book} ${v.chapter}:${verse} not in index`);
        assert.ok(rows[String(verse)]?.trim(), `${topic.id}: ${v.book} ${v.chapter}:${verse} missing in ${translation}`);
      }
      if (v.end) assert.ok(v.end > v.verse, `${topic.id}: bad range`);
    }
  }
});

test('topics are well formed, unique and have enough verses', () => {
  assert.ok(TOPICS.length >= 25);
  assert.equal(new Set(TOPICS.map(t => t.id)).size, TOPICS.length);
  for (const topic of TOPICS) {
    const refs = topicVerses(topic).map(v => `${v.book} ${v.chapter}:${v.verse}`);
    assert.ok(refs.length >= 6, `${topic.id} has too few verses`);
    assert.equal(new Set(refs).size, refs.length, `${topic.id} repeats a verse`);
    assert.equal(topicHits(topic, index.table).length, refs.length);
  }
  assert.throws(() => topicVerses({ id: 'x', title: 'x', words: [], refs: 'John 3:16' }), /Invalid topic reference/);
});

test('topic questions are recognised in many phrasings', () => {
  const cases: [string, string][] = [
    ['verses about anxiety', 'anxiety'], ['Bible verses about worry', 'anxiety'], ['what does the Bible say about fear', 'fear'],
    ['scriptures for grief', 'grief'], ['verses on forgiveness', 'forgiveness'], ['anxiety', 'anxiety'], ['worry verses', 'anxiety'],
    ['verses about anxeity', 'anxiety'], ['when I feel lonely', 'loneliness'], ['verses for when I am tired', 'rest'],
    ['show me verses about God’s love', 'gods-love'], ['verses about forgiving others', 'forgiving-others'], ['Patience', 'patience'],
    ['bible verses about being afraid', 'fear'], ['scripture about marriage', 'marriage'], ['verses about peace', 'peace'],
  ];
  for (const [query, id] of cases) assert.equal(matchTopic(query)?.id, id, query);
});

test('remembered phrases and references are never taken as topics', () => {
  for (const query of ['the Lord is my shepherd', 'do not be anxious about anything', 'John 3:16', 'love is patient love is kind',
    'peace I leave with you', 'lamp for my feet', 'love one another', 'the love of God', '', 'verses about', 'verses about the weather in spain', 'zzzzz'])
    assert.equal(matchTopic(query), null, query);
});

test('a topic search ranks the topic list first, in order, with ranges', async () => {
  const found = await findVerses('verses about anxiety', index, diskChapter('webbe'), 10);
  assert.deepEqual(found.slice(0, 3).map(f => `${f.book} ${f.chapter}:${f.verse}`), ['PHI 4:6', '1PE 5:7', 'MAT 6:34']);
  assert.ok(found[0].strategies.includes('topic'));
  assert.equal(found[0].end, 7);
  assert.ok(found[0].confidence > found[2].confidence);
  const fear = await findVerses('what does the Bible say about fear', index, diskChapter('bsb'), 10);
  assert.equal(`${fear[0].book} ${fear[0].chapter}:${fear[0].verse}`, 'ISA 41:10');
  const plain = await findVerses('lamp for my feet', index, diskChapter('webbe'), 10);
  assert.ok(plain.every(f => !f.strategies.includes('topic')));
});
