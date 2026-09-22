import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProvider, editions, passages, passageKey, personalPassage, localProvider, type VerseInput } from '../src/content';
import { activeIndices, bankCorrect, compareRecall, finish, hint, nextStage, placeToken, shuffled, startRun, words } from '../src/engine';
import { dueReviews, freshState, LEGACY_STORAGE_KEY, loadState, saveState, STORAGE_KEY, updatePreferences, validState, type StoragePort } from '../src/store';
import { makePersonal, MAX_JSON_BYTES } from '../src/personal';
import { confirmImport, exportBackup, parseImport, planImport } from '../src/transfer';
import { createHash } from 'node:crypto';
import { BIBLE_MANIFEST_SHA256, BIBLE_SNAPSHOT } from '../src/bible-version';
import { loadBibleManifest, resolveBibleSelection, selectedBiblePassages, type BibleSelection } from '../src/bible-catalog';

const p = passages[0];
const memory = (): StoragePort & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
};

test('official source fidelity', () => {
  const receipts = JSON.parse(readFileSync(new URL('../sources/official-verses.json', import.meta.url), 'utf8')) as Record<string, { text: string; url: string }>;
  assert.equal(passages.length, 6);
  assert.equal(new Set(passages.map(passageKey)).size, 6);
  assert.equal(new Set(passages.map(p => p.id)).size, 3);
  for (const passage of passages) {
    assert.equal(passage.text.replace(/\s+/gu, ' '), receipts[passageKey(passage)].text);
    assert.equal(passage.source, receipts[passageKey(passage)].url);
    assert.notEqual(passage.translation, 'personal');
    if (passage.translation !== 'personal') assert.equal(passage.edition, editions[passage.translation].edition);
    assert.ok(passage.mapping.scheme && passage.mapping.verses.length);
  }
  assert.deepEqual(localProvider.list('bsb', 'NT').map(p => p.reference), ['John 14:27']);
  assert.equal(localProvider.list('webbe', 'both').length, 3);
});

test('recall normalization', () => {
  assert.equal(compareRecall('Don’t let your heart be troubled.', "  DON'T \nlet YOUR heart be troubled ").exact, true);
  assert.equal(compareRecall('Don’t be afraid.', "'Don't be afraid.'").exact, true);
  assert.equal(compareRecall('Do not be afraid.', 'Do be not afraid').exact, false);
  assert.equal(compareRecall('I have hidden', '').correct, 0);
});

test('recall alignment feedback', () => {
  const result = compareRecall('I have hidden your word', 'I had hidden word extra');
  assert.equal(result.exact, false);
  assert.equal(result.correct, 3);
  assert.deepEqual(result.differences.filter(d => d.kind !== 'correct'), [
    { kind: 'incorrect', expected: 'have', actual: 'had' },
    { kind: 'missing', expected: 'your' },
    { kind: 'extra', actual: 'extra' },
  ]);
});

test('bank interchangeability and placement', () => {
  let run = { ...startRun(p), stage: 'arrange' as const };
  const tokens = words(p.text);
  run.slots = tokens.map((_, i) => i);
  [run.slots[0], run.slots[9]] = [run.slots[9], run.slots[0]];
  assert.equal(bankCorrect(p, run), true);
  run.slots[2] = null;
  assert.equal(bankCorrect(p, run), false);
  assert.equal(placeToken(p, run, 4, 2), run, 'cannot reuse a token');
  const placed = placeToken(p, run, 2, 2);
  assert.equal(bankCorrect(p, placed), true);
  assert.equal(run.slots[2], null, 'placement does not mutate input');
  assert.equal(placeToken(p, run, 200, 2), run);
  for (const random of [() => 0, () => .9999]) {
    const order = shuffled(12, random);
    assert.equal(new Set(order).size, 12);
    assert.notDeepEqual(order, Array.from({ length: 12 }, (_, i) => i));
  }
});

