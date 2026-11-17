// Usage: npm run bump -- 1.0.1   (or no argument to bump the patch number)
import { readFileSync, writeFileSync } from 'node:fs';
const cur = readFileSync('js/version.js', 'utf8').match(/'(\d+)\.(\d+)\.(\d+)'/);
const next = process.argv[2] || `${cur[1]}.${cur[2]}.${+cur[3] + 1}`;
writeFileSync('js/version.js', `export const VERSION = '${next}';\n`);
writeFileSync('sw.js', readFileSync('sw.js', 'utf8').replace(/const VERSION = '[^']+';/, `const VERSION = '${next}';`));
const pkg = JSON.parse(readFileSync('package.json', 'utf8')); pkg.version = next; writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('Version', next);
