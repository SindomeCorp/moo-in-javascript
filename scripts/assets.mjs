import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const revision = '5e42672ffa1a4e955fe6a04da534396282522242';
const actual = execFileSync('git', ['-C', 'vendor/tree-sitter-moo', 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (actual !== revision) throw new Error(`Grammar revision mismatch: ${actual}`);
await mkdir('assets', { recursive: true });
const entries = [
  ['vendor/tree-sitter-moo/dist/tree-sitter-moo.wasm', 'tree-sitter-moo.wasm'],
  ['node_modules/web-tree-sitter/tree-sitter.wasm', 'tree-sitter.wasm'],
  ['vendor/tree-sitter-moo/LICENSE', 'tree-sitter-moo.LICENSE'],
  ['node_modules/web-tree-sitter/LICENSE', 'web-tree-sitter.LICENSE'],
];
const hashes = {};
for (const [source, name] of entries) {
  await copyFile(source, `assets/${name}`);
  hashes[name] = createHash('sha256').update(await readFile(source)).digest('hex');
}
await writeFile('assets/provenance.json', JSON.stringify({ grammar: {
  repository: 'https://github.com/SindomeCorp/tree-sitter-moo', revision, version: '0.2.16',
}, runtime: { package: 'web-tree-sitter', version: '0.25.10' }, sha256: hashes }, null, 2) + '\n');
