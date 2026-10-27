// Private voice engine. Runs Whisper on this device, off the main thread. Audio arrives as samples in memory,
// is transcribed, and is never stored. Every file comes from the verified voice cache; nothing is fetched while transcribing.
import { MissingFiles, openTransformers, reuseVerified, verifiedReader } from '../runtime/transformers';
import { MEANING_CACHE } from '../semantic/models';
import { filesFor, MODELS, VOICE_CACHE, type PrivateModel } from './models';
import { downloadVerified } from './verified';

export type VoiceRequest = { type: 'check'; model: PrivateModel } | { type: 'download'; model: PrivateModel } | { type: 'transcribe'; model: PrivateModel; audio: Float32Array };
export type VoiceReply = { type: 'progress'; loaded: number; total: number } | { type: 'downloaded' } | { type: 'preparing' }
  | { type: 'status'; downloaded: boolean } | { type: 'text'; text: string } | { type: 'error'; message: string; missing?: boolean };

type Transcriber = (audio: Float32Array) => Promise<{ text: string } | { text: string }[]>;

const post = (reply: VoiceReply) => (self as unknown as { postMessage(message: unknown): void }).postMessage(reply);
const MISSING = 'The private voice download is missing or damaged. Download it again from Find a verse.';
let engine: { model: PrivateModel; run: Transcriber } | null = null;

async function load(model: PrivateModel): Promise<Transcriber> {
  if (engine?.model === model) return engine.run;
  post({ type: 'preparing' });
  const cache = await caches.open(VOICE_CACHE);
  const need = verifiedReader(cache, MISSING);
  for (const file of MODELS[model].files) await need(file);
  const t = await openTransformers(cache, MODELS[model].revision, need, MISSING);
  const run = await t.pipeline('automatic-speech-recognition', MODELS[model].repo, { revision: MODELS[model].revision, dtype: 'q8', device: 'wasm' }) as Transcriber;
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
      const cache = await caches.open(VOICE_CACHE);
      await reuseVerified(filesFor(request.model), cache, [MEANING_CACHE]);
      await downloadVerified(filesFor(request.model), cache, (loaded, total) => post({ type: 'progress', loaded, total }));
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
