import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { BIBLE_SNAPSHOT } from './src/bible-version';

const PUBLIC_SHELL = ['/', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

// Emits sw.js for production builds only: the app shell is precached, Bible chapters are cached as they are opened.
const serviceWorker = (): Plugin => ({
  name: 'verse-recall-service-worker',
  apply: 'build',
  generateBundle(_, bundle) {
    const shell = [...PUBLIC_SHELL, ...Object.keys(bundle).filter(file => file.startsWith('assets/')).map(file => `/${file}`).sort()];
    const version = createHash('sha256').update(`${BIBLE_SNAPSHOT}\n${shell.join('\n')}`).digest('hex').slice(0, 16);
    const source = readFileSync('tools/service-worker.js', 'utf8')
      .replace('__VERSION__', JSON.stringify(version))
      .replace('__SHELL__', JSON.stringify(shell))
      .replace('__SNAPSHOT__', JSON.stringify(BIBLE_SNAPSHOT));
    this.emitFile({ type: 'asset', fileName: 'sw.js', source });
  },
});

export default defineConfig({ base: '/', build: { target: 'es2022' }, plugins: [serviceWorker()] });
