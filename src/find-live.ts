// Live mode for Find a verse: listens continuously and lists verses that are quoted or referenced.
// Audio is never stored. The speech engines and detector load only when live mode starts.
import { loadBibleEdition, readBibleChapter } from './bible-catalog';
import { privateModel, privateSize, stopVoice, type VoiceHost } from './find-voice';
import type { LiveDetector } from './live/detect';
import { ui, type LiveItem } from './ui';
import type { Listening, LiveHooks } from './voice/voice';
import { clock, liveList } from './views/find';

export interface LiveHost extends VoiceHost {
  /** Runs a search, as if it had been typed. */
  search(query: string): void;
}

/** Live mode stops itself after 90 minutes, so a forgotten tab does not keep listening. */
export const LIVE_LIMIT_MS = 90 * 60_000;

let session: Listening | null = null;
let ticker: ReturnType<typeof setInterval> | undefined;
let run = 0;

const focus = (selector: string) => document.querySelector<HTMLElement>(selector)?.focus();
const setText = (selector: string, text: string) => { const node = document.querySelector(selector); if (node) node.textContent = text; };

/** Stops listening at once, for example when leaving Find or changing the voice setting. The list is kept. */
export function stopLive(): void {
  run++;
  clearInterval(ticker);
  session?.cancel();
  session = null;
  ui.find.live.phase = 'off';
}

function finish(host: LiveHost, message: string, error = false): void {
  const live = ui.find.live;
  if (live.phase === 'off') return;
  clearInterval(ticker);
  session = null;
  live.phase = 'off';
  host.render();
  host.status(message, error);
  focus('[data-action="live-start"]');
}
const summary = () => {
  const n = ui.find.live.detections.length;
  return `Live listening stopped. ${n ? `${n} verse${n === 1 ? '' : 's'} heard.` : 'No verses were heard.'}`;
};

/** Updates the list in place, so the Stop button keeps focus and the page does not jump. */
function showList(): void {
  const list = document.querySelector('#live-list');
  if (list) list.outerHTML = liveList();
}

async function begin(host: LiveHost): Promise<void> {
  const live = ui.find.live;
  const model = privateModel();
  const mine = ++run;
  live.phase = 'starting';
  host.render();
  host.status('Starting live listening…');
  let voice: typeof import('./voice/voice');
  let detector: LiveDetector;
  let names: Map<string, string>;
  try {
    const [runtime, detect, load] = await Promise.all([import('./voice/voice'), import('./live/detect'), import('./search/load')]);
    voice = runtime;
    const index = await load.loadKeywordIndex();
    detector = new detect.LiveDetector(index, (['webbe', 'bsb', 'kjv'] as const).map(t => (book: string, chapter: number) => readBibleChapter(t, book, chapter)));
    names = new Map((await loadBibleEdition(ui.find.translation)).books.map(b => [b.id, b.name]));
  } catch {
    if (mine === run) finish(host, 'Live listening could not load. Check your connection and try again.', true);
    return;
  }
  if (mine !== run) return;
  let pending = Promise.resolve();
  const seconds = () => Math.floor((Date.now() - live.started) / 1000);
  const hooks: LiveHooks = {
    text: segment => {
      const at = seconds();
      setText('#live-heard', `Heard: “${segment}”`);
      pending = pending.then(async () => {
        const found = await detector.add(segment, at);
        if (mine !== run) return;
        for (const d of found) {
          const end = d.end && d.end !== d.verse ? `–${d.end}` : '';
          const item: LiveItem = { ...d, reference: `${names.get(d.book) ?? d.book} ${d.chapter}:${d.verse}${end}` };
          live.detections.push(item);
          showList();
          host.status(`Heard ${item.reference} (${d.how === 'quote' ? 'quoted' : 'referenced'}).`);
        }
      }).catch(() => undefined);
    },
    interim: text => { if (text) setText('#live-heard', `Hearing: “${text}”`); },
    working: busy => setText('#live-working', busy ? 'Turning speech into text on this device…' : ''),
    error: message => { if (mine === run) finish(host, `${message} ${summary()}`, true); },
    ended: () => { if (mine === run) void pending.then(() => finish(host, summary())); },
  };
  try {
    session = model ? await voice.livePrivately(model, hooks) : voice.liveWithBrowser(hooks);
  } catch (error) {
    if (mine === run) finish(host, error instanceof Error ? error.message : 'Live listening could not start. Please try again.', true);
    return;
  }
  if (mine !== run) { session?.cancel(); session = null; return; }
  live.phase = 'on';
  live.started = Date.now();
  ticker = setInterval(() => {
    const elapsed = Date.now() - live.started;
    setText('#live-time', clock(elapsed));
    if (elapsed >= LIVE_LIMIT_MS) stop(host, 'Live listening stopped after 90 minutes.');
  }, 1000);
  host.render();
  host.status(model
    ? 'Live listening on this device. Verses that are quoted or referenced will appear below.'
    : 'Live listening with the browser speech service. Verses that are quoted or referenced will appear below.');
  focus('[data-action="live-stop"]');
}

