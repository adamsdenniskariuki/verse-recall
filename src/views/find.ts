import { escapeHtml as e } from '../html';
import { DEFAULT_OPEN_IN, openInLinks } from '../open-in';
import { ui } from '../ui';
import { loadStatus } from './home';
import { privateModel, privateSize } from '../find-voice';
import { MODELS } from '../voice/models';
import { EMBEDDING, meaningSize } from '../semantic/models';
import { TOPICS } from '../search/topic-data';

const STRATEGY: Record<string, string> = { reference: 'Reference', keyword: 'Keywords', meaning: 'Meaning', topic: 'Topic' };
const TRANSLATIONS = [['webbe', 'WEB British'], ['bsb', 'BSB'], ['kjv', 'KJV']] as const;
const EXAMPLES = ['lamp for my feet', 'John three sixteen', '1 Cor 13 4', 'the Lord is my shepherd', 'do not be anxious about anything'];

/** A plain-HTML diagram so it reads well with screen readers and in every theme. */
const diagram = () => `<details class="find-help"><summary>How Find a verse works</summary>
  <ol class="find-diagram" aria-label="How Find a verse works">
    <li><strong>You type or speak</strong><span>A reference, a remembered phrase, a few words, or a topic such as “verses about anxiety”. Speech becomes text you can check and edit first.</span></li>
    <li><strong>Three searches</strong><span><b>Reference</b> reads “John three sixteen” or “1 Cor 13 4”. <b>Keywords</b> forgive typos, sound-alike words and old forms such as “thee” and “hath”. <b>Meaning</b> (optional download) finds verses that say the same thing in other words, such as “lamp for my feet”. A topic question also brings Verse Recall’s own list of verses on that topic.</span></li>
    <li><strong>Ranked results</strong><span>Matches are merged. A verse found by more than one search ranks higher. Each shows how it was found.</span></li>
  </ol>
  <p class="small">Live mode keeps listening, for example during a sermon or Bible study, and lists each verse that is quoted or referenced. It turns each piece of speech into text, runs the reference and keyword searches on it, and keeps only close, in-order quotes. Audio is never stored.</p>
  <p class="small">Voice: the browser speech service may send audio to its provider (in Chrome, to Google). Private voice runs Whisper on this device after a one-time download, and audio is never uploaded or saved.</p>
  <p class="small">Search runs on this device. The search index is downloaded once (about 0.6 MB), checked for integrity and kept for offline use. Meaning search uses a small embedding model on this device after a one-time download; your words are never sent anywhere. Searches are saved only on this device and in your backups.</p></details>`;

/** Offers the optional meaning search download, shows its progress, or notes that it is on. */
function meaningPanel(): string {
  const meaning = ui.find.meaning;
  const size = meaningSize();
  if (meaning.phase === 'consent') return `<section class="voice-panel meaning-panel" aria-labelledby="meaning-consent-title">
    <h2 id="meaning-consent-title">Download meaning search?</h2>
    <p class="small">A one-time download of about <strong>${size}</strong>: the ${e(EMBEDDING.label)} model from Hugging Face, the ONNX runtime from jsDelivr (shared with private voice) and Verse Recall’s verse vectors. Every file is checked against a fixed fingerprint and kept on this device, so it also works offline. Your searches never leave this device.</p>
    <div class="actions"><button type="button" class="primary" data-action="meaning-download">Download ${size}</button><button type="button" data-action="meaning-cancel">Not now</button></div></section>`;
  if (meaning.phase === 'downloading') {
    const percent = Math.floor(meaning.progress * 100);
    return `<section class="voice-panel meaning-panel" aria-label="Meaning search download">
    <label for="meaning-progress">Downloading meaning search (${size})</label>
    <div class="voice-progress"><progress id="meaning-progress" max="100" value="${percent}"></progress><span id="meaning-progress-text">${percent}%</span></div>
    <button type="button" data-action="meaning-cancel">Cancel download</button></section>`;
  }
  if (meaning.downloaded) return `<p class="small meaning-note">Meaning search is on, private and available offline. <button type="button" class="text-button" data-action="meaning-remove">Remove download</button></p>`;
  return `<p class="small meaning-note">Remember the idea but not the words? <button type="button" class="text-button" data-action="meaning-offer">Turn on meaning search</button> (one-time download, about ${size}).</p>`;
}

