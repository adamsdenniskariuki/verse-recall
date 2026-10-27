// Meaning search engine. Embeds the search on this device and compares it with precomputed verse vectors.
// Every file comes from the verified meaning cache; nothing is fetched while searching.
import { MissingFiles, openTransformers, reuseVerified, verifiedReader } from '../runtime/transformers';
import { RUNTIME, VOICE_CACHE } from '../voice/models';
import { downloadVerified } from '../voice/verified';
import { EMBEDDING, indexFile, MEANING_CACHE, meaningFiles } from './models';
import { MEANING_SHARD_ROWS, MEANING_COUNT } from './version';
import { floats, MeaningIndex, type MeaningHit } from './vectors';

/** `base` is the app's address (origin plus base path), where the verse vectors are served. */
export type MeaningRequest = { type: 'check'; base: string } | { type: 'download'; base: string } | { type: 'search'; base: string; query: string; limit: number };
export type MeaningReply = { type: 'progress'; loaded: number; total: number } | { type: 'downloaded' } | { type: 'preparing' }
  | { type: 'status'; downloaded: boolean } | { type: 'hits'; hits: MeaningHit[] } | { type: 'error'; message: string; missing?: boolean };

type Extractor = (text: string, options: Record<string, unknown>) => Promise<{ data: Float32Array }>;
const post = (reply: MeaningReply) => (self as unknown as { postMessage(message: unknown): void }).postMessage(reply);
const MISSING = 'The meaning search download is missing or damaged. Download it again from Find a verse.';
let engine: Promise<{ embed: Extractor; index: MeaningIndex }> | null = null;

async function load(base: string) {
  post({ type: 'preparing' });
  const cache = await caches.open(MEANING_CACHE);
  const need = verifiedReader(cache, MISSING);
  for (const file of meaningFiles(base)) await need(file);
  const shards: Int8Array[] = [];
  for (let i = 0; i * MEANING_SHARD_ROWS < MEANING_COUNT; i++) shards.push(new Int8Array(await need(indexFile(base, `vectors-${String(i).padStart(2, '0')}.bin`))));
  const index = new MeaningIndex(floats(await need(indexFile(base, 'projection.bin'))), floats(await need(indexFile(base, 'scales.bin'))), shards);
  const t = await openTransformers(cache, EMBEDDING.revision, need, MISSING);
  const embed = await t.pipeline('feature-extraction', EMBEDDING.repo, { revision: EMBEDDING.revision, dtype: 'q8', device: 'wasm' }) as Extractor;
  return { embed, index };
}

self.addEventListener('message', async (event: MessageEvent<MeaningRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'check') {
      const cache = await caches.open(MEANING_CACHE);
      const present = await Promise.all(meaningFiles(request.base).map(file => cache.match(file.url)));
      post({ type: 'status', downloaded: present.every(Boolean) });
    } else if (request.type === 'download') {
      const files = meaningFiles(request.base);
      const cache = await caches.open(MEANING_CACHE);
      // Drop vectors from older versions of the index; they are never used again.
      const keep = new Set(files.map(file => file.url));
      for (const old of await cache.keys()) if (!keep.has(old.url)) await cache.delete(old);
      await reuseVerified(Object.values(RUNTIME), cache, [VOICE_CACHE]);
      await downloadVerified(files, cache, (loaded, total) => post({ type: 'progress', loaded, total }), fetch, 'meaning search');
      post({ type: 'downloaded' });
    } else if (request.type === 'search') {
      engine ??= load(request.base);
      engine.catch(() => { engine = null; });
      const { embed, index } = await engine;
      const output = await embed(EMBEDDING.queryPrefix + request.query, { pooling: 'cls', normalize: true });
      post({ type: 'hits', hits: index.search(output.data, request.limit) });
    }
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : 'Meaning search failed. Please try again.', missing: error instanceof MissingFiles });
  }
});
