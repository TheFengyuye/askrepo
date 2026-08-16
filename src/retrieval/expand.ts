import { getDb } from '../storage/db';
import type { Hit } from './vectors';

/**
 * M3 pseudo-relevance feedback: from the top hits, harvest their distinctive
 * SYMBOLS (from the tree-sitter code graph, falling back to chunk.symbol) and
 * use them as extra keywords for a second keyword pass. This bridges the gap
 * between natural-language questions and actual code identifiers: "格式化核心
 * 流程" first lands on cli/format.js, whose graph symbols include coreFormat /
 * printToDoc — which then pull in src/main/core.js.
 */
export function expandKeywordsWithSymbols(repoId: number, hits: Hit[], max = 24): string[] {
  const db = getDb();
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (n: string) => {
    const name = n.trim();
    if (!name || seen.has(name)) return;
    if (!/^[a-zA-Z_$][\w$]{2,}$/.test(name)) return; // keep code-ish identifiers
    seen.add(name);
    out.push(name);
  };

  for (const h of hits.slice(0, 5)) {
    if (h.symbol) push(h.symbol);
    const rows = db
      .prepare('SELECT name FROM symbols WHERE repo_id = ? AND file_id = ? LIMIT 25')
      .all(repoId, h.fileId) as { name: string }[];
    for (const r of rows) push(r.name);
  }
  return out.slice(0, max);
}
