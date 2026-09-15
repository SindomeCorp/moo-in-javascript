import { build } from 'esbuild';
for (const [entry, outfile] of [['src/index.ts', 'dist/browser/index.js'], ['src/fixtures/index.ts', 'dist/browser/fixtures.js'], ['src/worker/entry.ts', 'dist/worker/browser.js']]) {
  await build({ entryPoints: [entry], outfile, bundle: true, platform: 'browser',
    format: 'esm', target: 'es2022', external: ['node:*', 'fs/promises', 'module'], sourcemap: true,
    plugins: entry === 'src/fixtures/index.ts' ? [{ name: 'shared-core', setup(build) {
      build.onResolve({ filter: /\/(world|values)\/index\.js$/ }, () => ({ path: './index.js', external: true }));
    } }] : [],
  });
}
