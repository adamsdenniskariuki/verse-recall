/**
 * Meaning search: the files the on-device embedding model and verse vectors need, pinned by URL and SHA-256.
 * Nothing here is bundled. Files download once, only after the person opts in, and are verified before use.
 */
import { megabytes, RUNTIME, type VoiceFile } from '../voice/models';
import { MEANING_FILES, MEANING_INDEX } from './version';

export const MEANING_CACHE = 'verse-recall-meaning';
export const EMBEDDING = {
  label: 'bge-small-en-v1.5 (BAAI), quantised',
  repo: 'Xenova/bge-small-en-v1.5',
  revision: 'ea104dacec62c0de699686887e3f920caeb4f3e3',
  /** bge models expect this before a search query; verses are embedded without it. */
  queryPrefix: 'Represent this sentence for searching relevant passages: ',
};
const MODEL_FILES: [string, number, string][] = [
  ['config.json', 683, 'fa73f90bf92c8cace1fbcb709626306f2bdbc9ea3e5b5f94b440df9b6aa56350'],
  ['tokenizer.json', 711396, 'd241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66'],
  ['tokenizer_config.json', 366, '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3'],
  ['onnx/model_quantized.onnx', 34014426, '6c9c6101a956d62dfb5e7190c538226c0c5bb9cb27b651234b6df063ee7dbfe4'],
];
export const MODEL: VoiceFile[] = MODEL_FILES.map(([path, bytes, sha256]) =>
  ({ url: `https://huggingface.co/${EMBEDDING.repo}/resolve/${EMBEDDING.revision}/${path}`, bytes, sha256 }));

/** Verse vectors, served with the app. `origin` is the page origin plus the app base path. */
export const indexFiles = (origin: string): VoiceFile[] =>
  MEANING_FILES.map(file => ({ url: new URL(`meaning/${MEANING_INDEX}/${file.name}`, origin).href, bytes: file.bytes, sha256: file.sha256 }));
export const indexFile = (origin: string, name: string): VoiceFile => indexFiles(origin).find(file => file.url.endsWith(`/${name}`))!;

/** Everything meaning search needs: the shared runtime, the model and the verse vectors. */
export const meaningFiles = (origin: string): VoiceFile[] => [...Object.values(RUNTIME), ...MODEL, ...indexFiles(origin)];
export const meaningBytes = () => meaningFiles('https://example.invalid/').reduce((sum, file) => sum + file.bytes, 0);
export const meaningSize = () => megabytes(meaningBytes());
export const indexBytes = () => MEANING_FILES.reduce((sum, file) => sum + file.bytes, 0);
