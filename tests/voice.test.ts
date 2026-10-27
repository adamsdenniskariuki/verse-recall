import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { allVerified, downloadVerified, IntegrityError, readVerified, type CacheLike } from '../src/voice/verified';
import { downloadBytes, filesFor, megabytes, MODELS, RUNTIME, type VoiceFile } from '../src/voice/models';
import { speechError } from '../src/voice/voice';
import { freshState, updatePreferences, validState } from '../src/store';
import { confirmImport, exportBackup, parseImport, planImport } from '../src/transfer';

const file = (url: string, text: string): VoiceFile & { body: Uint8Array } => {
  const body = new TextEncoder().encode(text);
  return { url, bytes: body.byteLength, sha256: createHash('sha256').update(body).digest('hex'), body };
};
const memoryCache = () => {
  const store = new Map<string, ArrayBuffer>();
  const cache: CacheLike = {
    match: async url => store.has(url) ? new Response(store.get(url)!.slice(0)) : undefined,
    put: async (url, response) => { store.set(url, await response.arrayBuffer()); },
  };
  return { store, cache };
};
// Serves each body in two chunks, so streaming and progress are exercised.
const server = (bodies: Record<string, Uint8Array>, requests: string[] = []) => (async (url: string | URL | Request) => {
  const key = String(url);
  requests.push(key);
  const body = bodies[key];
  if (!body) return new Response('missing', { status: 404 });
  const half = Math.ceil(body.byteLength / 2);
  return new Response(new ReadableStream({ start(controller) { controller.enqueue(body.slice(0, half)); controller.enqueue(body.slice(half)); controller.close(); } }));
}) as typeof fetch;

test('voice downloads keep only files that match their pinned size and hash', async () => {
  const a = file('https://example.test/a', 'first file');
  const b = file('https://example.test/b', 'the second file');
  const { store, cache } = memoryCache();
  const progress: [number, number][] = [];
  const requests: string[] = [];
  await downloadVerified([a, b], cache, (loaded, total) => progress.push([loaded, total]), server({ [a.url]: a.body, [b.url]: b.body }, requests));
  assert.deepEqual([...store.keys()], [a.url, b.url]);
  assert.deepEqual(requests, [a.url, b.url]);
  const total = a.bytes + b.bytes;
  assert.deepEqual(progress[0], [0, total]);
  assert.deepEqual(progress.at(-1), [total, total]);
  assert.ok(progress.every(([loaded], i) => i === 0 || loaded >= progress[i - 1][0]));
  assert.ok(await allVerified([a, b], cache));
  assert.equal(new TextDecoder().decode((await readVerified(cache, a))!), 'first file');

  // Already-verified files are not fetched again, and count towards progress at once.
  const again: string[] = [];
  const after: [number, number][] = [];
  await downloadVerified([a, b], cache, (loaded, t) => after.push([loaded, t]), server({}, again));
  assert.deepEqual(again, []);
  assert.deepEqual(after, [[total, total]]);
});

test('voice downloads reject altered, oversized, short and failed files without keeping them', async () => {
  const a = file('https://example.test/a', 'first file');
  const b = file('https://example.test/b', 'the second file');
  const swapped = new TextEncoder().encode('THE second file');
  let { store, cache } = memoryCache();
  await assert.rejects(downloadVerified([a, b], cache, () => undefined, server({ [a.url]: a.body, [b.url]: swapped })), IntegrityError);
  assert.deepEqual([...store.keys()], [a.url], 'a good earlier file is kept for the next attempt; the altered one is not');
  assert.equal(await allVerified([a, b], cache), false);

  ({ store, cache } = memoryCache());
  await assert.rejects(downloadVerified([b], cache, () => undefined, server({ [b.url]: new TextEncoder().encode('the second file, and more') })), /larger than expected/);
  await assert.rejects(downloadVerified([b], cache, () => undefined, server({ [b.url]: new TextEncoder().encode('the second') })), /integrity check/);
  await assert.rejects(downloadVerified([b], cache, () => undefined, server({})), /HTTP 404/);
  await assert.rejects(downloadVerified([b], cache, () => undefined, (async () => { throw new TypeError('offline'); }) as typeof fetch), /Check your connection/);
  assert.equal(store.size, 0);

  // A cached file that no longer matches its hash is treated as missing and downloaded again.
  store.set(b.url, swapped.buffer.slice(0));
  assert.equal(await readVerified(cache, b), null);
  await downloadVerified([b], cache, () => undefined, server({ [b.url]: b.body }));
  assert.ok(await readVerified(cache, b));
});

test('private voice files are pinned to exact versions, sizes and hashes', () => {
  for (const model of ['tiny', 'base'] as const) {
    const files = filesFor(model);
    assert.equal(new Set(files.map(f => f.url)).size, files.length);
    for (const f of files) {
      assert.match(f.sha256, /^[0-9a-f]{64}$/);
      assert.ok(Number.isSafeInteger(f.bytes) && f.bytes > 0);
      assert.ok(f.url.startsWith('https://'));
    }
    for (const f of MODELS[model].files) assert.ok(f.url.startsWith(`https://huggingface.co/${MODELS[model].repo}/resolve/${MODELS[model].revision}/`), f.url);
    assert.match(MODELS[model].revision, /^[0-9a-f]{40}$/);
    assert.ok(files.includes(RUNTIME.library) && files.includes(RUNTIME.factory) && files.includes(RUNTIME.wasm));
  }
  for (const f of [RUNTIME.library, RUNTIME.factory, RUNTIME.wasm]) assert.match(f.url, /^https:\/\/cdn\.jsdelivr\.net\/npm\/[@a-z/-]+@\d+\.\d+\.\d+[\w.-]*\/dist\//);
  assert.equal(megabytes(downloadBytes('tiny')), '58 MB');
  assert.equal(megabytes(downloadBytes('base')), '94 MB');
  assert.equal(megabytes(1_499_999), '1 MB');
});

test('speech errors become plain advice', () => {
  for (const code of ['not-allowed', 'service-not-allowed', 'NotAllowedError', 'SecurityError']) assert.match(speechError(code), /Microphone access is blocked/);
  assert.match(speechError('no-speech'), /Nothing was heard/);
  for (const code of ['audio-capture', 'NotFoundError', 'OverconstrainedError']) assert.match(speechError(code), /No microphone was found/);
  assert.match(speechError('NotReadableError'), /another app/);
  assert.match(speechError('network'), /could not be reached/);
  assert.match(speechError('language-not-supported'), /does not support English/);
  assert.match(speechError('something-new'), /stopped unexpectedly/);
});

test('the voice preference is optional, validated and kept in backups', async () => {
  const state = freshState();
  assert.equal(state.preferences.voice, undefined);
  assert.ok(validState(state), 'saves from before voice input still load');
  for (const voice of ['browser', 'tiny', 'base'] as const) assert.ok(validState({ ...state, preferences: { ...state.preferences, voice } }));
  for (const voice of ['whisper', 'small', '', null, 1]) assert.equal(validState({ ...state, preferences: { ...state.preferences, voice } }), false, String(voice));

  const chosen = updatePreferences(state, { voice: 'base' });
  assert.equal(chosen.preferences.voice, 'base');
  const parsed = await parseImport(exportBackup(chosen));
  const restored = confirmImport(freshState(), planImport(freshState(), parsed));
  assert.equal(restored.preferences.voice, 'base');
});
