import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BIBLE_SNAPSHOT, KJV_SNAPSHOT } from '../src/bible-version';
import { KeywordIndex } from '../src/search/keyword';
import type { IndexMeta } from '../src/search/index-format';
import { SEARCH_INDEX } from '../src/search/version';

/** Loads the committed search index and chapter text from disk for Node tests. */
export function loadIndex(): KeywordIndex {
  const dir = join('public', 'search', SEARCH_INDEX);
  return new KeywordIndex(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as IndexMeta, new Uint8Array(readFileSync(join(dir, 'postings.bin'))));
}
export const diskChapter = (translation: 'webbe' | 'bsb' | 'kjv') => async (book: string, chapter: number): Promise<Record<string, string>> => {
  const snapshot = translation === 'kjv' ? KJV_SNAPSHOT : BIBLE_SNAPSHOT;
  return (JSON.parse(readFileSync(join('public', 'bibles', snapshot, translation, `${book}-${chapter}.json`), 'utf8')) as { verses: Record<string, string> }).verses;
};
