// Private voice engine. Runs Whisper on this device, off the main thread. Audio arrives as samples in memory,
// is transcribed, and is never stored. Every file comes from the verified voice cache; nothing is fetched while transcribing.
import { filesFor, MODELS, RUNTIME, VOICE_CACHE, type PrivateModel, type VoiceFile } from './models';
import { downloadVerified, readVerified } from './verified';

export type VoiceRequest = { type: 'check'; model: PrivateModel } | { type: 'download'; model: PrivateModel } | { type: 'transcribe'; model: PrivateModel; audio: Float32Array };
export type VoiceReply = { type: 'progress'; loaded: number; total: number } | { type: 'downloaded' } | { type: 'preparing' }
  | { type: 'status'; downloaded: boolean } | { type: 'text'; text: string } | { type: 'error'; message: string; missing?: boolean };

type Transcriber = (audio: Float32Array) => Promise<{ text: string } | { text: string }[]>;
interface TransformersModule {
  env: Record<string, unknown> & { backends: { onnx: { wasm: Record<string, unknown> } } };
  pipeline(task: string, model: string, options: Record<string, unknown>): Promise<Transcriber>;
}

const post = (reply: VoiceReply) => (self as unknown as { postMessage(message: unknown): void }).postMessage(reply);
class MissingFiles extends Error {}
let engine: { model: PrivateModel; run: Transcriber } | null = null;

async function load(model: PrivateModel): Promise<Transcriber> {
  if (engine?.model === model) return engine.run;
  post({ type: 'preparing' });
  const cache = await caches.open(VOICE_CACHE);
  const need = async (file: VoiceFile) => {
    const bytes = await readVerified(cache, file);
    if (!bytes) throw new MissingFiles('The private voice download is missing or damaged. Download it again from Find a verse.');
    return bytes;
  };
  for (const file of MODELS[model].files) await need(file);
  const blobUrl = async (file: VoiceFile) => URL.createObjectURL(new Blob([await need(file)], { type: 'text/javascript' }));
  const t = await import(/* @vite-ignore */ await blobUrl(RUNTIME.library)) as TransformersModule;
  Object.assign(t.env, {
    // Remote mode is only a lookup scheme here: every file was verified above and is read from the cache,
    // and fetch refuses the network so nothing unverified can load.
    allowLocalModels: false, allowRemoteModels: true, useBrowserCache: false, useFSCache: false, useWasmCache: false,
    fetch: (url: string) => Promise.reject(new MissingFiles(`Private voice tried to load an unchecked file (${url}). Download it again from Find a verse.`)),
    // Read-only view of the verified cache, so nothing unverified is ever added to it.
    // Some lookups (such as config.json) ask for "main"; only the pinned revision was downloaded and verified.
    useCustomCache: true,
    customCache: { match: (key: string) => cache.match(key.replace('/resolve/main/', `/resolve/${MODELS[model].revision}/`)), put: async () => undefined },
  });
  Object.assign(t.env.backends.onnx.wasm, { wasmPaths: { mjs: await blobUrl(RUNTIME.factory) }, wasmBinary: await need(RUNTIME.wasm), numThreads: 1, proxy: false });
  const run = await t.pipeline('automatic-speech-recognition', MODELS[model].repo, { revision: MODELS[model].revision, dtype: 'q8', device: 'wasm' });
  engine = { model, run };
  return run;
}

self.addEventListener('message', async (event: MessageEvent<VoiceRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'check') {
      const cache = await caches.open(VOICE_CACHE);
      const present = await Promise.all(filesFor(request.model).map(file => cache.match(file.url)));
      post({ type: 'status', downloaded: present.every(Boolean) });
    } else if (request.type === 'download') {
      await downloadVerified(filesFor(request.model), await caches.open(VOICE_CACHE), (loaded, total) => post({ type: 'progress', loaded, total }));
      post({ type: 'downloaded' });
    } else if (request.type === 'transcribe') {
      const run = await load(request.model);
      const output = await run(request.audio);
      const text = (Array.isArray(output) ? output.map(o => o.text).join(' ') : output.text).replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
      post({ type: 'text', text });
    }
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : 'Private voice failed. Please try again.', missing: error instanceof MissingFiles });
  }
});
