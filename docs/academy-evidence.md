# Academy scenario evidence

The independent package tests use authored solutions to the six current academy
lesson challenges. They do not call the academy's canned result functions.

Reference inspected on 2026-09-15:

- Local source: `/home/seven/moo-academy/moo-field-manual/dist/lessons.js`
- SHA-256: `fd947747e5755189f006ea710ecbc3e06b17b961238e262ada441e2146782c4b`
- Lesson IDs: objects, properties, args, branching, lists, errors.

`tests/academy.test.mjs` holds the authored source and reviewed output/state
expectations. It executes every solution under both profiles, checks exact output
text and recipient, asserts return values and the lamp property change, and runs
a failing alternative for each lesson. The branching scenario also runs with the
opposite lock state. The tests require neither an academy checkout nor a MOO
server. Diagnostic annotations from the old UI are not treated as MOO output.

This proves the package can execute the six scenarios. It does not prove academy
adoption: the academy application is unchanged and must be integrated separately
after snapshots, execution workers and cancellation are ready.
