// Acceptance test 17: fail the build if personal data reached the output.
// Text files are scanned (binary fonts and images can contain any byte pair by chance).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = process.argv[2] || 'dist';
const FORBIDDEN = ['163.6', 'L4', 'hernia'];
const TEXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.txt', '.svg', '.xml', '.map']);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(root);
const problems = [];
for (const file of files) {
  if (!TEXT.has(extname(file))) continue;
  const text = readFileSync(file, 'utf8');
  for (const needle of FORBIDDEN) {
    const at = text.indexOf(needle);
    if (at !== -1) problems.push(`${file}: "${needle}" near "${text.slice(Math.max(0, at - 30), at + 30)}"`);
  }
}

if (problems.length) {
  console.error('Personal data found in the build:\n' + problems.join('\n'));
  process.exit(1);
}
console.log(`Privacy scan passed: ${files.length} files, none contain ${FORBIDDEN.join(', ')}.`);
