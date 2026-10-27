// Shared on-device model runtime for private voice and meaning search. Runs inside a worker.
// transformers.js and the ONNX runtime come only from a verified cache; the network is refused.
import { RUNTIME, type VoiceFile } from '../voice/models';
import { readVerified } from '../voice/verified';

export interface TransformersModule {
  env: Record<string, unknown> & { backends: { onnx: { wasm: Record<string, unknown> } } };
  pipeline(task: string, model: string, options: Record<string, unknown>): Promise<unknown>;
}

/** A required file is missing or no longer matches its pinned hash; the person needs to download again. */
export class MissingFiles extends Error {}

/** Reads a file from the cache, refusing anything that does not match its pinned size and hash. */
export const verifiedReader = (cache: Cache, missing: string) => async (file: VoiceFile): Promise<ArrayBuffer> => {
  const bytes = await readVerified(cache, file);
  if (!bytes) throw new MissingFiles(missing);
  return bytes;
};

/**
 * Starts transformers.js from verified cached copies. Model lookups read the same cache, mapped to the pinned
 * revision, and any attempt to fetch is rejected so nothing unverified can load.
 */
export async function openTransformers(cache: Cache, revision: string, need: (file: VoiceFile) => Promise<ArrayBuffer>, missing: string): Promise<TransformersModule> {
  const blobUrl = async (file: VoiceFile) => URL.createObjectURL(new Blob([await need(file)], { type: 'text/javascript' }));
  const t = await import(/* @vite-ignore */ await blobUrl(RUNTIME.library)) as TransformersModule;
  Object.assign(t.env, {
    // Remote mode is only a lookup scheme here: every file was verified first and is read from the cache.
    allowLocalModels: false, allowRemoteModels: true, useBrowserCache: false, useFSCache: false, useWasmCache: false,
    fetch: (url: string) => Promise.reject(new MissingFiles(`${missing} (an unchecked file was requested: ${url})`)),
    // Read-only view of the verified cache. Some lookups (such as config.json) ask for "main";
    // only the pinned revision was downloaded and verified.
    useCustomCache: true,
    customCache: { match: (key: string) => cache.match(key.replace('/resolve/main/', `/resolve/${revision}/`)), put: async () => undefined },
  });
  Object.assign(t.env.backends.onnx.wasm, { wasmPaths: { mjs: await blobUrl(RUNTIME.factory) }, wasmBinary: await need(RUNTIME.wasm), numThreads: 1, proxy: false });
  return t;
}

/** Copies verified files another on-device feature already downloaded, so shared files are not fetched twice. */
export async function reuseVerified(files: readonly VoiceFile[], target: Cache, sources: readonly string[]): Promise<void> {
  for (const file of files) {
    if (await readVerified(target, file)) continue;
    for (const name of sources) {
      if (!await caches.has(name)) continue;
      const bytes = await readVerified(await caches.open(name), file);
      if (!bytes) continue;
      await target.put(file.url, new Response(bytes, { headers: { 'content-length': String(file.bytes) } }));
      break;
    }
  }
}
