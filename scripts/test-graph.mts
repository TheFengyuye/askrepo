// Dev tool: test graph extraction on a sample snippet.
import { extractGraph } from '../src/graph/extract';

const src = `import { add, multiply } from './math.js';

export function calculate(a: number, b: number, op: 'add' | 'multiply'): number {
  if (op === 'add') return add(a, b);
  return multiply(a, b);
}

export function withPrecision(value: number, precision: number): number {
  return Number(value.toFixed(precision));
}
`;

const r = await extractGraph('index.ts', src);
console.log('symbols:', JSON.stringify(r.symbols, null, 0));
console.log('edges:', JSON.stringify(r.edges));
console.log('error:', r.error ?? 'none');
