# Releasing to npm

The public package is `@sindomecorp/moo-in-javascript`, maintained from
[SindomeCorp/moo-in-javascript](https://github.com/SindomeCorp/moo-in-javascript).
The initial version is **0.2.3**. Versions and changelog entries are maintained
manually. Ordinary releases go to npm's `latest` tag; versions with a prerelease
suffix go to `next` and must also be marked as prereleases on GitHub.

## First publication: one-time local setup

A maintainer needs publishing access to the `@sindomecorp` npm organization and an
npm account with two-factor authentication. The package must exist before npm
can configure a trusted publisher; see the
[npm prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/#prerequisites).
Do not store credentials in this repository.

1. Prepare the 0.2.3 changelog entry with its actual release date, commit the
   intended source and documentation, and push `main`. Wait for CI to pass.
2. From that clean commit, initialize submodules, install dependencies and the
   browser, and verify the committed checkout:

   ```sh
   git submodule update --init --recursive
   npm ci
   npx playwright install chromium
   npm run test:checkout
   npm run test:coverage
   ```

3. Build and test the exact artifact to publish:

   ```sh
   npm pack
   node scripts/test-package.mjs ./sindomecorp-moo-in-javascript-0.2.3.tgz
   npm publish ./sindomecorp-moo-in-javascript-0.2.3.tgz --dry-run --ignore-scripts --access public
   ```

   Inspect npm's file inventory: it must contain compiled JS, declarations,
   browser/worker bundles, WASM, notices, documentation, and examples. It must not
   contain the development corpus, tests, scripts, or local build/test output.
   Keep the tested tarball unchanged for the next step.

4. Log in interactively and publish that artifact, completing npm's authentication
   prompts:

   ```sh
   npm login
   npm publish ./sindomecorp-moo-in-javascript-0.2.3.tgz --ignore-scripts --access public --tag latest
   ```

5. In the npm package's Settings → Trusted Publishing, add a GitHub Actions
   publisher with these exact values:

   | Field | Value |
   | --- | --- |
   | Organization or user | `SindomeCorp` |
   | Repository | `moo-in-javascript` |
   | Workflow filename | `release.yml` |
   | Environment | Leave unset; the workflow does not use a GitHub environment |
   | Allowed actions | Allow direct `npm publish` |

   The workflow uses GitHub-hosted runners, Node 24, npm 11.15.0, and a publishing
   job with `id-token: write`. No npm publishing secret is needed. See
   [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

6. Tag the same commit and publish its GitHub Release with the changelog notes:

   ```sh
   git tag v0.2.3
   git push origin v0.2.3
   ```

   Publishing the GitHub Release starts the workflow. Because 0.2.3 already
   exists on npm, the workflow validates it and reports that publication was
   skipped. This verifies workflow gates, but does not exercise OIDC publication.

## Subsequent releases

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
   The first local publication does not get that GitHub Actions provenance.
   Verify installation in a fresh directory:

   ```sh
   npm install "@sindomecorp/moo-in-javascript@<version>"
   node node_modules/@sindomecorp/moo-in-javascript/examples/node.mjs
   ```

The first subsequent release verifies the OIDC setup end to end. A local dry run
cannot validate GitHub's identity exchange or your npm publisher settings.

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
