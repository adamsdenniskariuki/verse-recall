// Voice input for Find a verse. This controller is small; the voice engines load only when first used.
import { ui } from './ui';
import { downloadBytes, megabytes, type PrivateModel } from './voice/models';
import type { Listening, VoiceHooks } from './voice/voice';

export interface VoiceHost {
  /** Shows and announces a Find status message (re-renders the view). */
  status(message: string, error?: boolean): void;
  render(): void;
}

type VoiceRuntime = typeof import('./voice/voice');
let loading: Promise<VoiceRuntime> | null = null;
function runtime(): Promise<VoiceRuntime> {
  loading ??= import('./voice/voice');
  loading.catch(() => { loading = null; });
  return loading;
}
let session: Listening | null = null;

export const voiceEngine = () => ui.state.preferences.voice ?? 'browser';
export const privateModel = (): PrivateModel | null => { const engine = voiceEngine(); return engine === 'browser' ? null : engine; };
export const privateSize = (model: PrivateModel) => megabytes(downloadBytes(model));
const focus = (selector: string) => document.querySelector<HTMLElement>(selector)?.focus();

/** Learns whether the chosen private model is already on this device, for the note under the search box. */
export async function refreshVoice(host: VoiceHost): Promise<void> {
  const model = privateModel();
  if (!model) return;
  try {
    const r = await runtime();
    if (!r.privateVoiceSupported()) return;
    const downloaded = await r.privateDownloaded(model);
    if (privateModel() !== model || ui.find.voice.downloaded === downloaded) return;
    ui.find.voice.downloaded = downloaded;
    if (ui.view === 'find') host.render();
  } catch { /* The note simply stays general. */ }
}

/** Stops listening without using what was heard, for example when leaving Find. */
export function stopVoice(): void {
  if (!session) return;
  session.cancel();
  session = null;
  ui.find.voice.phase = 'idle';
}

const PHASE: Record<'listening' | 'preparing' | 'transcribing', () => string> = {
  listening: () => voiceEngine() === 'browser' ? 'Listening. Speak now, then pause or tap Stop.' : 'Recording on this device. Tap Stop when you finish, within 30 seconds.',
  preparing: () => 'Starting private voice on this device…',
  transcribing: () => 'Turning your words into text on this device…',
};

async function listen(host: VoiceHost, begin: (hooks: VoiceHooks) => Listening | Promise<Listening>): Promise<void> {
  const voice = ui.find.voice;
  const before = ui.find.query;
  const end = () => { session = null; voice.phase = 'idle'; };
  const hooks: VoiceHooks = {
    interim: text => {
      ui.find.query = text;
      const input = document.querySelector<HTMLInputElement>('#find-query');
      if (input) input.value = text;
    },
    final: text => {
      end();
      if (!text) {
        ui.find.query = before;
        host.status('Nothing was heard. Tap Speak and try again, or type instead.', true);
        return focus('[data-action="find-voice"]');
      }
      ui.find.query = text;
      host.status(`Heard “${text}”. Edit it if needed, then press Search.`);
      focus('#find-query');
    },
    phase: phase => { voice.phase = phase; host.status(PHASE[phase]()); },
    error: message => {
      end();
      ui.find.query = before;
      host.status(message, true);
      focus('[data-action="find-voice"]');
    },
  };
  try { session = await begin(hooks); }
  catch (error) {
    end();
    host.status(error instanceof Error ? error.message : 'Voice input could not start. Please type instead.', true);
  }
}

async function toggle(host: VoiceHost): Promise<void> {
  const voice = ui.find.voice;
  if (voice.phase === 'listening') return session?.stop();
  if (voice.phase !== 'idle' && voice.phase !== 'consent') return;
  let r: VoiceRuntime;
  try { r = await runtime(); }
  catch { return host.status('Voice input could not load. Check your connection, or type instead.', true); }
  const model = privateModel();
  if (!model) {
    if (!r.browserSpeechSupported()) return host.status('This browser has no speech service. Choose private voice in Settings, or type instead.', true);
    return listen(host, hooks => r.listenWithBrowser(hooks));
  }
  if (!r.privateVoiceSupported()) return host.status('Private voice is not supported in this browser. Type instead, or choose the browser speech service in Settings.', true);
  try { voice.downloaded = await r.privateDownloaded(model); }
  catch (error) { return host.status(error instanceof Error ? error.message : 'Private voice could not start.', true); }
  if (!voice.downloaded) {
    voice.phase = 'consent';
    host.status(`Private voice needs a one-time download of about ${privateSize(model)}. Download it, or type instead.`);
    return focus('[data-action="voice-download"]');
  }
  voice.phase = 'idle';
  return listen(host, hooks => r.listenPrivately(model, hooks));
}

/** Updates the progress bar in place, so the page is not re-rendered for every chunk. */
function showProgress(fraction: number): void {
  const percent = Math.floor(fraction * 100);
  ui.find.voice.progress = fraction;
  const bar = document.querySelector<HTMLProgressElement>('#voice-progress');
  if (bar) bar.value = percent;
  const text = document.querySelector('#voice-progress-text');
  if (text) text.textContent = `${percent}%`;
}

async function download(host: VoiceHost): Promise<void> {
  const model = privateModel();
  const voice = ui.find.voice;
  if (!model || voice.phase === 'downloading') return;
  voice.phase = 'downloading';
  voice.progress = 0;
  host.status(`Downloading private voice, about ${privateSize(model)}. You can keep using Verse Recall.`);
  focus('[data-action="voice-cancel"]');
  try {
    await (await runtime()).downloadPrivate(model, (loaded, total) => showProgress(total ? loaded / total : 0));
    if (voice.phase !== 'downloading') return;
    voice.phase = 'idle';
    voice.downloaded = true;
    host.status('Private voice is ready and kept on this device for offline use. Tap Speak to start.');
    focus('[data-action="find-voice"]');
  } catch (error) {
    if (voice.phase !== 'downloading') return;
    voice.phase = 'consent';
    host.status(error instanceof Error ? error.message : 'The private voice download failed. Please try again.', true);
    focus('[data-action="voice-download"]');
  }
}

export async function voiceAction(action: string, host: VoiceHost): Promise<void> {
  const voice = ui.find.voice;
  switch (action) {
    case 'find-voice': return toggle(host);
    case 'voice-download': return download(host);
    case 'voice-cancel': {
      const downloading = voice.phase === 'downloading';
      if (downloading) (await runtime()).cancelPrivate();
      voice.phase = 'idle';
      host.status(downloading ? 'Download cancelled. Files already checked are kept for next time; private voice stays off until the download finishes.' : 'Private voice was not downloaded. You can type instead.');
      return focus('[data-action="find-voice"]');
    }
    case 'voice-remove': {
      try { await (await runtime()).removePrivate(); }
      catch { return host.status('The private voice download could not be removed. Try clearing site data in your browser.', true); }
      voice.downloaded = false;
      voice.phase = 'idle';
      host.status('Private voice was removed from this device.');
      return focus('[data-action="find-voice"]');
    }
  }
}