function result(index: number): string {
  const f = ui.find.found![index];
  const shown = ui.find.shown[index];
  if (!shown) return '';
  const id = `find-result-${index}`;
  const text = shown.parts.length
    ? shown.parts.map(p => p.mark ? `<mark>${e(p.text)}</mark>` : e(p.text)).join('')
    : '<span class="muted">This verse is not available in this translation, or could not be loaded offline. Try another translation.</span>';
  const context = shown.before.length || shown.after.length ? `<details class="find-context"><summary>Show nearby verses</summary>
    ${shown.before.map(v => `<p><sup>${v.verse}</sup> ${e(v.text)}</p>`).join('')}
    <p class="current"><sup>${f.verse}</sup> ${shown.parts.map(p => e(p.text)).join('')}</p>
    ${shown.after.map(v => `<p><sup>${v.verse}</sup> ${e(v.text)}</p>`).join('')}</details>` : '';
  const share = typeof navigator.share === 'function' ? `<button data-find-share="${index}" aria-label="Share ${e(shown.reference)}">Share</button>` : '';
  return `<li><article class="find-result" aria-labelledby="${id}">
    <div class="find-result-head"><h3 id="${id}">${e(shown.reference)}</h3>
    <span class="find-score"><span>${Math.round(f.confidence * 100)}% match</span> · ${f.strategies.map(s => e(STRATEGY[s] ?? s)).join(' + ')}</span></div>
    <blockquote class="find-text">${text}</blockquote>${context}
    <div class="find-actions">
      <button class="primary" data-find-practise="${index}" ${shown.parts.length ? '' : 'disabled'}>Practise</button>
      <button data-find-add="${index}" ${shown.parts.length ? '' : 'disabled'} aria-label="Add to my verses: ${e(shown.reference)}">Add to my verses</button>
      <button data-find-open="${index}" aria-label="Open in reader: ${e(shown.reference)}">Open in reader</button>
      <button data-find-copy="${index}" ${shown.parts.length ? '' : 'disabled'} aria-label="Copy ${e(shown.reference)}">Copy</button>${share}
    </div>${openInLinks(shown.reference, ui.state.preferences.openIn ?? DEFAULT_OPEN_IN)}</article></li>`;
}

const MIC = '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"/></svg>';
const speechService = () => 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;

function micButton(): string {
  const { phase } = ui.find.voice;
  const listening = phase === 'listening';
  const busy = phase === 'downloading' || phase === 'preparing' || phase === 'transcribing';
  return `<button type="button" class="mic${listening ? ' recording' : ''}" data-action="find-voice" aria-label="${listening ? 'Stop listening' : 'Speak your search'}"
    ${busy ? 'aria-disabled="true"' : ''}>${MIC}<span>${listening ? 'Stop' : 'Speak'}</span></button>`;
}

/** Explains where audio goes for the chosen engine, plus any download step for private voice. */
function voicePanel(): string {
  const voice = ui.find.voice;
  const model = privateModel();
  const indicator = voice.phase === 'listening'
    ? `<p class="voice-live"><span class="rec-dot" aria-hidden="true"></span><strong>${model ? 'Recording on this device' : 'Listening'}</strong> · audio is never saved</p>`
    : voice.phase === 'preparing' || voice.phase === 'transcribing' ? '<p class="voice-live working"><strong>Turning speech into text…</strong></p>' : '';
  if (!model) return `${indicator}<p class="small voice-note">${speechService()
    ? 'Voice uses your browser’s speech service, which may send your audio to its provider. In Chrome, audio goes to Google.'
    : 'This browser has no speech service.'} For private voice that stays on this device, choose it in <button type="button" class="text-button" data-action="preferences">Settings</button>.</p>`;
  const size = privateSize(model);
  const note = `<p class="small voice-note">Private voice · ${e(MODELS[model].label)}. It runs on this device and your audio is never uploaded. ${voice.downloaded
    ? 'Downloaded and available offline. <button type="button" class="text-button" data-action="voice-remove">Remove download</button>'
    : voice.downloaded === false ? `Needs a one-time download of about ${size}.` : ''}</p>`;
  if (voice.phase === 'consent') return `${note}<section class="voice-panel" aria-labelledby="voice-consent-title">
    <h2 id="voice-consent-title">Download private voice?</h2>
    <p class="small">A one-time download of about <strong>${size}</strong>: the Whisper speech model from Hugging Face and the ONNX speech runtime from jsDelivr. Every file is checked against a fixed fingerprint and kept on this device, so voice also works offline. Your audio is never uploaded.</p>
    <div class="actions"><button type="button" class="primary" data-action="voice-download">Download ${size}</button><button type="button" data-action="voice-cancel">Not now</button></div></section>`;
  if (voice.phase === 'downloading') {
    const percent = Math.floor(voice.progress * 100);
    return `${note}<section class="voice-panel" aria-label="Private voice download">
    <label for="voice-progress">Downloading private voice (${size})</label>
    <div class="voice-progress"><progress id="voice-progress" max="100" value="${percent}"></progress><span id="voice-progress-text">${percent}%</span></div>
    <button type="button" data-action="voice-cancel">Cancel download</button></section>`;
  }
  return indicator + note;
}

