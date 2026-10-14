/** Optional read-aloud through the browser's own speech engine. Nothing is sent to a server by this app. */
let active: SpeechSynthesisUtterance | null = null;

export const canSpeak = (): boolean =>
  typeof window !== 'undefined' && typeof window.speechSynthesis?.speak === 'function' && typeof window.SpeechSynthesisUtterance === 'function';
export const speaking = (): boolean => active !== null;

export function stopSpeaking(): void {
  if (!canSpeak()) return;
  active = null;
  window.speechSynthesis.cancel();
}

/** Reads the text aloud in British English; `done` runs when it ends or is stopped. */
export function speak(text: string, done: () => void): void {
  if (!canSpeak()) return;
  stopSpeaking();
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = 'en-GB';
  utterance.rate = 0.9;
  const voice = window.speechSynthesis.getVoices().find(v => v.lang === 'en-GB') ?? window.speechSynthesis.getVoices().find(v => v.lang.startsWith('en'));
  if (voice) utterance.voice = voice;
  const end = () => {
    if (active !== utterance) return;
    active = null;
    done();
  };
  utterance.onend = end;
  utterance.onerror = end;
  active = utterance;
  window.speechSynthesis.speak(utterance);
}