test('learning stages and recorded hints', () => {
  let run = startRun(p);
  run = nextStage(p, run);
  assert.equal(run.stage, 'fill');
  assert.equal(nextStage(p, run).stage, 'fill');
  run = hint(p, run);
  assert.equal(run.hints, 1);
  assert.equal(run.slots[activeIndices(p, 'fill')[0]], activeIndices(p, 'fill')[0]);
  for (const i of activeIndices(p, 'fill')) run.slots[i] = i;
  run = nextStage(p, run);
  assert.equal(run.stage, 'arrange');
  assert.ok(run.slots.every(i => i === null));
  run.slots = words(p.text).map((_, i) => i);
  run = nextStage(p, run);
  assert.equal(run.stage, 'recall');
  assert.equal(run.bankCompleted, true);
  const revealed = hint(p, run);
  assert.equal(revealed.exposed, true);
  assert.equal(revealed.hints, 2);
});

test('honest recall scheduling', () => {
  const now = 1_000_000;
  const run = { ...startRun(p, 'review'), answer: p.text };
  const first = finish(p, run, undefined, now);
  assert.equal(first.lastResult, 'unaided');
  assert.equal(first.due, now + 86_400_000);
  const second = finish(p, run, first, now);
  assert.equal(second.due, now + 3 * 86_400_000);
  assert.equal(second.unaided, 2);
  const assisted = finish(p, { ...run, hints: 1 }, second, now);
  assert.equal(assisted.lastResult, 'assisted');
  assert.equal(assisted.unaided, 2);
  assert.equal(assisted.streak, 0);
  assert.equal(assisted.due, now + 600_000);
  assert.equal(finish(p, { ...run, exposed: true }, undefined, now).unaided, 0);
  assert.equal(finish(p, { ...run, answer: 'wrong' }, first, now).lastResult, 'practice');
  assert.notEqual(passageKey(p), passageKey({ ...p, translation: 'bsb' }));
  assert.notEqual(passageKey(p), passageKey({ ...p, edition: 'new-edition' }));
});

test('save validation and recovery', async () => {
  const store = memory();
  const state = freshState();
  state.run = startRun(p);
  assert.equal(saveState(store, state), null);
  assert.deepEqual((await loadState(store)).state, state);
  for (const value of [
    { ...state, version: 3 },
    { ...state, preferences: { ...state.preferences, colour: 'purple' } },
    { ...state, run: { ...state.run, order: [0, 0] } },
    { ...state, run: { ...state.run, hints: -1 } },
    { ...state, run: { ...state.run, key: 'unknown' } },
    { ...state, progress: { unknown: {} } },
  ]) assert.equal(validState(value), false);
  const progress = finish(p, startRun(p, 'review'), undefined, 100);
  assert.equal(validState({ ...state, progress: { [progress.key]: { ...progress, due: Number.MAX_SAFE_INTEGER } } }), false);
  store.setItem(STORAGE_KEY, '{"broken":');
  assert.ok((await loadState(store)).error);
  assert.equal(store.getItem(STORAGE_KEY), '{"broken":');
  const failing: StoragePort = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  assert.ok((await loadState(failing)).error);
  assert.match(saveState(failing, state)!, /Saving is unavailable/);
});

test('preferences preserve exercise and persist', async () => {
  const store = memory();
  let state = freshState();
  state.run = { ...startRun(p, 'review'), answer: 'I have hidden' };
  const original = structuredClone(state.run);
  for (const preset of ['calm', 'study', 'focus'] as const) {
    for (const colour of ['light', 'dark', 'system'] as const) {
      state = updatePreferences(state, { preset, colour, translation: 'bsb', filter: 'NT' });
      assert.deepEqual(state.run, original);
      assert.equal(saveState(store, state), null);
      assert.deepEqual((await loadState(store)).state, state);
    }
  }
});

test('review queue survives content filters', () => {
  let state = freshState();
  const first = finish(p, { ...startRun(p, 'review'), answer: 'incomplete' }, undefined, 100);
  state.progress[first.key] = first;
  state = updatePreferences(state, { translation: 'bsb', filter: 'NT' });
  assert.equal(dueReviews(state, first.due - 1).length, 0);
  assert.deepEqual(dueReviews(state, first.due), [first]);
  assert.equal(state.progress[passageKey(passages[3])], undefined);
});

const sample: VerseInput = {
  reference: 'Practice sample 1', text: 'Keep these original words close.',
  translationLabel: 'Original practice text', edition: 'Personal edition 1', testament: 'NT',
};
const bulk = (verses: unknown[]) => JSON.stringify({ format: 'wordkeep-verses', version: 1, verses });

