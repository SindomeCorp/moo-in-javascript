import { appendFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const packageName = '@sindomecorp/moo-in-javascript';
const repository = 'SindomeCorp/moo-in-javascript';

export function validateRelease(event, manifest, isOnMain) {
  if (event.action !== 'published' || event.repository?.full_name !== repository ||
      !event.release || event.release.draft) {
    throw new Error('Only published releases from the upstream repository can publish.');
  }
  if (manifest.name !== packageName || manifest.publishConfig?.access !== 'public' ||
      manifest.publishConfig?.registry !== 'https://registry.npmjs.org/') {
    throw new Error('Unexpected package identity or publishing configuration.');
  }
  const version = manifest.version;
  const match = typeof version === 'string' && version.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/,
  );
  if (!match || match[4]?.split('.').some(part => /^\d+$/.test(part) && /^0\d/.test(part))) {
    throw new Error('Use a semantic version without build metadata.');
  }
  if (event.release.tag_name !== `v${version}`) throw new Error('Release tag must match the package version.');
  if (!isOnMain) throw new Error('Release commit must be contained in origin/main.');
  const prerelease = Boolean(match[4]);
  if (event.release.prerelease !== prerelease) {
    throw new Error('GitHub prerelease labeling must match the package version suffix.');
  }
  return { version, distTag: prerelease ? 'next' : 'latest' };
}

export async function publicationStatus(name, version, fetcher = fetch) {
  const response = await fetcher(
    `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (response.status === 404) return 'new';
  if (!response.ok) throw new Error(`npm registry check failed: HTTP ${response.status}`);
  const published = await response.json();
  if (published.name !== name || published.version !== version) {
    throw new Error('npm registry returned unexpected package metadata.');
  }
  return 'exists';
}

async function main() {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  const command = process.argv[2];
  let output;
  if (command === 'validate') {
    const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
    // execFileSync uses arguments directly; release names never become shell code.
    execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main'], { stdio: 'pipe' });
    const release = validateRelease(event, manifest, true);
    output = `dist-tag=${release.distTag}\nversion=${release.version}\n`;
  } else if (command === 'status') {
    if (manifest.name !== packageName) throw new Error('Unexpected package name.');
    const status = await publicationStatus(manifest.name, manifest.version);
    output = `status=${status}\n`;
    if (status === 'exists') console.log(`${manifest.name}@${manifest.version} already exists; publication skipped.`);
  } else {
    throw new Error('Usage: node scripts/release.mjs <validate|status>');
  }
  console.log(output.trim());
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
