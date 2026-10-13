import type { Preferences } from './store';

export type Mode = 'light' | 'dark';
export type Accent = Preferences['accent'];
export type Font = Preferences['font'];

/** Base surfaces and text for each colour mode. Every pair used for text is checked by the WCAG test. */
export const base: Record<Mode, Record<string, string>> = {
  light: {
    'color-scheme': 'light',
    '--cp-bg': '#f7f4ef',
    '--cp-bg-elevated': '#fcfbf8',
    '--cp-surface': '#ffffff',
    '--cp-surface-soft': '#f3f1ec',
    '--cp-border': '#dedad2',
    '--cp-border-strong': '#8a857c',
    '--cp-text': '#23211e',
    '--cp-text-muted': '#55524c',
    '--cp-text-soft': '#66625b',
    '--cp-success': '#15803d',
    '--cp-danger': '#c81e1e',
    '--cp-warning': '#a15c07',
    '--cp-link': '#0b5cad',
    '--cp-shadow': '0 18px 48px rgba(35, 33, 30, 0.10)',
    '--cp-overlay': 'rgba(247, 244, 239, 0.82)',
  },
  dark: {
    'color-scheme': 'dark',
    '--cp-bg': '#1f1d1b',
    '--cp-bg-elevated': '#262422',
    '--cp-surface': '#2b2927',
    '--cp-surface-soft': '#33302d',
    '--cp-border': '#45413c',
    '--cp-border-strong': '#857f76',
    '--cp-text': '#ece8e1',
    '--cp-text-muted': '#bdb7ad',
    '--cp-text-soft': '#aaa49a',
    '--cp-success': '#4ade80',
    '--cp-danger': '#f87171',
    '--cp-warning': '#fbbf24',
    '--cp-link': '#8cc4ff',
    '--cp-shadow': '0 18px 48px rgba(0, 0, 0, 0.36)',
    '--cp-overlay': 'rgba(20, 19, 18, 0.86)',
  },
};

interface AccentTone { accent: string; hover: string; fg: string }
/** Accent colours. Older saved accents keep their exact hex values. */
export const accents: Record<Accent, { label: string; light: AccentTone; dark: AccentTone }> = {
  teal: { label: 'Still waters (teal)', light: { accent: '#0f6b66', hover: '#0b5551', fg: '#ffffff' }, dark: { accent: '#7fd6cc', hover: '#a7e6de', fg: '#1a1a1a' } },
  amber: { label: 'Harvest (amber)', light: { accent: '#8a4b08', hover: '#6f3c06', fg: '#ffffff' }, dark: { accent: '#f0b86a', hover: '#f6cf97', fg: '#1a1a1a' } },
  rose: { label: 'Rose', light: { accent: '#b11f4b', hover: '#9a1a41', fg: '#ffffff' }, dark: { accent: '#fd8ea1', hover: '#fb7b91', fg: '#1a1a1a' } },
  purple: { label: 'Purple', light: { accent: '#6d28d9', hover: '#5b21b6', fg: '#ffffff' }, dark: { accent: '#c4b5fd', hover: '#ddd6fe', fg: '#1a1a1a' } },
  blue: { label: 'Blue', light: { accent: '#1d4ed8', hover: '#1e40af', fg: '#ffffff' }, dark: { accent: '#93c5fd', hover: '#bfdbfe', fg: '#1a1a1a' } },
  green: { label: 'Green', light: { accent: '#166534', hover: '#14532d', fg: '#ffffff' }, dark: { accent: '#86efac', hover: '#bbf7d0', fg: '#1a1a1a' } },
  neutral: {
    label: 'Neutral',
    light: { accent: base.light['--cp-text'], hover: base.light['--cp-text-muted'], fg: base.light['--cp-surface'] },
    dark: { accent: base.dark['--cp-text'], hover: base.dark['--cp-text-muted'], fg: base.dark['--cp-surface'] },
  },
};

