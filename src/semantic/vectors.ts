// Meaning search over precomputed verse vectors. Pure functions, so unit tests can rank without the model.
import { MEANING_COUNT, MEANING_DIMS, MEANING_REDUCED, MEANING_SHARD_ROWS } from './version';

export interface MeaningHit { ordinal: number; similarity: number }

/** Verse vectors: one int8 row per verse (in keyword-index order) with a scale, plus the PCA projection for queries. */
export class MeaningIndex {
  constructor(readonly projection: Float32Array, readonly scales: Float32Array, readonly shards: readonly Int8Array[]) {
    if (projection.length !== MEANING_DIMS * MEANING_REDUCED) throw new Error('The meaning index projection has the wrong size.');
    if (scales.length !== MEANING_COUNT) throw new Error('The meaning index does not cover every verse.');
    const rows = shards.reduce((sum, shard) => sum + shard.length / MEANING_REDUCED, 0);
    if (rows !== MEANING_COUNT || shards.some((s, i) => s.length !== MEANING_REDUCED * Math.min(MEANING_SHARD_ROWS, MEANING_COUNT - i * MEANING_SHARD_ROWS)))
      throw new Error('The meaning index vectors are incomplete.');
  }

  /** Maps a normalised model embedding into the reduced space, normalised again. */
  project(query: Float32Array): Float32Array {
    if (query.length !== MEANING_DIMS) throw new Error('The query vector has the wrong size.');
    const out = new Float32Array(MEANING_REDUCED);
    for (let i = 0; i < MEANING_DIMS; i++) {
      const q = query[i];
      if (!q) continue;
      const row = i * MEANING_REDUCED;
      for (let j = 0; j < MEANING_REDUCED; j++) out[j] += q * this.projection[row + j];
    }
    const length = Math.hypot(...out);
    if (length) for (let j = 0; j < MEANING_REDUCED; j++) out[j] /= length;
    return out;
  }

  /** The verses whose meaning is closest to the query, by cosine similarity. */
  search(query: Float32Array, limit = 20): MeaningHit[] {
    const q = this.project(query);
    const best: MeaningHit[] = [];
    let floor = -Infinity;
    let ordinal = 0;
    for (const shard of this.shards) {
      for (let at = 0; at < shard.length; at += MEANING_REDUCED, ordinal++) {
        const scale = this.scales[ordinal];
        if (!scale) continue;
        let dot = 0;
        for (let j = 0; j < MEANING_REDUCED; j++) dot += q[j] * shard[at + j];
        const similarity = dot * scale;
        if (best.length === limit && similarity <= floor) continue;
        best.push({ ordinal, similarity });
        best.sort((a, b) => b.similarity - a.similarity || a.ordinal - b.ordinal);
        if (best.length > limit) best.pop();
        floor = best[best.length - 1].similarity;
      }
    }
    return best;
  }
}

/** Reads little-endian float32 bytes. */
export const floats = (bytes: ArrayBuffer) => {
  const view = new DataView(bytes);
  return Float32Array.from({ length: bytes.byteLength / 4 }, (_, i) => view.getFloat32(i * 4, true));
};
