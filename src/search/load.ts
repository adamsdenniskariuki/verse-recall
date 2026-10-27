import type { IndexMeta } from './index-format';
import { KeywordIndex } from './keyword';
import { SEARCH_INDEX, SEARCH_META_SHA256 } from './version';

const digest = async (bytes: Uint8Array<ArrayBuffer>) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');

async function fetchChecked(path: string, hash: string): Promise<Uint8Array<ArrayBuffer>> {
  let response: Response;
  try { response = await fetch(`${import.meta.env.BASE_URL}search/${SEARCH_INDEX}/${path}`, { signal: AbortSignal.timeout(30_000) }); }
  catch { throw new Error('The search index could not be downloaded. Check your connection and try again. Once downloaded it works offline.'); }
  if (!response.ok) throw new Error(`The search index is unavailable (${response.status}). Please try again.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (await digest(bytes) !== hash) throw new Error('The search index failed its integrity check. Reload the app and try again.');
  return bytes;
}

let loading: Promise<KeywordIndex> | null = null;
/** Downloads (once) and verifies the offline keyword index. The service worker keeps it for offline use. */
export function loadKeywordIndex(): Promise<KeywordIndex> {
  loading ??= (async () => {
    const meta = JSON.parse(new TextDecoder().decode(await fetchChecked('meta.json', SEARCH_META_SHA256))) as IndexMeta;
    if (meta.format !== 'verse-recall-search' || meta.version !== 1) throw new Error('Unsupported search index.');
    return new KeywordIndex(meta, await fetchChecked('postings.bin', meta.postingsSha256));
  })();
  loading.catch(() => { loading = null; });
  return loading;
}
