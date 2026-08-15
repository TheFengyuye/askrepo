import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keep native/ML-heavy packages external so Next doesn't try to bundle them.
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node'],
};

export default nextConfig;
