import { escapeHtml as e } from './html';

/** Translations we link to but never bundle or cache. Bible Gateway hosts them under their own licences. */
export const OPEN_IN = ['NKJV', 'AMP', 'MSG', 'NLT', 'ESV'] as const;
export type OpenIn = typeof OPEN_IN[number];
export const DEFAULT_OPEN_IN: OpenIn = 'NKJV';
export const OPEN_IN_NAMES: Record<OpenIn, string> = {
  NKJV: 'New King James Version', AMP: 'Amplified Bible', MSG: 'The Message', NLT: 'New Living Translation', ESV: 'English Standard Version',
};

export function gatewayUrl(reference: string, version: OpenIn): string {
  const search = reference.replace(/[–—]/gu, '-').replace(/\s+/gu, ' ').trim();
  return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(search)}&version=${version}`;
}

/** The preferred version is listed first; the order of the rest never changes. */
export function openInLinks(reference: string, preferred: OpenIn = DEFAULT_OPEN_IN): string {
  const order = [preferred, ...OPEN_IN.filter(v => v !== preferred)];
  return `<p class="open-in small"><span>Open in</span> ${order.map(v =>
    `<a href="${e(gatewayUrl(reference, v))}" target="_blank" rel="noopener noreferrer" aria-label="Open ${e(reference)} in the ${v} (${OPEN_IN_NAMES[v]}) on Bible Gateway (opens in a new tab)">${v} <span aria-hidden="true">↗</span></a>`).join(' ')}
    <span class="open-in-note">on Bible Gateway. Text is not stored in Verse Recall.</span></p>`;
}
