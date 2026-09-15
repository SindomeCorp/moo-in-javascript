import { execFileSync } from 'node:child_process';
import { mkdtemp, cp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Validate all source inputs in a directory with no build output or dependencies.
const destination = await mkdtemp(join(tmpdir(), 'moo-clean-source-'));
try {
  for (const path of ['src', 'scripts', 'tests', 'docs', 'examples', 'package.json', 'package-lock.json', 'tsconfig.json', 'LICENSE', 'README.md']) {
    await cp(path, join(destination, path), { recursive: true });
  }
  await mkdir(join(destination, 'vendor'));
  for (const name of ['tree-sitter-moo', 'moo-for-llms']) {
    const source = resolve('vendor', name);
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
    const target = join(destination, 'vendor', name);
    execFileSync('git', ['clone', '--quiet', '--no-hardlinks', '--no-checkout', source, target]);
    execFileSync('git', ['checkout', '--quiet', '--detach', revision], { cwd: target });
  }
  execFileSync('npm', ['ci'], { cwd: destination, stdio: 'inherit' });
  execFileSync('npm', ['test'], { cwd: destination, stdio: 'inherit' });
  console.log('Isolated source build and tests passed with fresh dependencies and pinned submodule checkouts.');
} finally { await rm(destination, { recursive: true, force: true }); }