const sans = '"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
const serif = 'Georgia, "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Cambria, "Times New Roman", serif';
/** UI, display (headings) and scripture font stacks. Legacy fonts apply to the whole app. */
export const fonts: Record<Font, { label: string; ui: string; display: string; scripture: string }> = {
  serif: { label: 'Classic (serif scripture, clean interface)', ui: sans, display: serif, scripture: serif },
  readable: {
    label: 'Readable (dyslexia-friendly)',
    ui: '"Atkinson Hyperlegible", Lexend, Verdana, Tahoma, "Segoe UI", sans-serif',
    display: '"Atkinson Hyperlegible", Lexend, Verdana, Tahoma, "Segoe UI", sans-serif',
    scripture: '"Atkinson Hyperlegible", Lexend, Verdana, Tahoma, "Segoe UI", sans-serif',
  },
  segoe: { label: 'Segoe UI', ui: '"Segoe UI", Aptos, Calibri, -apple-system, BlinkMacSystemFont, sans-serif', display: '', scripture: '' },
  aptos: { label: 'Aptos', ui: 'Aptos, "Segoe UI", Calibri, sans-serif', display: '', scripture: '' },
  calibri: { label: 'Calibri', ui: 'Calibri, "Segoe UI", Aptos, sans-serif', display: '', scripture: '' },
  mono: { label: 'Consolas', ui: 'Consolas, "Courier New", Courier, monospace', display: '', scripture: '' },
};

const hex = (value: string) => value.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu)!.slice(1).map(part => parseInt(part, 16));
export const rgba = (value: string, alpha: number) => `rgba(${hex(value).join(', ')}, ${alpha})`;

export function accentTokens(mode: Mode, accent: Accent): Record<string, string> {
  const tone = accents[accent][mode];
  const softAlpha = mode === 'light' ? 0.08 : 0.14;
  return {
    '--cp-accent': tone.accent,
    '--cp-accent-hover': tone.hover,
    '--cp-accent-fg': tone.fg,
    '--cp-accent-soft': accent === 'neutral' ? base[mode]['--cp-surface-soft'] : rgba(tone.accent, softAlpha),
    '--cp-highlight': accent === 'neutral' ? base[mode]['--cp-border'] : rgba(tone.accent, 0.12),
    '--cp-focus': tone.accent,
  };
}

const block = (selector: string, tokens: Record<string, string>) =>
  `${selector} {\n${Object.entries(tokens).map(([key, value]) => `  ${key}: ${value};`).join('\n')}\n}`;

/** All theme, accent and font rules, generated from the data above. */
export function themeCss(): string {
  const rules: string[] = [];
  for (const mode of ['light', 'dark'] as const) {
    rules.push(block(`html[data-theme="${mode}"]`, base[mode]));
    for (const accent of Object.keys(accents) as Accent[]) {
      rules.push(block(`html[data-theme="${mode}"][data-accent="${accent}"]`, accentTokens(mode, accent)));
    }
  }
  for (const [font, stack] of Object.entries(fonts)) {
    rules.push(block(`html[data-font="${font}"]`, {
      '--font-ui': stack.ui,
      '--font-display': stack.display || stack.ui,
      '--font-scripture': stack.scripture || stack.ui,
    }));
  }
  return rules.join('\n');
}

export function installTheme(doc: Document = document): void {
  if (doc.getElementById('theme-tokens')) return;
  const style = doc.createElement('style');
  style.id = 'theme-tokens';
  style.textContent = themeCss();
  doc.head.append(style);
}

const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
export const luminance = ([r, g, b]: number[]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
export function contrast(a: string | number[], b: string | number[]): number {
  const x = luminance(typeof a === 'string' ? hex(a) : a), y = luminance(typeof b === 'string' ? hex(b) : b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** Composite a translucent colour over an opaque background, as rendered. */
export function over(color: string, alpha: number, background: string): number[] {
  const top = hex(color), bottom = hex(background);
  return top.map((value, i) => value * alpha + bottom[i] * (1 - alpha));
}
