import fs from 'node:fs';
import path from 'node:path';

export interface Config {
  deepseekApiKey: string;
  deepseekBaseUrl: string;
  deepseekModel: string;
  embeddingModel: string;
  hfEndpoint: string;
  dataDir: string;
  maxRepoMb: number;
}

/** Minimal .env loader (no external dep). Real env vars take precedence. */
function loadDotEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
  } catch {
    // no .env file — fine
  }
  return out;
}

const env = { ...loadDotEnv(), ...process.env };

export function getConfig(): Config {
  return {
    deepseekApiKey: env.DEEPSEEK_API_KEY ?? '',
    deepseekBaseUrl: env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    deepseekModel: env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    embeddingModel: env.EMBEDDING_MODEL ?? 'Xenova/bge-m3',
    hfEndpoint: env.HF_ENDPOINT ?? 'https://huggingface.co',
    dataDir: path.resolve(process.cwd(), env.DATA_DIR ?? './data'),
    maxRepoMb: Number(env.MAX_REPO_MB ?? 200),
  };
}
