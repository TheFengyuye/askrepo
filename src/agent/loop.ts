import { hybridSearch } from '../retrieval/search';
import { graphSearch } from '../retrieval/graph';
import { fillPaths, type Hit } from '../retrieval/vectors';

export interface TraceStep {
  hop: number;
  action: string;
  detail: string;
}

export interface AgentResult {
  hits: Hit[];
  trace: TraceStep[];
}

/**
 * M3 agentic multi-hop retrieval (deterministic variant).
 * After the hybrid pass, repeatedly expand along the code graph:
 * follow call/import edges of the top hits to pull in callers/callees
 * (cross-file causation), until no new neighbors appear or the hop cap
 * is reached. The trace records every expansion — it is surfaced to the
 * user as the answer's evidence chain ("检索过程").
 *
 * An LLM-judged variant (decide whether to expand vs answer) is a planned
 * refinement; this deterministic loop keeps latency/cost bounded.
 */
export async function agenticRetrieval(
  repoId: number,
  question: string,
  keywords: string | undefined,
  opts: { maxHops?: number } = {},
): Promise<AgentResult> {
  const maxHops = opts.maxHops ?? 3;
  const trace: TraceStep[] = [];

  let hits = await hybridSearch(repoId, question, 8, { keywords });
  const seen = new Set<number>(hits.map((h) => h.chunkId));

  for (let hop = 1; hop <= maxHops; hop++) {
    const neighbors = graphSearch(repoId, hits.slice(0, 4), 6).filter(
      (n) => !seen.has(n.chunkId),
    );
    if (neighbors.length === 0) break;
    for (const n of neighbors) {
      seen.add(n.chunkId);
      hits.push(n);
    }
    // Bounded, diverse evidence set.
    hits = dedupeAndCap(hits, 12, 3);
    trace.push({
      hop,
      action: 'follow_graph',
      detail: neighbors.map((n) => `${n.path || `chunk#${n.chunkId}`}`).join(', '),
    });
    if (hits.length >= 12) break;
  }

  await fillPaths(repoId, hits);
  return { hits: hits.slice(0, 10), trace };
}

/** Dedupe by chunkId and cap chunks per file + total. */
function dedupeAndCap(hits: Hit[], totalCap: number, perFileCap: number): Hit[] {
  const byId = new Map<number, Hit>();
  for (const h of hits) {
    if (!byId.has(h.chunkId)) byId.set(h.chunkId, h);
  }
  const perFile = new Map<number, number>();
  const out: Hit[] = [];
  for (const h of byId.values()) {
    const n = perFile.get(h.fileId) ?? 0;
    if (n >= perFileCap) continue;
    perFile.set(h.fileId, n + 1);
    out.push(h);
    if (out.length >= totalCap) break;
  }
  return out;
}
