import { execFileSync } from 'node:child_process';
import { mkdtemp, cp, copyFile, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const revision = '5e42672ffa1a4e955fe6a04da534396282522242';
const image = 'emscripten/emsdk@sha256:47d573d5a86379a06f850de200d69407e6baa2d2f9c19d9e156a67db57f80f2f';
const cli = process.argv[2];
if (!cli) throw new Error('Usage: node scripts/rebuild-grammar.mjs /absolute/path/to/tree-sitter-0.25.10');
const version = execFileSync(resolve(cli), ['--version'], { encoding: 'utf8' }).trim();
if (version !== 'tree-sitter 0.25.10 (da6fe9beb4f7f67beb75914ca8e0d48ae48d6406)') throw new Error('Expected pinned tree-sitter CLI 0.25.10');
const upstream = resolve('vendor/tree-sitter-moo');
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: upstream, encoding: 'utf8' }).trim() !== revision) throw new Error('Unexpected grammar revision');
const temporary = await mkdtemp(join(tmpdir(), 'moo-grammar-rebuild-'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  await copyFile(resolve(cli), join(temporary, 'tree-sitter'));
  for (const file of ['grammar.js', 'tree-sitter.json', 'package.json', 'src']) await cp(join(upstream, file), join(temporary, file), { recursive: true });
  const docker = args => execFileSync('docker', ['run', '--rm', '--network=none', '--user', `${process.getuid()}:${process.getgid()}`,
    '--env', 'EM_CACHE=/work/.em-cache', '--mount', `type=bind,src=${temporary},dst=/work`, '--workdir', '/work', image, ...args], { stdio: 'inherit' });
  docker(['/work/tree-sitter', 'generate']);
  const generated = hash(await readFile(join(temporary, 'src/parser.c')));
  const checkedIn = hash(await readFile(join(upstream, 'src/parser.c')));
  if (generated !== checkedIn) throw new Error('Regenerated parser.c differs from pinned source');
  docker(['/work/tree-sitter', 'build', '--wasm', '-o', '/work/first.wasm']);
  docker(['/work/tree-sitter', 'build', '--wasm', '-o', '/work/second.wasm']);
  const first = await readFile(join(temporary, 'first.wasm')), second = await readFile(join(temporary, 'second.wasm'));
  if (hash(first) !== hash(second)) throw new Error('Repeated grammar builds differ');
  await mkdir('build/grammar', { recursive: true });
  await writeFile('build/grammar/tree-sitter-moo.wasm', first);
  const report = { revision, cli: version, image, parserSha256: generated, rebuiltSha256: hash(first),
    upstreamSha256: hash(await readFile(join(upstream, 'dist/tree-sitter-moo.wasm'))), repeatedBuildsMatch: true };
  await writeFile('build/grammar/provenance.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await rm(temporary, { recursive: true, force: true }); }