test('legacy saves migrate without overwriting originals', async () => {
  const storage = memory();
  const progress = finish(p, { ...startRun(p, 'review'), answer: p.text }, undefined, 1000);
  const legacy = {
    version: 1, preferences: { translation: 'webbe', filter: 'OT', preset: 'study', colour: 'dark' },
    progress: { [progress.key]: progress }, run: { ...startRun(p, 'review'), answer: 'I have hidden', hints: 1, exposed: true },
  };
  const raw = JSON.stringify(legacy);
  storage.setItem(LEGACY_STORAGE_KEY, raw);
  const loaded = await loadState(storage);
  assert.equal(loaded.error, null);
  assert.equal(loaded.migrated, true);
  assert.equal(loaded.state.version, 2);
  assert.equal(loaded.state.preferences.accent, 'purple');
  assert.equal(loaded.state.preferences.font, 'mono');
  assert.deepEqual(loaded.state.run, legacy.run);
  assert.deepEqual(loaded.state.progress, legacy.progress);
  assert.equal(saveState(storage, loaded.state), null);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), raw);
  storage.setItem(STORAGE_KEY, '{bad v2');
  assert.ok((await loadState(storage)).error, 'never fall back silently to a legacy save');
  assert.equal(storage.getItem(STORAGE_KEY), '{bad v2');
});

test('personal content identity and playable filters', async () => {
  const verse = await makePersonal(sample);
  const same = await makePersonal(sample, verse.id);
  assert.deepEqual(same, verse);
  const changed = await makePersonal({ ...sample, edition: 'Personal edition 2' }, verse.id);
  assert.notEqual(verse.revision, changed.revision);
  const source = personalPassage(verse);
  const provider = createProvider([verse]);
  assert.equal(provider.list('personal', 'OT').length, 0);
  assert.equal(provider.list('personal', 'NT')[0].text, sample.text);
  assert.equal(provider.list('webbe', 'both').length, 3);
  assert.equal(provider.get(passageKey(source))?.personal?.id, verse.id);
  let run = nextStage(source, startRun(source));
  assert.equal(run.stage, 'fill');
  for (const i of activeIndices(source, 'fill')) run.slots[i] = i;
  run = nextStage(source, run);
  assert.equal(run.stage, 'arrange');
  run.slots = words(source.text).map((_, i) => i);
  run = nextStage(source, run);
  assert.equal(run.stage, 'recall');
  run.answer = source.text;
  assert.equal(finish(source, run, undefined, 100).unaided, 1);
});

test('backup round trip restores complete state', async () => {
  const state = freshState();
  const verse = await makePersonal(sample);
  const source = personalPassage(verse);
  state.personal = [verse];
  state.preferences = { ...state.preferences, translation: 'personal', font: 'mono', accent: 'neutral', colour: 'dark', preset: 'focus' };
  state.run = { ...startRun(source), stage: 'fill', hints: 2 };
  state.run.slots[2] = 2;
  const progress = finish(source, { ...startRun(source, 'review'), answer: source.text }, undefined, 100);
  state.progress[progress.key] = progress;
  const raw = exportBackup(state, new Date('2026-09-21T00:00:00Z'));
  const incoming = await parseImport(raw);
  const empty = freshState();
  const plan = planImport(empty, incoming);
  assert.equal(empty.personal.length, 0, 'preview is read-only');
  assert.deepEqual(confirmImport(empty, plan), state);
  assert.equal(exportBackup(confirmImport(empty, plan), new Date('2026-09-21T00:00:00Z')), raw);
});

