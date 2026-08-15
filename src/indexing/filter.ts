import path from 'node:path';

/** M1 heuristic filters — no tree-sitter yet (M3). */

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'coverage', 'vendor',
  '.next', '.nuxt', '.venv', '__pycache__', '.idea', '.vscode', '.cache',
  'target', 'bin', 'obj', 'minified', 'static/vendor', 'site-packages',
  'data', // AskRepo's own data dir (cloned repos + db)
]);

const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'npm-shrinkwrap.json',
  'Cargo.lock', 'go.sum', 'poetry.lock', 'Pipfile.lock', 'composer.lock',
  'Gemfile.lock', 'deno.lock', 'bun.lockb', '.DS_Store',
  'LICENSE', 'LICENSE.md', 'CHANGELOG.md', 'COPYING', 'AUTHORS',
]);

const BINARY_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.pdf', '.zip',
  '.gz', '.tar', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.mov',
  '.exe', '.dll', '.so', '.dylib', '.wasm', '.map',
]);

const CODE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.java', '.rs',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.swift', '.kt', '.kts',
  '.vue', '.svelte', '.css', '.scss', '.less', '.html', '.htm', '.sql', '.sh',
  '.bash', '.yml', '.yaml', '.json', '.md', '.toml', '.proto', '.graphql',
  '.lua', '.r', '.dart', '.zig', '.ex', '.exs', '.erl', '.hs', '.ml',
  '.scala', '.clj', '.fs', '.fsx', '.vb', '.pl', '.pm', '.R',
]);

const LANG_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
  '.mjs': 'javascript', '.cjs': 'javascript', '.py': 'python', '.go': 'go',
  '.java': 'java', '.rs': 'rust', '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
  '.cs': 'csharp', '.rb': 'ruby', '.php': 'php', '.swift': 'swift', '.kt': 'kotlin',
  '.vue': 'vue', '.svelte': 'svelte', '.css': 'css', '.scss': 'scss', '.html': 'html',
  '.sql': 'sql', '.sh': 'shell', '.bash': 'shell', '.yml': 'yaml', '.yaml': 'yaml',
  '.json': 'json', '.md': 'markdown', '.toml': 'toml', '.proto': 'protobuf',
};

export function isSkippableDir(dirName: string): boolean {
  return SKIP_DIRS.has(dirName);
}

export function shouldIndexFile(relPath: string, sizeBytes: number): boolean {
  const base = relPath.split('/').pop() ?? '';
  if (SKIP_FILES.has(base)) return false;
  const ext = path.extname(base).toLowerCase();
  if (BINARY_EXTS.has(ext)) return false;
  if (!CODE_EXTS.has(ext)) return false;
  if (base.endsWith('.min.js') || base.endsWith('.min.css')) return false;
  if (sizeBytes > 500_000) return false; // skip huge files
  return true;
}

export function languageOf(relPath: string): string {
  const ext = path.extname(relPath).toLowerCase();
  return LANG_MAP[ext] ?? ext.slice(1);
}