export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const two = (n: number) => String(n).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}` : `${two(Math.floor(s / 60))}:${two(s % 60)}`;
};

/** Verses heard in live mode, newest first. Re-rendered in place as verses arrive. */
export function liveList(): string {
  const { detections, phase } = ui.find.live;
  const items = detections.map((d, i) => `<li><div class="live-item-head"><strong>${e(d.reference)}</strong>
    <span class="live-how">${d.how === 'quote' ? 'Quoted' : 'Referenced'} · ${clock(d.at * 1000)}</span></div>
    <p class="small muted">“${e(d.heard)}”</p>
    <button type="button" data-live-show="${i}" aria-label="Show ${e(d.reference)}">Show</button></li>`).reverse().join('');
  return `<ol id="live-list" class="live-list" aria-label="Verses heard">${items || (phase === 'off' ? '' : '<li class="live-empty muted">No verses yet. They appear here as they are quoted or referenced.</li>')}</ol>`;
}

/** Live mode: an offer, a consent note for the browser speech service, or the listening indicator and list. */
function livePanel(): string {
  const live = ui.find.live;
  const model = privateModel();
  const list = live.detections.length ? `${liveList()}<button type="button" class="text-button" data-action="live-clear">Clear list</button>` : '';
  if (live.phase === 'consent') return `<section class="voice-panel live-panel" aria-labelledby="live-consent-title">
    <h2 id="live-consent-title">Listen live with the browser speech service?</h2>
    <p class="small">Until you stop, everything the microphone hears is sent to your browser’s speech service to be turned into text. <strong>In Chrome, audio goes to Google.</strong> Verse Recall never stores audio. For live listening that stays on this device, choose private voice in <button type="button" class="text-button" data-action="preferences">Settings</button>.</p>
    <div class="actions"><button type="button" class="primary" data-action="live-agree">Start live listening</button><button type="button" data-action="live-cancel">Not now</button></div></section>`;
  if (live.phase === 'starting' || live.phase === 'on') return `<section class="voice-panel live-panel listening" aria-labelledby="live-title">
    <div class="live-bar"><p class="voice-live" id="live-title"><span class="rec-dot" aria-hidden="true"></span><strong>Listening live</strong>
      · <span id="live-time">${live.phase === 'on' ? clock(Date.now() - live.started) : 'starting'}</span> · audio is never stored</p>
    <button type="button" class="primary" data-action="live-stop">Stop live listening</button></div>
    <p class="small muted" id="live-heard"></p><p class="small" id="live-working"></p>
    ${liveList()}</section>`;
  return `<section class="live-panel" aria-labelledby="live-offer-title"><h2 id="live-offer-title" class="small">Live mode</h2>
    <p class="small">Listening to a sermon or Bible study? Live mode lists each verse that is quoted or referenced. ${model
      ? 'It uses private voice on this device.' : 'It uses your browser’s speech service.'} Audio is never stored.</p>
    <button type="button" data-action="live-start">Start live listening</button>${list}</section>`;
}

const topics = () => `<details class="find-topics"><summary>Browse topics</summary>
  <div class="find-chips">${TOPICS.map(t => `<button class="chip" data-find-query="verses about ${e(t.title.toLowerCase())}">${e(t.title)}</button>`).join('')}</div>
  <p class="small muted">Topic lists are Verse Recall’s own selection of well-loved verses.</p></details>`;

export function findView(): string {
  const find = ui.find;
  const history = ui.state.searches ?? [];
  const results = find.found === null ? ''
    : find.found.length === 0 ? '<p class="empty-state">No verses matched. Try fewer words, a different phrase, or a reference such as “Romans 8:28”.</p>'
    : `<ol class="find-results" aria-label="Search results">${find.found.map((_, i) => result(i)).join('')}</ol>`;
  return `<header class="page-head"><p class="eyebrow">FIND A VERSE</p><h1 id="page-title" tabindex="-1">What do you remember?</h1>
    <p class="muted">Type or speak a reference, a phrase you half-remember, or a few words. Verse Recall searches the WEB British, BSB and KJV on this device.</p></header>
    <form class="find-form" role="search" aria-label="Find a verse" data-find-form>
      <label for="find-query">Words, phrase or reference</label>
      <div class="find-row"><input id="find-query" type="search" name="q" autocomplete="off" spellcheck="false" maxlength="200" value="${e(find.query)}" placeholder="For example, a lamp for my feet">
      ${micButton()}<button class="primary" type="submit" ${find.busy ? 'aria-disabled="true"' : ''}>Search</button></div>
    </form>${voicePanel()}${meaningPanel()}
    <div class="find-chips" aria-label="Examples"><span class="small">Try</span>${EXAMPLES.map(q => `<button class="chip" data-find-query="${e(q)}">${e(q)}</button>`).join('')}</div>
    ${topics()}
    ${history.length ? `<section class="find-history" aria-labelledby="find-history-title"><h2 id="find-history-title" class="small">Recent searches</h2>
      <div class="find-chips">${history.slice(0, 8).map(q => `<button class="chip" data-find-query="${e(q)}">${e(q)}</button>`).join('')}
      <button class="text-button" data-action="find-clear-history">Clear history</button></div></section>` : ''}
    ${livePanel()}
    <div class="find-toolbar"><div class="segmented" role="group" aria-label="Show results in">${TRANSLATIONS.map(([id, name]) =>
      `<button data-find-translation="${id}" aria-pressed="${find.translation === id}">${name}</button>`).join('')}</div></div>
    <p id="find-status" class="load-status${find.status?.error ? ' error' : ''}" role="status" aria-live="polite">${e(find.status?.message ?? '')}</p>${loadStatus()}
    ${results}${diagram()}`;
}
