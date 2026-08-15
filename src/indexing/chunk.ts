/**
 * M1 heuristic chunker (tree-sitter comes in M3).
 * Strategy: split file into blocks at blank lines; merge tiny blocks into the
 * previous chunk; split oversized blocks into sub-chunks with overlap.
 * Every chunk keeps 1-based line ranges so citations can point at real lines.
 */

const MAX_LINES = 120;
const MIN_LINES = 4;
const MAX_CHARS = 6000;
const SUB_STEP = 80;
const SUB_OVERLAP = 20;

export interface Chunk {
  content: string;
  startLine: number;
  endLine: number;
  symbol: string | null;
}

const DECL_RE =
  /(?:function|class|interface|type|enum|struct|impl|def|func|fn|trait|record|protocol)\s+([A-Za-z_$][\w$]*)/;

export function chunkFile(content: string): Chunk[] {
  const lines = content.split(/\r?\n/);

  // Split into blocks at blank lines.
  const blocks: { lines: string[]; start: number }[] = [];
  let cur: string[] = [];
  let curStart = 1;
  const flush = (nextStart: number) => {
    if (cur.length > 0) {
      blocks.push({ lines: cur, start: curStart });
      cur = [];
    }
    curStart = nextStart;
  };
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') flush(i + 2);
    else cur.push(lines[i]);
  }
  flush(lines.length + 1);

  const chunks: Chunk[] = [];
  for (const b of blocks) {
    const text = b.lines.join('\n');
    const start = b.start;
    const end = b.start + b.lines.length - 1;

    if (text.length > MAX_CHARS || b.lines.length > MAX_LINES) {
      // Oversized block → sub-chunks with overlap.
      for (let s = 0; s < b.lines.length; s += SUB_STEP - SUB_OVERLAP) {
        const sub = b.lines.slice(s, s + SUB_STEP);
        if (sub.length === 0) continue;
        chunks.push({
          content: sub.join('\n'),
          startLine: start + s,
          endLine: start + s + sub.length - 1,
          symbol: symbolOf(sub[0] ?? ''),
        });
      }
      continue;
    }

    if (b.lines.length < MIN_LINES && chunks.length > 0) {
      // Tiny block → merge into previous chunk if close by.
      const prev = chunks[chunks.length - 1];
      if (start - prev.endLine <= 3) {
        prev.content += '\n' + text;
        prev.endLine = end;
        continue;
      }
    }

    chunks.push({ content: text, startLine: start, endLine: end, symbol: symbolOf(b.lines[0] ?? '') });
  }

  return chunks;
}

function symbolOf(firstLine: string): string | null {
  const m = firstLine.match(DECL_RE);
  return m ? m[1] : null;
}
