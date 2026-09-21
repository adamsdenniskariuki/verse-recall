import type { PersonalVerse, VerseInput } from './content';

export const MAX_PERSONAL = 100;
export const MAX_JSON_BYTES = 1_048_576;
export const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
export const exactKeys = (v: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(v).length === keys.length && keys.every(key => Object.hasOwn(v, key));
const bounded = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v);
export const validId = (v: unknown): v is string =>
  typeof v === 'string' && /^user-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(v);
export const verseFields = ['reference', 'text', 'translationLabel', 'edition', 'testament'] as const;

export function validVerseInput(v: unknown): v is VerseInput {
  if (!record(v) || !bounded(v.reference, 120) || !bounded(v.translationLabel, 80) ||
      !bounded(v.edition, 80) || !bounded(v.text, 2000) || !['OT', 'NT'].includes(String(v.testament))) return false;
  const tokens = v.text.trim().split(/\s+/u);
  return tokens.length >= 1 && tokens.length <= 120 && tokens.every(token => /[\p{L}\p{N}]/u.test(token));
}
export function validPersonal(v: unknown): v is PersonalVerse {
  return record(v) && exactKeys(v, ['id', 'revision', ...verseFields]) &&
    validId(v.id) && typeof v.revision === 'string' && /^[a-f0-9]{64}$/u.test(v.revision) && validVerseInput(v);
}

export async function contentRevision(input: VerseInput): Promise<string> {
  const canonical = JSON.stringify(verseFields.map(field => input[field]));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function makePersonal(input: VerseInput, id = `user-${crypto.randomUUID()}`): Promise<PersonalVerse> {
  if (!validVerseInput(input) || !validId(id)) throw new Error('Use a reference (120 characters), translation/edition (80 each), and original text of 1–120 words / at most 2,000 characters.');
  return {
    id, revision: await contentRevision(input), reference: input.reference, text: input.text,
    translationLabel: input.translationLabel, edition: input.edition, testament: input.testament,
  };
}
export async function verifyRevisions(verses: readonly PersonalVerse[]): Promise<boolean> {
  const matches = await Promise.all(verses.map(async verse => verse.revision === await contentRevision(verse)));
  return matches.every(Boolean);
}

export function safeTree(value: unknown, depth = 0, budget = { remaining: 30_000 }): boolean {
  if (--budget.remaining < 0 || depth > 12) return false;
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(item => safeTree(item, depth + 1, budget));
  if (!record(value)) return false;
  return Object.entries(value).every(([key, item]) =>
    !['__proto__', 'constructor', 'prototype'].includes(key) && safeTree(item, depth + 1, budget));
}
export function parseBoundedJson(raw: string): unknown {
  if (raw.length > MAX_JSON_BYTES || new TextEncoder().encode(raw).length > MAX_JSON_BYTES) throw new Error('JSON files must be no larger than 1 MiB.');
  const value: unknown = JSON.parse(raw);
  if (!safeTree(value)) throw new Error('Unsupported JSON structure, excessive nesting, or unsafe property names.');
  return value;
}
