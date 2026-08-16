import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Keep native/ML-heavy packages external so Next doesn't try to bundle them.
  serverExternalPackages: [
    '@huggingface/transformers',
    'onnxruntime-node',
    'web-tree-sitter',
    'tree-sitter-wasms',
  ],
};

export default nextConfig;