test('content updates reset only matching progress', async () => {
  const current = freshState();
  const verse = await makePersonal(sample);
  current.personal = [verse];
  const source = personalPassage(verse);
  current.run = startRun(source, 'review');
  const old = finish(source, { ...current.run, answer: source.text }, undefined, 100);
  const unrelated = finish(p, { ...startRun(p, 'review'), answer: p.text }, undefined, 100);
  current.progress = { [old.key]: old, [unrelated.key]: unrelated };
  const before = JSON.stringify(current);
  const change = await parseImport(bulk([{ ...sample, id: verse.id, text: 'Keep these revised words close.' }]));
  const plan = planImport(current, change);
  assert.equal(plan.updated, 1);
  assert.equal(plan.next.run, null);
  assert.equal(plan.next.progress[old.key], undefined);
  assert.deepEqual(plan.next.progress[unrelated.key], unrelated);
  assert.equal(plan.next.personal[0].id, verse.id);
  assert.notEqual(plan.next.personal[0].revision, verse.revision);
  assert.equal(JSON.stringify(current), before);
  const stale = updatePreferences(current, { font: 'aptos' });
  assert.throws(() => confirmImport(stale, plan), /changed after this preview/);
});

test('untrusted JSON is rejected atomically', async () => {
  const state = freshState();
  state.personal = [await makePersonal(sample)];
  const forged = JSON.parse(exportBackup(state));
  forged.state.personal[0].text = 'This text was tampered with.';
  await assert.rejects(parseImport(JSON.stringify(forged)), /validation failed/);
  const storage = memory();
  storage.setItem(STORAGE_KEY, JSON.stringify(forged.state));
  assert.ok((await loadState(storage)).error);
  assert.equal(storage.getItem(STORAGE_KEY), JSON.stringify(forged.state));
  const impossible = JSON.parse(exportBackup(state));
  impossible.state.run = startRun(personalPassage(state.personal[0]));
  impossible.state.run.slots[0] = 0;
  await assert.rejects(parseImport(JSON.stringify(impossible)), /validation failed/);
  impossible.state.run.slots[0] = null;
  impossible.state.run.mode = 'review';
  await assert.rejects(parseImport(JSON.stringify(impossible)), /validation failed/);
  for (const raw of [
    '{"__proto__":{"polluted":true},"format":"wordkeep-verses","version":1,"verses":[]}',
    '{"format":"wordkeep-verses","version":1,"verses":[{"constructor":{}}]}',
    '{broken', 'x'.repeat(MAX_JSON_BYTES + 1),
    bulk([]), bulk(Array.from({ length: 101 }, () => sample)),
    bulk([{ ...sample, text: ' ' }]),
    bulk([{ ...sample, text: 'word '.repeat(121) }]),
    bulk([{ ...sample, reference: 'x'.repeat(121) }]),
    bulk([{ ...sample, id: '__proto__' }]),
    bulk([{ ...sample, unexpected: true }]),
    bulk([sample, { ...sample, testament: 'unknown' }]),
  ]) await assert.rejects(parseImport(raw));
  assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false);
  const full = freshState();
  full.personal = await Promise.all(Array.from({ length: 100 }, (_, i) => makePersonal({ ...sample, reference: `Sample ${i}` })));
  const before = JSON.stringify(full);
  const extra = await parseImport(bulk([sample]));
  assert.throws(() => planImport(full, extra), /limit/);
  assert.equal(JSON.stringify(full), before);
});

test('backup conflicts keep local data by default', async () => {
  const current = freshState();
  current.run = { ...startRun(p, 'review'), answer: 'current draft' };
  const localProgress = finish(p, { ...current.run, answer: p.text }, undefined, 100);
  current.progress[localProgress.key] = localProgress;
  const backup = structuredClone(current);
  backup.run!.answer = 'backup draft';
  backup.preferences.colour = 'dark';
  backup.progress[localProgress.key] = finish(p, { ...backup.run!, answer: 'incomplete' }, localProgress, 200);
  const incoming = await parseImport(exportBackup(backup));
  const keep = planImport(current, incoming, { preferences: false, replaceProgressAndSession: false });
  assert.deepEqual(keep.next, current);
  const replace = planImport(current, incoming, { preferences: true, replaceProgressAndSession: true });
  assert.deepEqual(replace.next, backup);
  assert.equal(replace.progressReplaced, 1);
  assert.equal(replace.next.progress[localProgress.key].attempts, 2, 'never add device counters together');
});

