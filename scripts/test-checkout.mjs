import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const source = resolve('.'), destination = await mkdtemp(join(tmpdir(), 'moo-git-checkout-'));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
try {
  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', source, destination]);
  for (const name of ['tree-sitter-moo', 'moo-for-llms']) {
    // Local mirrors avoid network availability affecting this build gate;
    // checkout revisions still come exclusively from the committed gitlinks.
    execFileSync('git', ['config', `submodule.vendor/${name}.url`, resolve('vendor', name)], { cwd: destination });
  }
  execFileSync('git', ['-c', 'protocol.file.allow=always', 'submodule', 'update', '--init'], { cwd: destination, stdio: 'inherit' });
  execFileSync('npm', ['ci'], { cwd: destination, stdio: 'inherit' });
  for (const command of ['test', 'test:browser', 'test:package']) execFileSync('npm', ['run', command], { cwd: destination, stdio: 'inherit' });
  console.log(`Clean committed checkout passed all gates: ${revision}`);
} finally { await rm(destination, { recursive: true, force: true }); }
