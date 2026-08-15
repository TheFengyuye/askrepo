import { pipeline, env } from '@huggingface/transformers';
import { getConfig } from '../config.js';

/**
 * Local embedding via transformers.js (ONNX runtime, CPU).
 * Default model: Xenova/bge-m3 (1024 dims). Override with EMBEDDING_MODEL.
 * Set HF_ENDPOINT to a mirror (e.g. https://hf-mirror.com) for CN networks.
 */

type FeatureExtractionPipeline = (texts: string[], options: unknown) => Promise<any>;

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

export async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    const cfg = getConfig();
    env.remoteHost = cfg.hfEndpoint;
    env.allowLocalModels = false;
    extractorPromise = pipeline('feature-extraction', cfg.embeddingModel, {
      dtype: 'q8',
    }) as Promise<FeatureExtractionPipeline>;
  }
  return extractorPromise;
}

/** Embed texts in batches; returns one normalized Float32Array per input. */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  const extractor = await getEmbedder();
  const out: Float32Array[] = [];
  const BATCH = 8;
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const result = await extractor(batch, { pooling: 'mean', normalize: true });
    const tensor = Array.isArray(result) ? result[0] : result;
    const dim = tensor.dims?.[1] ?? 0;
    if (!dim) throw new Error('Embedding output has unexpected shape');
    for (let b = 0; b < batch.length; b++) {
      const start = b * dim;
      out.push(tensor.data.subarray(start, start + dim));
    }
  }
  return out;
}
