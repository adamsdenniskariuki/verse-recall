import type { VoiceFile } from './models';

/** The parts of the Cache API that voice downloads use, so tests can pass a simple in-memory cache. */
export interface CacheLike {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
}

export async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Returns a cached file only when it still matches its pinned hash. */
export async function readVerified(cache: CacheLike, file: VoiceFile): Promise<ArrayBuffer | null> {
  const hit = await cache.match(file.url);
  if (!hit) return null;
  const bytes = await hit.arrayBuffer();
  return bytes.byteLength === file.bytes && await sha256(bytes) === file.sha256 ? bytes : null;
}

export class IntegrityError extends Error {}

/**
 * Downloads every file that is not already cached and verified, checking size and SHA-256 before anything is kept.
 * Progress counts bytes across all files, including ones already on the device.
 */
export async function downloadVerified(files: VoiceFile[], cache: CacheLike, onProgress: (loaded: number, total: number) => void,
  fetcher: typeof fetch = fetch, feature = 'private voice'): Promise<void> {
  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  let loaded = 0;
  const pending: VoiceFile[] = [];
  for (const file of files) {
    if (await readVerified(cache, file)) loaded += file.bytes;
    else pending.push(file);
  }
  onProgress(loaded, total);
  for (const file of pending) {
    let response: Response;
    try { response = await fetcher(file.url, { cache: 'no-store', credentials: 'omit' }); }
    catch { throw new Error(`The ${feature} download stopped. Check your connection and try again.`); }
    if (!response.ok || !response.body) throw new Error(`The ${feature} download failed (HTTP ${response.status}). Try again later.`);
    const reader = response.body.getReader();
    const bytes = new Uint8Array(file.bytes);
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (received + value.byteLength > file.bytes) { await reader.cancel(); throw new IntegrityError(`A ${feature} file was larger than expected, so it was not kept.`); }
      bytes.set(value, received);
      received += value.byteLength;
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
    if (received !== file.bytes || await sha256(bytes.buffer) !== file.sha256) throw new IntegrityError(`A ${feature} file failed its integrity check, so it was not kept. Try again later.`);
    // Each file is kept only once verified. A later failure leaves earlier good files for the next attempt;
    // the engine never starts until every file is present and verified.
    await cache.put(file.url, new Response(bytes.buffer, { headers: { 'content-length': String(file.bytes) } }));
  }
}

/** True when every file is cached and still matches its hash. */
export async function allVerified(files: VoiceFile[], cache: CacheLike): Promise<boolean> {
  for (const file of files) if (!await readVerified(cache, file)) return false;
  return true;
}
