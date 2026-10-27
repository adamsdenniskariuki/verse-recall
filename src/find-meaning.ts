// Meaning search for Find a verse. The client and its worker load only when Find checks for or uses it.
import type { MeaningHit } from './search/rank';
import { ui } from './ui';
import type { VoiceHost } from './find-voice';
import { meaningSize } from './semantic/models';

type MeaningRuntime = typeof import('./semantic/meaning');
let loading: Promise<MeaningRuntime> | null = null;
function runtime(): Promise<MeaningRuntime> {
  loading ??= import('./semantic/meaning');
  loading.catch(() => { loading = null; });
  return loading;
}
const focus = (selector: string) => document.querySelector<HTMLElement>(selector)?.focus();

/** Learns whether meaning search is on this device, so the note under the search box is accurate. */
export async function refreshMeaning(host: VoiceHost): Promise<void> {
  try {
    const r = await runtime();
    if (!r.meaningSupported()) return;
    const downloaded = await r.meaningDownloaded();
    if (ui.find.meaning.downloaded === downloaded) return;
    ui.find.meaning.downloaded = downloaded;
    if (ui.view === 'find') host.render();
  } catch { /* The note simply offers the download. */ }
}

/** Verses close in meaning to the query, or none when meaning search is not downloaded or fails. */
export async function meaningHits(query: string, preparing: () => void): Promise<MeaningHit[]> {
  if (!ui.find.meaning.downloaded || ui.find.meaning.phase === 'downloading') return [];
  try { return await (await runtime()).searchMeaning(query, 12, preparing); }
  catch { return []; }
}

/** Updates the progress bar in place, so the page is not re-rendered for every chunk. */
function showProgress(fraction: number): void {
  const percent = Math.floor(fraction * 100);
  ui.find.meaning.progress = fraction;
  const bar = document.querySelector<HTMLProgressElement>('#meaning-progress');
  if (bar) bar.value = percent;
  const text = document.querySelector('#meaning-progress-text');
  if (text) text.textContent = `${percent}%`;
}

async function download(host: VoiceHost): Promise<void> {
  const size = meaningSize();
  const meaning = ui.find.meaning;
  if (meaning.phase === 'downloading') return;
  meaning.phase = 'downloading';
  meaning.progress = 0;
  host.status(`Downloading meaning search, about ${size}. You can keep searching by keywords meanwhile.`);
  focus('[data-action="meaning-cancel"]');
  try {
    await (await runtime()).downloadMeaning((loaded, total) => showProgress(total ? loaded / total : 0));
    if (meaning.phase !== 'downloading') return;
    meaning.phase = 'idle';
    meaning.downloaded = true;
    host.status('Meaning search is ready and kept on this device for offline use. Your searches now also match by meaning.');
    focus('#find-query');
  } catch (error) {
    if (meaning.phase !== 'downloading') return;
    meaning.phase = 'consent';
    host.status(error instanceof Error ? error.message : 'The meaning search download failed. Please try again.', true);
    focus('[data-action="meaning-download"]');
  }
}

export async function meaningAction(action: string, host: VoiceHost): Promise<void> {
  const size = meaningSize();
  const meaning = ui.find.meaning;
  switch (action) {
    case 'meaning-offer': {
      let supported = false;
      try { supported = (await runtime()).meaningSupported(); } catch { /* reported below */ }
      if (!supported) return host.status('Meaning search is not supported in this browser. Keyword and reference search still work.', true);
      meaning.phase = 'consent';
      host.status(`Meaning search needs a one-time download of about ${size}. Download it, or keep using keyword search.`);
      return focus('[data-action="meaning-download"]');
    }
    case 'meaning-download': return download(host);
    case 'meaning-cancel': {
      const downloading = meaning.phase === 'downloading';
      if (downloading) (await runtime()).cancelMeaning();
      meaning.phase = 'idle';
      host.status(downloading ? 'Download cancelled. Files already checked are kept for next time; meaning search stays off until the download finishes.' : 'Meaning search was not downloaded. Keyword and reference search still work.');
      return focus('#find-query');
    }
    case 'meaning-remove': {
      try { await (await runtime()).removeMeaning(); }
      catch { return host.status('The meaning search download could not be removed. Try clearing site data in your browser.', true); }
      meaning.downloaded = false;
      meaning.phase = 'idle';
      host.status('Meaning search was removed from this device.');
      return focus('#find-query');
    }
  }
}
