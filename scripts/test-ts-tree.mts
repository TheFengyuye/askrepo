// Dev tool: dump tree-sitter parse tree structure.
import Parser from 'web-tree-sitter';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

await Parser.init();
const wasm = fs.readFileSync(require.resolve('tree-sitter-wasms/out/tree-sitter-typescript.wasm'));
const grammar = await Parser.Language.load(wasm);
const parser = new Parser();
parser.setLanguage(grammar);

const src = `export function calculate(a: number, b: number): number {
  return a + b;
}`;
const tree = parser.parse(src);
console.log('tree:', tree ? 'ok' : 'NULL');
if (tree) {
  const root = tree.rootNode;
  console.log('root type:', root.type, 'children:', root.namedChildren.length);
  for (const c of root.namedChildren) {
    console.log(' -', c.type, '| text:', JSON.stringify(c.text.slice(0, 60)));
    for (const cc of c.namedChildren) console.log('   -', cc.type);
  }
}
