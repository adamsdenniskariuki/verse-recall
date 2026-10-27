// Voice input for Find a verse. Loaded only when someone taps Speak or uses private voice.
// Audio is held in memory just long enough to turn it into text and is never stored.
import { VOICE_CACHE, type PrivateModel } from './models';
import type { VoiceReply, VoiceRequest } from './whisper.worker';

export interface Listening { stop(): void; cancel(): void }
export interface VoiceHooks {
  /** The words heard so far, while still listening. */
  interim(text: string): void;
  /** The finished transcript. Empty when nothing was heard. */
  final(text: string): void;
  phase(phase: 'listening' | 'preparing' | 'transcribing'): void;
  error(message: string): void;
}

/** The longest private recording. Whisper reads 30 seconds at a time. */
export const MAX_RECORDING_MS = 30_000;

interface Recognition extends EventTarget {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionConstructor = new () => Recognition;
const speechApi = () => {
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};
export const browserSpeechSupported = () => typeof speechApi() === 'function';
export const privateVoiceSupported = () => Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder === 'function' &&
  typeof Worker === 'function' && typeof WebAssembly === 'object' && 'caches' in window;

const BLOCKED = 'Microphone access is blocked. Allow the microphone for this site in your browser settings, or type instead.';
export function speechError(code: string): string {
  switch (code) {
    case 'not-allowed': case 'service-not-allowed': case 'NotAllowedError': case 'SecurityError': return BLOCKED;
    case 'no-speech': return 'Nothing was heard. Tap Speak and try again, a little closer to the microphone.';
    case 'audio-capture': case 'NotFoundError': case 'OverconstrainedError': return 'No microphone was found. Connect one, or type instead.';
    case 'NotReadableError': return 'The microphone is being used by another app. Close it, or type instead.';
    case 'network': return 'The browser speech service could not be reached. Check your connection, or choose private voice in Settings.';
    case 'language-not-supported': return 'The browser speech service does not support English here. Choose private voice in Settings, or type instead.';
    default: return 'Voice input stopped unexpectedly. Please try again, or type instead.';
  }
}

/** Browser speech service (Web Speech API). The browser may send audio to its provider; Chrome sends it to Google. */
export function listenWithBrowser(hooks: VoiceHooks): Listening {
  const Api = speechApi();
  if (!Api) throw new Error('This browser has no speech service. Choose private voice in Settings, or type instead.');
  const recognition = new Api();
  recognition.lang = 'en-GB';
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;
  let heard = '';
  let finished = false;
  recognition.onresult = event => {
    heard = Array.from(event.results, result => result[0].transcript).join('').replace(/\s+/g, ' ').trim();
    hooks.interim(heard);
  };
  recognition.onerror = event => {
    if (finished) return;
    finished = true;
    if (event.error === 'aborted') return;
    hooks.error(speechError(event.error));
  };
  recognition.onend = () => {
    if (finished) return;
    finished = true;
    hooks.final(heard);
  };
  recognition.start();
  hooks.phase('listening');
  return { stop: () => recognition.stop(), cancel: () => { finished = true; recognition.abort(); } };
}

let worker: Worker | null = null;
function voiceWorker(): Worker {
  worker ??= new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module', name: 'verse-recall-voice' });
  return worker;
}
/** Sends one request to the private voice worker and resolves with its final reply. */
function ask(request: VoiceRequest, update?: (reply: VoiceReply) => void, transfer: Transferable[] = []): Promise<VoiceReply> {
  const w = voiceWorker();
  return new Promise((resolve, reject) => {
    const done = (reply: VoiceReply) => { w.removeEventListener('message', listen); w.removeEventListener('error', fail); resolve(reply); };
    const listen = (event: MessageEvent<VoiceReply>) => {
      const reply = event.data;
      if (reply.type === 'progress' || reply.type === 'preparing') update?.(reply);
      else done(reply);
    };
    const fail = (event: ErrorEvent) => {
      event.preventDefault();
      w.removeEventListener('message', listen);
      w.removeEventListener('error', fail);
      worker = null;
      reject(new Error('Private voice could not start in this browser. Type instead, or choose the browser speech service in Settings.'));
    };
    w.addEventListener('message', listen);
    w.addEventListener('error', fail);
    w.postMessage(request, transfer);
  });
}
const unwrap = (reply: VoiceReply) => { if (reply.type === 'error') throw new Error(reply.message); return reply; };

/** Whether every private voice file for this model is on the device. Full integrity checks run before each use. */
export async function privateDownloaded(model: PrivateModel): Promise<boolean> {
  const reply = unwrap(await ask({ type: 'check', model }));
  return reply.type === 'status' && reply.downloaded;
}
export async function downloadPrivate(model: PrivateModel, progress: (loaded: number, total: number) => void): Promise<void> {
  unwrap(await ask({ type: 'download', model }, reply => { if (reply.type === 'progress') progress(reply.loaded, reply.total); }));
}
/** Stops any download in progress. */
export function cancelPrivate(): void {
  worker?.terminate();
  worker = null;
}
export async function removePrivate(): Promise<void> {
  cancelPrivate();
  await caches.delete(VOICE_CACHE);
}

/** Decodes a recording to 16 kHz mono samples, the format Whisper expects. */
async function samples(recording: Blob): Promise<Float32Array> {
  const context = new AudioContext({ sampleRate: 16_000 });
  try {
    const audio = await context.decodeAudioData(await recording.arrayBuffer());
    const mono = new Float32Array(audio.length);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const channel = audio.getChannelData(c);
      for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / audio.numberOfChannels;
    }
    return mono;
  } finally { void context.close(); }
}

/** Private voice: records until stopped (or 30 seconds), then transcribes on this device. */
export async function listenPrivately(model: PrivateModel, hooks: VoiceHooks): Promise<Listening> {
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); }
  catch (error) { throw new Error(speechError(error instanceof DOMException ? error.name : '')); }
  const recorder = new MediaRecorder(stream);
  let chunks: Blob[] = [];
  let cancelled = false;
  const release = () => { clearTimeout(limit); stream.getTracks().forEach(track => track.stop()); };
  const limit = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, MAX_RECORDING_MS);
  recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
  recorder.addEventListener('stop', async () => {
    release();
    const recording = new Blob(chunks, { type: recorder.mimeType });
    chunks = [];
    if (cancelled) return;
    hooks.phase('transcribing');
    try {
      if (!recording.size) return hooks.final('');
      const audio = await samples(recording);
      const reply = unwrap(await ask({ type: 'transcribe', model, audio }, r => { if (r.type === 'preparing') hooks.phase('preparing'); }, [audio.buffer]));
      hooks.final(reply.type === 'text' ? reply.text : '');
    } catch (error) {
      hooks.error(error instanceof Error ? error.message : 'Private voice could not understand the recording. Please try again.');
    }
  });
  recorder.start();
  hooks.phase('listening');
  return {
    stop: () => { if (recorder.state === 'recording') recorder.stop(); },
    cancel: () => { cancelled = true; if (recorder.state === 'recording') recorder.stop(); else release(); },
  };
}
