# Releasing to npm

The public package is `@sindomecorp/moo-in-javascript`, maintained from
[SindomeCorp/moo-in-javascript](https://github.com/SindomeCorp/moo-in-javascript).
Version **0.2.3** was published on npm on **2026-09-17**, followed by the
[GitHub release](https://github.com/SindomeCorp/moo-in-javascript/releases/tag/v0.2.3).
The initial local publication is complete; do not repeat it. Consumers can install
from npm:

```sh
npm install @sindomecorp/moo-in-javascript
```

Versions and changelog entries are maintained manually. Ordinary releases go to
npm's `latest` tag; versions with a prerelease suffix go to `next` and must also
be marked as prereleases on GitHub.

## Trusted publishing configuration

For future releases, maintain or verify the GitHub Actions publisher in the npm
package's Settings → Trusted Publishing:

| Field | Value |
| --- | --- |
| Organization or user | `SindomeCorp` |
| Repository | `moo-in-javascript` |
| Workflow filename | `release.yml` |
| Environment | Leave unset; the workflow does not use a GitHub environment |
| Allowed actions | Allow direct `npm publish` |

A maintainer needs publishing access to the `@sindomecorp` npm organization and
an npm account with two-factor authentication to configure trust. The workflow
uses GitHub-hosted runners, Node 24, npm 11.15.0, and a publishing job with
`id-token: write`. No npm publishing secret is needed. See
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).
Do not store credentials in this repository.

## Publish a new version

1. Start from `main` and update the version on a release preparation branch:

   ```sh
   npm version patch --no-git-tag-version
   ```

   Use `minor` for a deliberate pre-1.0 compatibility change, or supply an explicit
   version such as `0.3.0-beta.1` for a preview. Do not use build metadata suffixes.
   Commit both the manifest and lockfile with dated changelog notes. Explain
   compatibility changes and migration steps. Merge the reviewed change to `main`.

2. Wait for CI, then tag that commit as `v<package.json version>`, push the tag, and
   publish a GitHub Release using the changelog entry. Check GitHub's prerelease
   option only when the package version has a prerelease suffix. A tag push alone
   does not publish to npm.
3. The workflow validates the tag, version, repository, prerelease label, and
   membership of the tagged commit in `main`. It runs the Node 22 coverage,
   browser, and package gates and the Node 24 unit suite. Failed checks block
   publication.
4. A packaging job builds one tarball and tests it in clean consumers on Node 24.
   It rehearses `npm publish --dry-run` and uploads the artifact for 14 days.
   The publishing job downloads and publishes those same bytes using OIDC.
5. Check the Actions run and the npm version page. Automated publication from
   this public repository generates provenance through npm trusted publishing.
   The initial local publication did not get that GitHub Actions provenance.
   Verify installation in a fresh directory:

   ```sh
   npm install "@sindomecorp/moo-in-javascript@<version>"
   node node_modules/@sindomecorp/moo-in-javascript/examples/node.mjs
   ```

The first successful automated npm publication verifies the OIDC setup end to
end. A local dry run cannot validate GitHub's identity exchange or your npm
publisher settings.

README changes appear on GitHub when pushed. npm updates the package-page README
only when a new package version is published; include documentation changes in
the next release. See [npm README updates](https://docs.npmjs.com/about-package-readme-files/#updating-an-existing-package-readmemd-file).

## Failures and retries

An existing version is reported and skipped, allowing retries and the initial
bootstrap release without attempting to overwrite npm artifacts. Registry
connection failures, authentication errors, and unexpected responses fail the
workflow; only a 404 means a version is absent.

For a failed gate, fix the source through normal review and prepare a new version
and tag. Do not move a release tag to different source. For a transient registry
or authentication failure, fix the external configuration and rerun the failed
workflow. If publication already succeeded, the version check skips it on retry.

For authentication failures, verify the exact organization, repository, workflow
filename, allowed publishing action, and job OIDC permission. Renaming
`release.yml` requires updating the npm trusted publisher. No temporary-token
fallback is built in.

npm versions are immutable. Correct a bad published release with a new version;
use npm deprecation when consumers need a notice. A successful GitHub Release is
not evidence of successful npm publication: inspect the workflow and registry.
