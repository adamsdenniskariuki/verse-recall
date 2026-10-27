"""Builds the optional meaning-search index for Find a verse.

Every verse is embedded in the WEB British, BSB and KJV with bge-small-en-v1.5 (the exact quantised ONNX file the
browser downloads), the three vectors are averaged so one vector describes the verse in every translation, reduced
to 256 dimensions with PCA, and stored as int8 with one scale per verse. Verse numbering follows the keyword index.

Requires: pip install onnxruntime tokenizers numpy
Run:      python tools/build_meaning_index.py
Outputs:  public/meaning/<id>/ (meta, projection, scales, vector shards), src/semantic/version.ts and
          tests/fixtures/meaning-queries.json (golden query vectors, so unit tests can rank without the model).
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import shutil
import sys
import urllib.request
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

ROOT = Path(__file__).resolve().parent.parent
REPO = 'Xenova/bge-small-en-v1.5'
REVISION = 'ea104dacec62c0de699686887e3f920caeb4f3e3'
MODEL_FILES = {
    'config.json': (683, 'fa73f90bf92c8cace1fbcb709626306f2bdbc9ea3e5b5f94b440df9b6aa56350'),
    'tokenizer.json': (711396, 'd241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66'),
    'tokenizer_config.json': (366, '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3'),
    'onnx/model_quantized.onnx': (34014426, '6c9c6101a956d62dfb5e7190c538226c0c5bb9cb27b651234b6df063ee7dbfe4'),
}
QUERY_PREFIX = 'Represent this sentence for searching relevant passages: '
DIMS, REDUCED, SHARD_ROWS = 384, 256, 4096


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def model_file(path: str) -> Path:
    """Downloads a pinned model file once and refuses anything that does not match its size and hash."""
    cache = Path(os.environ.get('VERSE_RECALL_MODELS', Path.home() / '.cache' / 'verse-recall-models')) / REVISION
    target = cache / path
    size, digest = MODEL_FILES[path]
    if not target.exists() or target.stat().st_size != size or sha256(target.read_bytes()) != digest:
        target.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(f'https://huggingface.co/{REPO}/resolve/{REVISION}/{path}') as response:
            data = response.read()
        if len(data) != size or sha256(data) != digest:
            raise SystemExit(f'{path} does not match its pinned hash')
        target.write_bytes(data)
    return target


class Embedder:
    """Embeds texts in parallel worker processes, each on one thread, in length-sorted batches so output is reproducible."""

    def __init__(self) -> None:
        for path in MODEL_FILES:
            model_file(path)
        self.tokenizer = load_tokenizer()
        self.pool = ProcessPoolExecutor(max(1, min(8, (os.cpu_count() or 2) - 1)), initializer=_start_worker)

    def __call__(self, texts: list[str], batch: int = 64) -> np.ndarray:
        lengths = [len(e.ids) for e in self.tokenizer.encode_batch(texts)]
        order = sorted(range(len(texts)), key=lambda i: (lengths[i], i))
        batches = [[texts[i] for i in order[at:at + batch]] for at in range(0, len(order), batch)]
        out = np.zeros((len(texts), DIMS), np.float32)
        for at, vectors in zip(range(0, len(order), batch), self.pool.map(_embed_batch, batches)):
            out[order[at:at + batch]] = vectors
        return out


def load_tokenizer() -> Tokenizer:
    tokenizer = Tokenizer.from_file(str(model_file('tokenizer.json')))
    tokenizer.enable_truncation(512)
    tokenizer.enable_padding()
    return tokenizer


_worker: tuple[Tokenizer, ort.InferenceSession] | None = None


def _start_worker() -> None:
    global _worker
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1  # one thread per process keeps the output reproducible
    options.inter_op_num_threads = 1
    _worker = (load_tokenizer(), ort.InferenceSession(str(model_file('onnx/model_quantized.onnx')), options, providers=['CPUExecutionProvider']))


def _embed_batch(texts: list[str]) -> np.ndarray:
    tokenizer, session = _worker
    encoded = tokenizer.encode_batch(texts)
    ids = np.array([e.ids for e in encoded], dtype=np.int64)
    mask = np.array([e.attention_mask for e in encoded], dtype=np.int64)
    hidden = session.run(None, {'input_ids': ids, 'attention_mask': mask, 'token_type_ids': np.zeros_like(ids)})[0]
    cls = hidden[:, 0]  # bge uses the [CLS] token, normalised
    return (cls / np.linalg.norm(cls, axis=1, keepdims=True)).astype(np.float32)


def constant(path: str, name: str) -> str:
    return re.search(rf"{name} = '([^']+)'", (ROOT / path).read_text(encoding='utf8')).group(1)


def ordinals() -> tuple[dict[tuple[str, int, int], int], int, str]:
    """Verse numbering shared with the keyword index: books in order, every verse up to the highest in any translation."""
    search = constant('src/search/version.ts', 'SEARCH_INDEX')
    meta = json.loads((ROOT / 'public' / 'search' / search / 'meta.json').read_text(encoding='utf8'))
    table, n = {}, 0
    for book, counts in meta['books']:
        for chapter, count in enumerate(counts, 1):
            for verse in range(1, count + 1):
                table[(book, chapter, verse)] = n
                n += 1
    return table, n, search


def editions():
    for name in ('BIBLE_SNAPSHOT', 'KJV_SNAPSHOT'):
        snapshot = constant('src/bible-version.ts', name)
        manifest = json.loads((ROOT / 'public' / 'bibles' / snapshot / 'manifest.json').read_text(encoding='utf8'))
        for translation, edition in manifest['translations'].items():
            rows = []
            for book in edition['books']:
                for chapter in book['chapters']:
                    data = json.loads((ROOT / 'public' / 'bibles' / snapshot / chapter['path']).read_text(encoding='utf8'))
                    rows += [((book['id'], chapter['number'], int(v)), text) for v, text in data['verses'].items()]
            yield f'{snapshot}/{translation}', rows


def golden_queries() -> list[str]:
    source = (ROOT / 'tests' / 'search-golden.ts').read_text(encoding='utf8')
    found = re.findall(r"\[\s*(?:'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\")\s*,\s*\[[^\]]*\]\s*\]", source)
    return [(a or b).replace("\\'", "'") for a, b in found]


def main() -> None:
    embed = Embedder()
    table, count, search = ordinals()
    total = np.zeros((count, DIMS), np.float64)
    sources = []
    for name, rows in editions():
        print(f'embedding {name} ({len(rows)} verses)…', flush=True)
        vectors = embed([text for _, text in rows])
        for (ref, _), vector in zip(rows, vectors):
            total[table[ref]] += vector
        sources.append(name)
    norms = np.linalg.norm(total, axis=1, keepdims=True)
    present = norms[:, 0] > 0
    mean = np.where(present[:, None], total / np.where(norms > 0, norms, 1), 0).astype(np.float32)

    # PCA directions from the verse vectors; signs fixed so the build is reproducible.
    _, _, vt = np.linalg.svd(mean[present] - mean[present].mean(0), full_matrices=False)
    components = vt[:REDUCED]
    components *= np.where(components[np.arange(REDUCED), np.abs(components).argmax(1)] < 0, -1, 1)[:, None]
    projection = components.T.astype(np.float32)  # DIMS x REDUCED, row-major
    reduced = mean @ projection
    lengths = np.linalg.norm(reduced, axis=1, keepdims=True)
    reduced = np.where(lengths > 0, reduced / np.where(lengths > 0, lengths, 1), 0)
    scales = (np.abs(reduced).max(1) / 127).astype(np.float32)
    quantised = np.round(reduced / np.where(scales > 0, scales, 1)[:, None]).clip(-127, 127).astype(np.int8)

    files = {'projection.bin': projection.astype('<f4').tobytes(), 'scales.bin': scales.astype('<f4').tobytes()}
    for i in range(0, count, SHARD_ROWS):
        files[f'vectors-{i // SHARD_ROWS:02d}.bin'] = quantised[i:i + SHARD_ROWS].tobytes()
    listing = [{'name': name, 'bytes': len(data), 'sha256': sha256(data)} for name, data in files.items()]
    meta = {
        'format': 'verse-recall-meaning', 'version': 1,
        'model': {'repo': REPO, 'revision': REVISION, 'file': 'onnx/model_quantized.onnx', 'sha256': MODEL_FILES['onnx/model_quantized.onnx'][1],
                  'pooling': 'cls', 'queryPrefix': QUERY_PREFIX},
        'searchIndex': search, 'sources': sources, 'count': count, 'dims': DIMS, 'reduced': REDUCED, 'shardRows': SHARD_ROWS,
        'files': listing,
    }
    meta_json = json.dumps(meta, separators=(',', ':')).encode()
    index_id = f'm1-{sha256(meta_json)[:16]}'
    out = ROOT / 'public' / 'meaning'
    if out.exists():
        for old in out.iterdir():
            if old.name != index_id:
                shutil.rmtree(old)
    (out / index_id).mkdir(parents=True, exist_ok=True)
    (out / index_id / 'meta.json').write_bytes(meta_json)
    for name, data in files.items():
        (out / index_id / name).write_bytes(data)

    entries = ',\n'.join(f"  {{ name: '{f['name']}', bytes: {f['bytes']}, sha256: '{f['sha256']}' }}" for f in [{'name': 'meta.json', 'bytes': len(meta_json), 'sha256': sha256(meta_json)}, *listing])
    (ROOT / 'src' / 'semantic' / 'version.ts').write_text(
        "// Generated by tools/build_meaning_index.py. Do not edit.\n"
        f"export const MEANING_INDEX = '{index_id}';\n"
        f"export const MEANING_COUNT = {count};\n"
        f"export const MEANING_DIMS = {DIMS};\n"
        f"export const MEANING_REDUCED = {REDUCED};\n"
        f"export const MEANING_SHARD_ROWS = {SHARD_ROWS};\n"
        f"export const MEANING_FILES = [\n{entries},\n] as const;\n", encoding='utf8', newline='\n')

    queries = golden_queries()
    vectors = embed([QUERY_PREFIX + q for q in queries])
    fixture = {'model': REVISION, 'queries': {q: base64.b64encode(v.astype('<f4').tobytes()).decode() for q, v in zip(queries, vectors)}}
    (ROOT / 'tests' / 'fixtures').mkdir(exist_ok=True)
    (ROOT / 'tests' / 'fixtures' / 'meaning-queries.json').write_text(json.dumps(fixture, indent=1) + '\n', encoding='utf8', newline='\n')
    size = sum(f['bytes'] for f in listing) + len(meta_json)
    print(f'{index_id}: {count} verses, {len(listing) - 2} shards, {size / 1e6:.2f} MB')


if __name__ == '__main__':
    sys.exit(main())
