import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moo, encodeValue, decodeValue, HostError } from '../dist/index.js';
const options = { profile: 'toaststunt' };

test('lossless JSON codec preserves nested tags, wide integers and negative zero', () => {
  const original = moo.list([moo.int(9223372036854775807n), moo.float(-0), moo.object(-1),
    moo.error('E_TYPE'), moo.map([[moo.string('key'), moo.list([moo.int(7), moo.float(7), moo.object(7)])]])]);
  const json = JSON.stringify(encodeValue(original, options));
  assert.ok(json.includes('9223372036854775807'));
  assert.deepEqual(decodeValue(JSON.parse(json), options), original);
});

test('constructors isolate and freeze collection aliases', () => {
  const array = [moo.int(1)];
  const list = moo.list(array);
  array[0] = moo.int(2);
  assert.equal(list.value[0].value, 1n);
  assert.throws(() => { list.value[0] = moo.int(3); }, TypeError);
  assert.throws(() => moo.list([{ type: 'int', value: 1n }]), HostError);
  assert.throws(() => moo.int(Number.MAX_SAFE_INTEGER + 1), HostError);
  assert.throws(() => moo.float(Infinity), HostError);
});

test('host map construction uses the same scalar ordering and duplicate rule as MOO', () => {
  const map = moo.map([[moo.string('z'), moo.int(1)], [moo.string('A'), moo.int(2)], [moo.string('a'), moo.int(3)], [moo.int(7), moo.int(4)]]);
  assert.deepEqual(map.value.map(([key]) => key), [moo.int(7), moo.string('a'), moo.string('z')]);
  assert.equal(map.value[1][1].value, 3n);
  assert.throws(() => moo.map([[moo.list([]), moo.int(1)]]), HostError);
});

test('codec rejects malformed data, dialect mismatches and resource overflow', () => {
  for (const value of [null, [], { type: 'int', value: '01' }, { type: 'int', value: '-0' },
    { type: 'int', value: '9223372036854775808' }, { type: 'error', value: 'E_FAKE' },
    { type: 'float', value: NaN }, { type: 'list', value: {}, extra: true }]) {
    assert.throws(() => decodeValue(value, options), HostError);
  }
  assert.throws(() => encodeValue(moo.int(2147483648n), { profile: 'lambdamoo' }), HostError);
  assert.throws(() => decodeValue({ type: 'map', value: [] }, { profile: 'lambdamoo' }), HostError);
  const encoded = encodeValue(moo.list([moo.string('abc')]), options);
  for (const limits of [{ maxDepth: 0 }, { maxValues: 1 }, { maxStringUnits: 2 }]) {
    assert.throws(() => decodeValue(encoded, { ...options, ...limits }), HostError);
  }
  const cyclic = { type: 'list', value: [] }; cyclic.value.push(cyclic);
  assert.throws(() => decodeValue(cyclic, options), HostError);
});
