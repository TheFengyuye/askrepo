/**
 * Code-text normalization helpers.
 * camelSplit: split camelCase / PascalCase / acronyms into space-separated
 * lowercase words — "printAstToDoc" → "print ast to doc". This lets FTS and
 * coverage scoring match query tokens (e.g. "ast", "doc") against camelCase
 * symbols, which is essential for code retrieval.
 */
export function camelSplit(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[^a-z0-9_$]+/gi, ' ')
    .toLowerCase();
}

/** Lowercased camel-split text used for FTS norm column and coverage scoring. */
export function normText(text: string): string {
  return camelSplit(text);
}