test('duplicate content remaps backup session safely', async () => {
  const current = freshState();
  const localVerse = await makePersonal(sample);
  current.personal = [localVerse];
  const backup = freshState();
  const remoteVerse = await makePersonal(sample);
  assert.notEqual(remoteVerse.id, localVerse.id);
  backup.personal = [remoteVerse];
  const remotePassage = personalPassage(remoteVerse);
  backup.run = { ...startRun(remotePassage, 'review'), answer: 'draft to resume' };
  const progress = finish(remotePassage, { ...backup.run, answer: remotePassage.text }, undefined, 100);
  backup.progress[progress.key] = progress;
  const incoming = await parseImport(exportBackup(backup));
  const plan = planImport(current, incoming);
  assert.equal(plan.added, 0);
  assert.equal(plan.duplicates, 1);
  const key = passageKey(personalPassage(localVerse));
  assert.equal(plan.next.run?.key, key);
  assert.equal(plan.next.progress[key].unaided, 1);
  assert.equal(plan.next.personal[0].id, localVerse.id);
  const again = planImport(plan.next, incoming);
  assert.equal(again.next.personal.length, 1);
  assert.equal(again.next.progress[key].attempts, 1);
});

test('short personal passages stay playable', async () => {
  for (const text of ['Remember.', 'Keep close.']) {
    const source = personalPassage(await makePersonal({ ...sample, text }));
    let run = nextStage(source, startRun(source));
    assert.equal(run.stage, 'fill');
    assert.deepEqual(activeIndices(source, 'fill'), [0]);
    run.slots[0] = 0;
    run = nextStage(source, run);
    assert.equal(run.stage, 'arrange');
    run.slots = words(text).map((_, i) => i);
    run = nextStage(source, run);
    assert.equal(run.stage, 'recall');
    assert.equal(finish(source, { ...run, answer: text }, undefined, 100).unaided, 1);
  }
});

test('font defaults preserve saved choices', async () => {
  assert.equal(freshState().preferences.font, 'mono');
  const storage = memory();
  for (const font of ['segoe', 'aptos', 'calibri', 'mono'] as const) {
    const state = updatePreferences(freshState(), { font });
    state.run = { ...startRun(p, 'review'), answer: 'Keep my draft' };
    assert.equal(saveState(storage, state), null);
    assert.deepEqual((await loadState(storage)).state, state);
  }
});

test('accent defaults preserve saved choices', async () => {
  assert.equal(freshState().preferences.accent, 'purple');
  const storage = memory();
  for (const accent of ['rose', 'neutral', 'blue', 'green', 'purple'] as const) {
    const state = updatePreferences(freshState(), { accent });
    state.run = { ...startRun(p, 'review'), answer: 'Keep my answer', hints: 1, exposed: true };
    assert.equal(saveState(storage, state), null);
    assert.deepEqual((await loadState(storage)).state, state);
  }
});

async function withBibleFiles(action: () => Promise<void>, corruptPath = ''): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const path = String(input);
    assert.ok(path.startsWith(`/bibles/${BIBLE_SNAPSHOT}/`), 'only versioned same-origin catalogue requests');
    const bytes = readFileSync(new URL(`../public${path}`, import.meta.url));
    if (corruptPath && path.endsWith(corruptPath)) {
      const altered = JSON.parse(bytes.toString());
      altered.verses['1'] = 'Altered official verse text.';
      return new Response(JSON.stringify(altered));
    }
    return new Response(new Uint8Array(bytes));
  };
  try { await action(); } finally { globalThis.fetch = originalFetch; }
}
const selection = (translation: 'webbe' | 'bsb', book: string, chapter: number, start: number, end = start): BibleSelection =>
  ({ snapshot: BIBLE_SNAPSHOT, translation, book, chapter, start, end });

