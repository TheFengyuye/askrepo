/**
 * M3: tree-sitter based code-graph extraction (WASM, no native build).
 * Grammar WASM files come from the `tree-sitter-wasms` package (out/*.wasm).
 */
import Parser from 'web-tree-sitter';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

type SyntaxNode = {
  type: string;
  text: string;
  startPosition: { row: number };
  endPosition: { row: number };
  childForFieldName(name: string): SyntaxNode | null;
  namedChildren: SyntaxNode[];
};

type WasmLang = { wasm: string; extensions: string[] };

const LANGS: Record<string, WasmLang> = {
  javascript: { wasm: 'tree-sitter-javascript.wasm', extensions: ['js', 'jsx', 'mjs', 'cjs'] },
  typescript: { wasm: 'tree-sitter-typescript.wasm', extensions: ['ts', 'tsx'] },
  python: { wasm: 'tree-sitter-python.wasm', extensions: ['py'] },
  go: { wasm: 'tree-sitter-go.wasm', extensions: ['go'] },
  rust: { wasm: 'tree-sitter-rust.wasm', extensions: ['rs'] },
  java: { wasm: 'tree-sitter-java.wasm', extensions: ['java'] },
  c: { wasm: 'tree-sitter-c.wasm', extensions: ['c', 'h'] },
  cpp: { wasm: 'tree-sitter-cpp.wasm', extensions: ['cpp', 'hpp', 'cc', 'hxx'] },
  ruby: { wasm: 'tree-sitter-ruby.wasm', extensions: ['rb'] },
  php: { wasm: 'tree-sitter-php.wasm', extensions: ['php'] },
  css: { wasm: 'tree-sitter-css.wasm', extensions: ['css', 'scss', 'less'] },
  html: { wasm: 'tree-sitter-html.wasm', extensions: ['html', 'htm'] },
  json: { wasm: 'tree-sitter-json.wasm', extensions: ['json'] },
};

let inited = false;
const parserCache = new Map<string, Parser>();
const langByExt = new Map<string, string>();

async function ensureInit(): Promise<void> {
  if (!inited) {
    await Parser.init();
    for (const [name, info] of Object.entries(LANGS)) {
      for (const ext of info.extensions) langByExt.set(ext, name);
    }
    inited = true;
  }
}

async function getParser(lang: string): Promise<Parser> {
  const cached = parserCache.get(lang);
  if (cached) return cached;
  const info = LANGS[lang];
  if (!info) throw new Error(`no tree-sitter grammar for language: ${lang}`);
  const wasm = fs.readFileSync(require.resolve(`tree-sitter-wasms/out/${info.wasm}`));
  const grammar = await Parser.Language.load(wasm);
  const parser = new Parser();
  parser.setLanguage(grammar);
  parserCache.set(lang, parser);
  return parser;
}

export interface ParsedFile {
  symbols: SymbolDef[];
  edges: EdgeDef[];
  error?: string;
}

export interface SymbolDef {
  name: string;
  kind: string; // function | class | method | arrow_function
  line: number; // 1-based
  endLine: number;
  fileId?: number;
}

export interface EdgeDef {
  sourceName: string;
  targetName: string;
  kind: 'calls' | 'imports';
}

/**
 * Parse source and extract symbols + call/import edges.
 * Falls back to an empty result (not an exception) when the grammar is
 * unavailable or parsing fails — the graph is an enhancement, never a blocker.
 */
export async function extractGraph(filePath: string, source: string): Promise<ParsedFile> {
  const ext = (filePath.split('.').pop() ?? '').toLowerCase();
  await ensureInit();
  const lang = langByExt.get(ext);
  if (!lang) return { symbols: [], edges: [] };
  try {
    const parser = await getParser(lang);
    const tree = parser.parse(source);
    if (!tree) return { symbols: [], edges: [] };
    const symbols: SymbolDef[] = [];
    const edges: EdgeDef[] = [];
    const stack: { name: string | null; kind: string }[] = [];

    const walk = (node: SyntaxNode) => {
      const type = node.type;
      if (
        type === 'function_declaration' ||
        type === 'generator_function_declaration' ||
        type === 'class_declaration'
      ) {
        const nameNode = node.childForFieldName('name');
        const name = nameNode?.text ?? '';
        if (name) {
          symbols.push({
            name,
            kind: type.startsWith('class') ? 'class' : 'function',
            line: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
          });
          stack.push({ name, kind: 'function' });
        }
      } else if (type === 'method_definition' || type === 'function_expression' || type === 'arrow_function') {
        const nameNode = node.childForFieldName('name');
        const name = nameNode?.text ?? null;
        if (name) {
          symbols.push({
            name,
            kind: 'method',
            line: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
          });
        }
        stack.push({ name, kind: 'function' });
      } else if (type === 'call_expression') {
        const fn = node.childForFieldName('function');
        const callee = fn && (fn.type === 'identifier' || fn.type === 'member_expression') ? fn.text : null;
        if (callee && stack.length > 0 && stack[stack.length - 1]!.name) {
          const calleeName = callee.split('.').pop()!;
          edges.push({ sourceName: stack[stack.length - 1]!.name!, targetName: calleeName, kind: 'calls' });
        }
      } else if (type === 'import_statement') {
        // import { a, b } from '...' — TS grammar uses named_imports → import_specifier.
        const collectImport = (n: SyntaxNode) => {
          for (const c of n.namedChildren) {
            if (c.type === 'import_specifier') {
              const name = c.childForFieldName('name')?.text ?? c.text;
              if (name && name !== '*') {
                edges.push({ sourceName: name, targetName: name, kind: 'imports' });
              }
            } else if (
              c.type === 'import_clause' ||
              c.type === 'named_imports' ||
              c.type === 'namespace_import'
            ) {
              collectImport(c);
            }
          }
        };
        collectImport(node);
      }

      for (const child of node.namedChildren) walk(child);

      if (
        type === 'function_declaration' ||
        type === 'generator_function_declaration' ||
        type === 'class_declaration' ||
        type === 'method_definition' ||
        type === 'function_expression' ||
        type === 'arrow_function'
      ) {
        stack.pop();
      }
    };

    walk(tree.rootNode);
    return { symbols, edges };
  } catch (e) {
    return { symbols: [], edges: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export function supportedLanguage(filePath: string): boolean {
  const ext = (filePath.split('.').pop() ?? '').toLowerCase();
  return langByExt.has(ext);
}
