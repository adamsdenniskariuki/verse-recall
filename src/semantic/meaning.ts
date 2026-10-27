// Meaning search client. Loaded only when Find a verse checks for or uses meaning search.
import { MEANING_CACHE } from './models';
import type { MeaningHit } from './vectors';
import type { MeaningReply, MeaningRequest } from './meaning.worker';

export const meaningSupported = () => typeof Worker === 'function' && typeof WebAssembly === 'object' && 'caches' in window;
const base = () => new URL(import.meta.env.BASE_URL, location.href).href;

let worker: Worker | null = null;
function meaningWorker(): Worker {
  worker ??= new Worker(new URL('./meaning.worker.ts', import.meta.url), { type: 'module', name: 'verse-recall-meaning' });
  return worker;
}
type Request = MeaningRequest extends infer R ? R extends { base: string } ? Omit<R, 'base'> : never : never;
/** Sends one request to the meaning worker and resolves with its final reply. */
function ask(request: Request, update?: (reply: MeaningReply) => void): Promise<MeaningReply> {
  const w = meaningWorker();
  return new Promise((resolve, reject) => {
    const stop = () => { w.removeEventListener('message', listen); w.removeEventListener('error', fail); };
    const listen = (event: MessageEvent<MeaningReply>) => {
      const reply = event.data;
      if (reply.type === 'progress' || reply.type === 'preparing') update?.(reply);
      else { stop(); resolve(reply); }
    };
    const fail = (event: ErrorEvent) => {
      event.preventDefault();
      stop();
      worker = null;
      reject(new Error('Meaning search could not start in this browser. Keyword and reference search still work.'));
    };
    w.addEventListener('message', listen);
    w.addEventListener('error', fail);
    w.postMessage({ ...request, base: base() } as MeaningRequest);
  });
}
const unwrap = (reply: MeaningReply) => { if (reply.type === 'error') throw new Error(reply.message); return reply; };

/** Whether every meaning search file is on the device. Full integrity checks run before first use. */
export async function meaningDownloaded(): Promise<boolean> {
  const reply = unwrap(await ask({ type: 'check' }));
  return reply.type === 'status' && reply.downloaded;
}
export async function downloadMeaning(progress: (loaded: number, total: number) => void): Promise<void> {
  unwrap(await ask({ type: 'download' }, reply => { if (reply.type === 'progress') progress(reply.loaded, reply.total); }));
}
/** Stops any download in progress. */
export function cancelMeaning(): void {
  worker?.terminate();
  worker = null;
}
export async function removeMeaning(): Promise<void> {
  cancelMeaning();
  await caches.delete(MEANING_CACHE);
}
/** The verses closest in meaning to the search, found on this device. */
export async function searchMeaning(query: string, limit: number, preparing?: () => void): Promise<MeaningHit[]> {
  const reply = unwrap(await ask({ type: 'search', query, limit }, r => { if (r.type === 'preparing') preparing?.(); }));
  return reply.type === 'hits' ? reply.hits : [];
}