test('official catalogue covers both Testaments with exact source words', async () => {
  const root = new URL(`../public/bibles/${BIBLE_SNAPSHOT}/`, import.meta.url);
  const bytes = readFileSync(new URL('manifest.json', root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), BIBLE_MANIFEST_SHA256);
  await withBibleFiles(async () => {
    const index = await loadBibleManifest();
    for (const translation of ['webbe', 'bsb'] as const) {
      const books = index.translations[translation].books;
      assert.equal(books.length, 66);
      assert.equal(books.filter(b => b.testament === 'OT').length, 39);
      assert.equal(books.filter(b => b.testament === 'NT').length, 27);
      assert.equal(books.reduce((sum, b) => sum + b.chapters.length, 0), 1189);
      for (const book of books) for (const chapter of book.chapters) {
        const raw = readFileSync(new URL(chapter.path, root));
        assert.equal(createHash('sha256').update(raw).digest('hex'), chapter.sha256);
        const body = JSON.parse(raw.toString()) as { verses: Record<string, string> };
        assert.deepEqual(Object.entries(body.verses).filter(([, text]) => text.length > 0).map(([v]) => Number(v)), chapter.verses);
      }
    }
    const expectations = [
      ['webbe', 'ISA', 40, 31, 'but those who wait for the LORD will renew their strength. They will mount up with wings like eagles. They will run, and not be weary. They will walk, and not faint.'],
      ['webbe', 'JOH', 3, 16, 'For God so loved the world, that he gave his only born Son, that whoever believes in him should not perish, but have eternal life.'],
      ['bsb', 'ISA', 40, 31, 'But those who wait upon the LORD will renew their strength; they will mount up with wings like eagles; they will run and not grow weary, they will walk and not faint.'],
      ['bsb', 'JOH', 3, 16, 'For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life.'],
    ] as const;
    for (const [translation, book, chapter, verse, text] of expectations) {
      const p = await resolveBibleSelection(selection(translation, book, chapter, verse));
      assert.equal(p.text, text);
      assert.equal(p.translation, translation);
      assert.equal(p.testament, book === 'ISA' ? 'OT' : 'NT');
      assert.ok(p.catalogue?.sourceSha256);
    }
  });
});

test('official selections restore and transfer without trusting imported text', async () => {
  await withBibleFiles(async () => {
    const state = freshState();
    state.official = [selection('webbe', 'ISA', 40, 31), selection('bsb', 'JOH', 3, 16)];
    for (const s of state.official) await resolveBibleSelection(s);
    const p = selectedBiblePassages(state.official)[0];
    state.run = { ...startRun(p, 'review'), answer: 'preserve my answer' };
    const progress = finish(p, { ...state.run, answer: p.text }, undefined, 100);
    state.progress[progress.key] = progress;
    const store = memory();
    assert.equal(saveState(store, state), null);
    assert.deepEqual((await loadState(store)).state, state);
    const raw = exportBackup(state);
    assert.equal(raw.includes(p.text), false, 'official text is not trusted from backup payloads');
    const incoming = await parseImport(raw);
    const empty = freshState();
    assert.deepEqual(confirmImport(empty, planImport(empty, incoming)), state);
    const same = planImport(state, incoming);
    assert.equal(same.next.official!.length, 2);
    assert.equal(same.next.progress[progress.key].attempts, 1);
    const fake = JSON.parse(raw);
    fake.state.official[0].text = 'arbitrary imported text';
    await assert.rejects(parseImport(JSON.stringify(fake)), /Invalid official Bible/);
    delete fake.state.official[0].text;
    fake.state.official[0].snapshot = 'unavailable-edition';
    await assert.rejects(parseImport(JSON.stringify(fake)), /Invalid official Bible/);
  });
});

test('Bible loading validates assets and rejects unsupported ranges', async () => {
  await withBibleFiles(async () => {
    await assert.rejects(resolveBibleSelection(selection('bsb', 'GEN', 1, 1, 31)), /exceeds the exercise limit/);
    await assert.rejects(resolveBibleSelection(selection('bsb', 'ACT', 8, 37)), /no text in this edition/);
    await assert.rejects(resolveBibleSelection(selection('webbe', 'XXX', 1, 1)), /Book not found/);
    await assert.rejects(resolveBibleSelection(selection('webbe', 'GEN', 99, 1)), /chapter is not/);
  });
  await withBibleFiles(async () => {
    await assert.rejects(resolveBibleSelection(selection('webbe', 'EXO', 2, 1)), /source validation failed/);
  }, 'webbe/EXO-2.json');
  const fetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(resolveBibleSelection(selection('webbe', 'LEV', 2, 1)), /Check your connection/);
  } finally { globalThis.fetch = fetch; }
  await withBibleFiles(async () => {
    assert.ok((await resolveBibleSelection(selection('webbe', 'EXO', 2, 1))).text);
  });
});
