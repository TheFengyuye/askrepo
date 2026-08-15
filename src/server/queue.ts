import { indexRepository } from '../indexing/indexer';

/**
 * M2 in-process async indexing queue (single Node process).
 * BullMQ + Redis replace this in M3 when multi-worker / cross-process
 * scheduling is needed. For a single-server deployment this is sufficient:
 * the API inserts a `pending` row, then kicks off the indexer fire-and-forget;
 * status transitions (indexing → ready/failed) are persisted by the indexer.
 */
export function startIndexing(url: string): void {
  void indexRepository(url).catch((e) => {
    console.error(`[askrepo] indexing failed for ${url}:`, e instanceof Error ? e.message : e);
  });
}
