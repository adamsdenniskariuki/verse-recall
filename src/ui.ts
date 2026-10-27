import { createProvider, translationName, type Passage } from './content';
import { selectedBiblePassages } from './bible-catalog';
import type { AppearanceMigration, SavedState } from './store';
import type { Reward } from './journey';
import type { BibleTranslation } from './bible-catalog';
import type { FoundVerse } from './search/rank';
import type { ShownVerse } from './search/find';

export type View = 'today' | 'plans' | 'find' | 'library' | 'review' | 'progress' | 'practice';
export const NAV: readonly { view: Exclude<View, 'practice'>; label: string }[] = [
  { view: 'today', label: 'Today' }, { view: 'plans', label: 'Plans' }, { view: 'find', label: 'Find' }, { view: 'library', label: 'Library' },
  { view: 'review', label: 'Review' }, { view: 'progress', label: 'Progress' },
];

/** Find a verse: the current search and its results, kept while moving between views. */
export interface FindState {
  query: string;
  translation: BibleTranslation;
  busy: boolean;
  status: { message: string; error: boolean } | null;
  /** Results of the last search, or null before searching. */
  found: FoundVerse[] | null;
  /** Wording of each result in the chosen translation, in the same order as found. */
  shown: ShownVerse[];
  voice: VoiceState;
  meaning: MeaningState;
}
/** Meaning search: idle (used automatically once downloaded), asking to download, or downloading. */
export interface MeaningState {
  phase: 'idle' | 'consent' | 'downloading';
  progress: number;
  /** Whether the model and verse vectors are on this device, or null before checking. */
  downloaded: boolean | null;
}
/** idle, or the step voice input is on: asking to download, downloading, listening, starting the private engine, or transcribing. */
export type VoicePhase = 'idle' | 'consent' | 'downloading' | 'listening' | 'preparing' | 'transcribing';
export interface VoiceState {
  phase: VoicePhase;
  /** Private voice download progress, 0 to 1. */
  progress: number;
  /** Whether the chosen private model is on this device, or null before checking. */
  downloaded: boolean | null;
}

/** Mutable UI state shared by the controller and the view templates. */
export interface Ui {
  state: SavedState;
  view: View;
  selectedSlot: number | null;
  feedback: string;
  showBankFeedback: boolean;
  saveError: string | null;
  protectSave: boolean;
  appearanceNotice: AppearanceMigration | null;
  /** Plan opened on the Plans view, or null for the plan list. */
  plan: string | null;
  /** Status for loading Bible text from Today or Plans. */
  loading: { message: string; error: boolean } | null;
  /** Current step of the welcome tour, or null when it is closed. */
  tour: number | null;
  /** Whether the first-visit tour invitation is still showing. */
  tourInvite: boolean;
  /** What the last finished practice earned, shown once on its results. */
  reward: (Reward & { key: string }) | null;
  find: FindState;
}
export const ui = {} as Ui;

export const provider = () => createProvider(ui.state.personal, selectedBiblePassages(ui.state.official));
export const label = (p: Passage) => `${p.reference} · ${translationName(p)}`;
export const runPassage = () => ui.state.run ? provider().get(ui.state.run.key) : undefined;
export const date = (value: number) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(value);
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
