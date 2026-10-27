import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findVerses, MEANING_CEIL, MEANING_FLOOR, meaningScore, mergeResults, type MeaningHit } from '../src/search/rank';
import { SEARCH_INDEX } from '../src/search/version';
import { EMBEDDING, indexFile, indexFiles, meaningBytes, meaningFiles, MODEL } from '../src/semantic/models';
import { floats, MeaningIndex } from '../src/semantic/vectors';
import { MEANING_COUNT, MEANING_DIMS, MEANING_FILES, MEANING_INDEX, MEANING_REDUCED, MEANING_SHARD_ROWS } from '../src/semantic/version';
import { RUNTIME } from '../src/voice/models';
import { diskChapter, loadIndex } from './search-helpers';
import { GOLDEN, GOLDEN_MEANING, GOLDEN_TOP3_THRESHOLD, MEANING_TOP3_THRESHOLD } from './search-golden';

const dir = join('public', 'meaning', MEANING_INDEX);
const read = (name: string) => readFileSync(join(dir, name));
const buffer = (bytes: Buffer) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
const keyword = loadIndex();
const shards = MEANING_FILES.filter(f => f.name.startsWith('vectors-')).map(f => new Int8Array(buffer(read(f.name))));
const meaning = new MeaningIndex(floats(buffer(read('projection.bin'))), floats(buffer(read('scales.bin'))), shards);
const fixture = JSON.parse(readFileSync(join('tests', 'fixtures', 'meaning-queries.json'), 'utf8')) as { model: string; queries: Record<string, string> };
/** The model's embedding of a golden query, computed at build time by tools/build_meaning_index.py. */
const embedded = (query: string) => {
  const encoded = fixture.queries[query];
  assert.ok(encoded, `no embedding fixture for “${query}”; rerun tools/build_meaning_index.py`);
  return floats(buffer(Buffer.from(encoded, 'base64')));
};
const id = (ordinal: number) => { const r = keyword.ref(ordinal); return `${r.book} ${r.chapter}:${r.verse}`; };
const meaningTop = (query: string, n = 3) => meaning.search(embedded(query), n).map(h => id(h.ordinal));
const mergedTop = async (query: string, n = 3) =>
  (await findVerses(query, keyword, diskChapter('webbe'), n, meaning.search(embedded(query), 12))).map(f => `${f.book} ${f.chapter}:${f.verse}`);

async function accuracy(label: string, cases: typeof GOLDEN, rank: (query: string) => Promise<string[]> | string[]): Promise<{ score: number; misses: string[] }> {
  let hits = 0;
  const misses: string[] = [];
  for (const [query, expected] of cases) {
    const found = await rank(query);
    if (found.some(f => expected.includes(f))) hits++;
    else misses.push(`${query} => ${found.join(', ')}`);
  }
  const score = hits / cases.length;
  console.log(`${label}: ${hits}/${cases.length} top-3 (${(score * 100).toFixed(1)}%)`);
  return { score, misses };
}

test('committed meaning index files match the fingerprints the app checks', () => {
  for (const file of MEANING_FILES) {
    const bytes = read(file.name);
    assert.equal(bytes.length, file.bytes, file.name);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.name);
  }
  assert.equal(MEANING_INDEX, `m1-${MEANING_FILES[0].sha256.slice(0, 16)}`);
  const meta = JSON.parse(read('meta.json').toString('utf8'));
  assert.equal(meta.format, 'verse-recall-meaning');
  assert.equal(meta.count, MEANING_COUNT);
  assert.equal(meta.count, keyword.table.refs.length);
  assert.equal(meta.searchIndex, SEARCH_INDEX, 'rebuild the meaning index after the keyword index changes');
  assert.deepEqual([meta.dims, meta.reduced, meta.shardRows], [MEANING_DIMS, MEANING_REDUCED, MEANING_SHARD_ROWS]);
  assert.equal(meta.model.repo, EMBEDDING.repo);
  assert.equal(meta.model.revision, EMBEDDING.revision);
  assert.equal(meta.model.queryPrefix, EMBEDDING.queryPrefix);
  assert.equal(meta.model.sha256, MODEL.find(f => f.url.endsWith('model_quantized.onnx'))!.sha256);
  assert.equal(meta.sources.length, 3, 'WEB British, BSB and KJV are all embedded');
  assert.equal(fixture.model, EMBEDDING.revision);
});

test('meaning search files are pinned, served with the app and of a reasonable size', () => {
  for (const file of MODEL) {
    assert.match(file.url, new RegExp(`^https://huggingface\\.co/${EMBEDDING.repo}/resolve/${EMBEDDING.revision}/`));
    assert.match(file.sha256, /^[0-9a-f]{64}$/);
  }
  const files = indexFiles('https://example.org/app/');
  assert.equal(files.length, MEANING_FILES.length);
  assert.ok(files.every(f => f.url.startsWith(`https://example.org/app/meaning/${MEANING_INDEX}/`)));
  assert.equal(indexFile('https://example.org/app/', 'scales.bin').bytes, MEANING_COUNT * 4);
  assert.deepEqual(meaningFiles('https://x.invalid/').slice(0, Object.keys(RUNTIME).length), Object.values(RUNTIME));
  const vectors = MEANING_FILES.reduce((sum, f) => sum + f.bytes, 0);
  console.log(`Meaning search: verse vectors ${(vectors / 1e6).toFixed(2)} MB, total download ${(meaningBytes() / 1e6).toFixed(1)} MB`);
  assert.ok(vectors < 10e6, 'verse vectors stay under 10 MB');
  assert.ok(meaningBytes() < 65e6);
});

