import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRelease, publicationStatus } from '../scripts/release.mjs';

const manifest = {
  name: '@sindomecorp/moo-in-javascript', version: '0.2.3',
  publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/' },
};
const event = {
  action: 'published', repository: { full_name: 'SindomeCorp/moo-in-javascript' },
  release: { tag_name: 'v0.2.3', prerelease: false, draft: false },
};

test('release metadata selects latest or next only when labels match', () => {
  assert.deepEqual(validateRelease(event, manifest, true), { version: '0.2.3', distTag: 'latest' });
  const preview = { ...manifest, version: '0.3.0-beta.1' };
  const previewEvent = { ...event, release: { ...event.release, tag_name: 'v0.3.0-beta.1', prerelease: true } };
  assert.deepEqual(validateRelease(previewEvent, preview, true), { version: '0.3.0-beta.1', distTag: 'next' });
  assert.throws(() => validateRelease({ ...event, release: { ...event.release, prerelease: true } }, manifest, true), /labeling/);
  assert.throws(() => validateRelease({ ...previewEvent, release: { ...previewEvent.release, prerelease: false } }, preview, true), /labeling/);
});

test('release guard rejects wrong tags, branches, identity, drafts, and malformed versions', () => {
  assert.throws(() => validateRelease({ ...event, release: { ...event.release, tag_name: 'v0.2.4' } }, manifest, true), /tag/);
  assert.throws(() => validateRelease(event, manifest, false), /main/);
  assert.throws(() => validateRelease({ ...event, action: 'created' }, manifest, true), /published/);
  assert.throws(() => validateRelease({ ...event, repository: { full_name: 'someone/fork' } }, manifest, true), /upstream/);
  assert.throws(() => validateRelease({ ...event, release: { ...event.release, draft: true } }, manifest, true), /published/);
  assert.throws(() => validateRelease(event, { ...manifest, name: 'wrong' }, true), /identity/);
  assert.throws(() => validateRelease(event, { ...manifest, publishConfig: { access: 'restricted' } }, true), /configuration/);
  for (const version of ['01.2.3', '0.2.3-beta.01', '0.2.3+build', '0.2', '0.2.3;echo unsafe']) {
    assert.throws(() => validateRelease(event, { ...manifest, version }, true), /semantic version/);
  }
});

test('registry check distinguishes duplicate versions from missing versions and outages', async () => {
  let url;
  assert.equal(await publicationStatus(manifest.name, manifest.version, async input => {
    url = input;
    return new Response(JSON.stringify(manifest), { status: 200 });
  }), 'exists');
  assert.equal(url, 'https://registry.npmjs.org/%40sindomecorp%2Fmoo-in-javascript/0.2.3');
  assert.equal(await publicationStatus(manifest.name, manifest.version, async () => new Response(null, { status: 404 })), 'new');
  for (const status of [401, 403, 429, 500, 503]) {
    await assert.rejects(publicationStatus(manifest.name, manifest.version, async () => new Response(null, { status })), /registry check failed/);
  }
  await assert.rejects(publicationStatus(manifest.name, manifest.version, async () => { throw new Error('network unavailable'); }), /network unavailable/);
  await assert.rejects(publicationStatus(manifest.name, manifest.version, async () => new Response('{}')), /unexpected package/);
  await assert.rejects(publicationStatus(manifest.name, manifest.version, async () => new Response('not json')), SyntaxError);
});
