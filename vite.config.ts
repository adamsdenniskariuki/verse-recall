import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { BIBLE_SNAPSHOT, KJV_SNAPSHOT } from './src/bible-version';
import { SEARCH_INDEX } from './src/search/version';

const SNAPSHOTS = [BIBLE_SNAPSHOT, KJV_SNAPSHOT];
const SEARCH = `/search/${SEARCH_INDEX}/`;

const PUBLIC_SHELL = ['/', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

// Emits sw.js for production builds only: the app shell is precached, Bible chapters and the search index are cached as they are used.
const serviceWorker = (): Plugin => ({
  name: 'verse-recall-service-worker',
  apply: 'build',
  generateBundle(_, bundle) {
    const shell = [...PUBLIC_SHELL, ...Object.keys(bundle).filter(file => file.startsWith('assets/')).map(file => `/${file}`).sort()];
    const version = createHash('sha256').update(`${SNAPSHOTS.join('\n')}\n${SEARCH}\n${shell.join('\n')}`).digest('hex').slice(0, 16);
    const source = readFileSync('tools/service-worker.js', 'utf8')
      .replace('__VERSION__', JSON.stringify(version))
      .replace('__SHELL__', JSON.stringify(shell))
      .replace('__SNAPSHOTS__', JSON.stringify(SNAPSHOTS))
      .replace('__SEARCH__', JSON.stringify(SEARCH));
    this.emitFile({ type: 'asset', fileName: 'sw.js', source });
  },
});

export default defineConfig({ base: '/', build: { target: 'es2022' }, plugins: [serviceWorker()] });