test('meaning index rejects incomplete data and ranks by similarity', () => {
  const projection = meaning.projection;
  assert.throws(() => new MeaningIndex(projection.slice(1), meaning.scales, shards), /projection/);
  assert.throws(() => new MeaningIndex(projection, meaning.scales.slice(1), shards), /every verse/);
  assert.throws(() => new MeaningIndex(projection, meaning.scales, shards.slice(1)), /incomplete/);
  assert.throws(() => new MeaningIndex(projection, meaning.scales, [...shards.slice(0, -1), shards.at(-1)!.slice(MEANING_REDUCED)]), /incomplete/);
  const moved = [shards[0].slice(MEANING_REDUCED), Int8Array.from([...shards[1], ...shards[0].slice(0, MEANING_REDUCED)]), ...shards.slice(2)];
  assert.throws(() => new MeaningIndex(projection, meaning.scales, moved), /incomplete/, 'every shard must hold its own rows');
  assert.throws(() => meaning.project(new Float32Array(10)), /wrong size/);
  const hits = meaning.search(embedded('lamp for my feet'), 20);
  assert.equal(hits.length, 20);
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i - 1].similarity >= hits[i].similarity);
  assert.ok(hits[0].similarity <= 1.01 && hits[0].similarity > 0.5);
  const projected = meaning.project(embedded('lamp for my feet').map(x => x * 3));
  assert.ok(Math.abs(Math.hypot(...projected) - 1) < 1e-4, 'queries are normalised after projection');
  assert.equal(meaning.search(embedded('lamp for my feet'), 1).length, 1);
});

test('meaning scores map similarity into confidence and agree with other strategies', () => {
  assert.equal(meaningScore(MEANING_FLOOR), 0);
  assert.equal(meaningScore(MEANING_FLOOR - 0.2), 0);
  assert.equal(meaningScore(MEANING_CEIL), 1);
  assert.equal(meaningScore(1), 1);
  assert.ok(Math.abs(meaningScore((MEANING_FLOOR + MEANING_CEIL) / 2) - 0.5) < 1e-9);
  const ref = (ordinal: number) => keyword.ref(ordinal);
  const merged = mergeResults([[{ ordinal: 5, score: 0.6, strategy: 'keyword', terms: ['lamp'] }], [{ ordinal: 5, score: 0.5, strategy: 'meaning' }]], ref);
  assert.deepEqual(merged[0].strategies, ['keyword', 'meaning']);
  assert.ok(Math.abs(merged[0].confidence - 0.65) < 1e-9);
});

test('“lamp for my feet” finds Psalm 119:105 first by meaning alone and merged', async () => {
  assert.equal(meaningTop('lamp for my feet', 1)[0], 'PSA 119:105');
  const merged = await findVerses('lamp for my feet', keyword, diskChapter('webbe'), 3, meaning.search(embedded('lamp for my feet'), 12));
  assert.equal(`${merged[0].book} ${merged[0].chapter}:${merged[0].verse}`, 'PSA 119:105');
  assert.ok(merged[0].strategies.includes('meaning') && merged[0].strategies.includes('keyword'));
});

test('every golden query has an embedding fixture', () => {
  for (const [query] of [...GOLDEN, ...GOLDEN_MEANING]) assert.ok(fixture.queries[query], query);
});

test('meaning search reaches the golden thresholds alone and merged with the other strategies', async () => {
  const alone = await accuracy('Meaning only, paraphrase set', GOLDEN_MEANING, q => meaningTop(q));
  const keywordOnly = await accuracy('Keywords and references only, paraphrase set', GOLDEN_MEANING, async q =>
    (await findVerses(q, keyword, diskChapter('webbe'), 3)).map(f => `${f.book} ${f.chapter}:${f.verse}`));
  const merged = await accuracy('Merged, paraphrase set', GOLDEN_MEANING, q => mergedTop(q));
  const mergedGolden = await accuracy('Merged, main golden set', GOLDEN, q => mergedTop(q));
  const meaningGolden = await accuracy('Meaning only, main golden set', GOLDEN, q => meaningTop(q));
  assert.ok(merged.score >= MEANING_TOP3_THRESHOLD, `merged ${merged.score}\n${merged.misses.join('\n')}`);
  assert.ok(merged.score > keywordOnly.score, 'meaning search improves paraphrase results');
  assert.ok(alone.score >= MEANING_TOP3_THRESHOLD, `meaning only ${alone.score}\n${alone.misses.join('\n')}`);
  assert.ok(mergedGolden.score >= GOLDEN_TOP3_THRESHOLD, `merged golden ${mergedGolden.score}\n${mergedGolden.misses.join('\n')}`);
  assert.ok(meaningGolden.score >= 0.8, `meaning golden ${meaningGolden.score}\n${meaningGolden.misses.join('\n')}`);
});

test('meaning hits with no similarity add nothing to the ranking', async () => {
  const hits: MeaningHit[] = [{ ordinal: keyword.table.ordinal('GEN', 1, 1)!, similarity: 0.1 }];
  const found = await findVerses('qqzx', keyword, diskChapter('webbe'), 10, hits);
  assert.deepEqual(found, []);
});
