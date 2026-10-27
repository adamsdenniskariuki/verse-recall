/**
 * Private voice input: the files the on-device Whisper engine needs, pinned by URL and SHA-256.
 * Nothing here is bundled. Files download once, only after the person opts in, and are verified before use.
 */
export const VOICE_CACHE = 'verse-recall-voice';
export const TRANSFORMERS_VERSION = '4.3.1';
export const ORT_VERSION = '1.31.0-dev.20260914-8d85527a0';

export interface VoiceFile { url: string; bytes: number; sha256: string }
export type PrivateModel = 'tiny' | 'base';

const hf = (repo: string, revision: string, files: [string, number, string][]): VoiceFile[] =>
  files.map(([path, bytes, sha256]) => ({ url: `https://huggingface.co/${repo}/resolve/${revision}/${path}`, bytes, sha256 }));
const TOKENIZER: [string, number, string][] = [
  ['preprocessor_config.json', 339, 'a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d'],
  ['tokenizer.json', 2405679, '5eb60cec1e77aeeb6869a2bb5a8e01a84c3fe5d072d75369343021fe6f5310d0'],
  ['tokenizer_config.json', 282662, '93879c3dccdd4b976f709acd85b44778873f30c275e67026f30ca1e4c975230c'],
];

export const RUNTIME = {
  library: { url: `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_VERSION}/dist/transformers.min.js`, bytes: 586230, sha256: '8d6716d9086f57c30a4bf367dba61b887593573c770c454465e8019b2703e743' },
  factory: { url: `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort-wasm-simd-threaded.mjs`, bytes: 24381, sha256: 'c57ca56328877353a575e51bbca6f18450027d6c9bf2307a2cb2c41363b4de9f' },
  wasm: { url: `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort-wasm-simd-threaded.wasm`, bytes: 14264838, sha256: '06ba057753da3847e4c24f02d91ab133455b0817c69a44993a9a53a2146df9e3' },
} satisfies Record<string, VoiceFile>;

const TINY = '2575352d61be1bf7225cf8f8b268a4678025fc58';
const BASE = '51eefc0af78b103839eda9e7e4f4186acc6517fe';
export const MODELS: Record<PrivateModel, { label: string; repo: string; revision: string; files: VoiceFile[] }> = {
  tiny: {
    label: 'Standard (Whisper tiny, English)', repo: 'onnx-community/whisper-tiny.en', revision: TINY,
    files: hf('onnx-community/whisper-tiny.en', TINY, [
      ['config.json', 2197, '251ea843b5901a99efa58c0b99b8052c6019aa3e7d2baf46693a1128ff606233'],
      ['generation_config.json', 1646, '7b2e8451ed5f118e75fdd991409d72119d21d2fef1eba9723f68fb9c57fe5dc9'],
      ...TOKENIZER,
      ['onnx/encoder_model_quantized.onnx', 10124993, 'e93ec822f16a8fd264e7de972ad17d615ea7334b75a52d54c50c2e18dd503a25'],
      ['onnx/decoder_model_merged_quantized.onnx', 30718858, 'c0592d0749413c960569e1c7fb806b060d5d18f3ebad4a95cbf9a77dc6e9be52'],
    ]),
  },
  base: {
    label: 'More accurate (Whisper base, English)', repo: 'onnx-community/whisper-base.en', revision: BASE,
    files: hf('onnx-community/whisper-base.en', BASE, [
      ['config.json', 2197, 'c8a0de5ed8a083565a4319db29d0c210fda35b4d6076c2d711cae53ae00f3cb1'],
      ['generation_config.json', 1556, '3479b1f44a07e41db799e22599222fee5816738036def94a39841cb9cdbb4120'],
      ...TOKENIZER,
      ['onnx/encoder_model_quantized.onnx', 23201320, '6e8001198c490bbae018c0044f630c2915efb826bad957006ce36152d0ab2a10'],
      ['onnx/decoder_model_merged_quantized.onnx', 53692803, 'dd4761a3f7add26afda3512abff4706920404c2517e85a9f2ff090b0c0987909'],
    ]),
  },
};

/** Everything one private model needs: the shared runtime plus its own files. */
export const filesFor = (model: PrivateModel): VoiceFile[] => [...Object.values(RUNTIME), ...MODELS[model].files];
export const downloadBytes = (model: PrivateModel) => filesFor(model).reduce((sum, file) => sum + file.bytes, 0);
export const megabytes = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;
