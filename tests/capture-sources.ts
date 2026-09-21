import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { passages, passageKey } from '../src/content';

const receipts: Record<string, { text: string; url: string; sha256: string; retrievedAt: string }> = {};
const cache = new Map<string, string>();
for (const passage of passages) {
  let raw = cache.get(passage.source);
  if (raw === undefined) {
    const response = await fetch(passage.source);
    if (!response.ok) throw new Error(`${response.status}: ${passage.source}`);
    raw = await response.text();
    cache.set(passage.source, raw);
  }
  let text: string;
  if (passage.translation === 'bsb') {
    const line = raw.split(/\r?\n/u).find(line => line.startsWith(`${passage.reference}\t`));
    if (!line) throw new Error(`Source reference missing: ${passage.reference}`);
    text = line.slice(line.indexOf('\t') + 1).trim();
  } else {
    const verse = passage.mapping.verses[0];
    const match = raw.match(new RegExp(`<span class="verse" id="V${verse}">[^<]*<\\/span>([\\s\\S]*?)<span class="verse" id="V${verse + 1}">`, 'u'));
    if (!match) throw new Error(`Source verse marker missing: ${passage.reference}`);
    text = match[1].replace(/<[^>]+>/gu, ' ').replace(/&#160;|&nbsp;/gu, ' ').replace(/\s+/gu, ' ').trim();
  }
  receipts[passageKey(passage)] = {
    text, url: passage.source, sha256: createHash('sha256').update(raw).digest('hex'),
    retrievedAt: new Date().toISOString(),
  };
}
await mkdir('sources', { recursive: true });
await writeFile('sources/official-verses.json', JSON.stringify(receipts, null, 2) + '\n');
console.log(`Captured ${Object.keys(receipts).length} official verse receipts. Run npm test to verify bundled text against them.`);