function stop(host: LiveHost, reason = ''): void {
  const live = ui.find.live;
  if (live.phase !== 'on' && live.phase !== 'starting') return;
  clearInterval(ticker);
  const current = session;
  if (!current) { run++; return finish(host, reason || summary()); }
  // Private voice still turns the last piece of audio into text; `ended` reports once it is done.
  current.stop();
  if (!privateModel()) return;
  setText('#live-working', 'Finishing the last few seconds…');
  if (reason) host.status(reason);
}

async function start(host: LiveHost, agreed: boolean): Promise<void> {
  const live = ui.find.live;
  if (live.phase === 'on' || live.phase === 'starting') return;
  let voice: typeof import('./voice/voice');
  try { voice = await import('./voice/voice'); }
  catch { return host.status('Live listening could not load. Check your connection, or type instead.', true); }
  const model = privateModel();
  if (!model) {
    if (!voice.browserSpeechSupported()) return host.status('This browser has no speech service. Choose private voice in Settings to listen live on this device.', true);
    if (!agreed) {
      live.phase = 'consent';
      host.render();
      host.status('Live listening uses your browser’s speech service. Read the note, then start or cancel.');
      return focus('[data-action="live-agree"]');
    }
  } else {
    if (!voice.privateVoiceSupported()) return host.status('Private voice is not supported in this browser. Choose the browser speech service in Settings.', true);
    let downloaded = false;
    try { downloaded = await voice.privateDownloaded(model); }
    catch (error) { return host.status(error instanceof Error ? error.message : 'Private voice could not start.', true); }
    ui.find.voice.downloaded = downloaded;
    if (!downloaded) {
      ui.find.voice.phase = 'consent';
      host.render();
      host.status(`Live listening on this device needs private voice, a one-time download of about ${privateSize(model)}. Download it, then start live listening again.`);
      return focus('[data-action="voice-download"]');
    }
  }
  stopVoice();
  return begin(host);
}

export async function liveAction(action: string, host: LiveHost): Promise<void> {
  const live = ui.find.live;
  switch (action) {
    case 'live-start': return start(host, false);
    case 'live-agree': return start(host, true);
    case 'live-cancel':
      live.phase = 'off';
      host.render();
      host.status('Live listening was not started.');
      return focus('[data-action="live-start"]');
    case 'live-stop': return stop(host);
    case 'live-clear':
      live.detections = [];
      host.render();
      host.status('The list of heard verses was cleared.');
      return focus('[data-action="live-start"]');
  }
}

/** Shows the full verse for a detection in the search results. */
export function showDetection(index: number, host: LiveHost): void {
  const item = ui.find.live.detections[index];
  if (item) host.search(item.reference.replace('–', '-'));
}
