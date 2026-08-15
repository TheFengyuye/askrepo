// Dev tool: strip `.js` from relative import specifiers (Turbopack needs extensionless).
// Usage: node scripts/strip-js-ext.mjs <dir>
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ?? 'src';
const re = /(from\s+['"])(\.{1,2}\/[^'"]*?)\.js(['"])/g;

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'app') continue; // app/ imports use @/ alias already
      walk(p);
    } else if (e.name.endsWith('.ts')) {
      const c = fs.readFileSync(p, 'utf8');
      const n = c.replace(re, '$1$2$3');
      if (n !== c) {
        fs.writeFileSync(p, n);
        console.log('updated', p);
      }
    }
  }
}

walk(root);
console.log('done');
