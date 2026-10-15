// Every release bumps the version in four places; this catches one left behind.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('manifest, package.json, index.json and CHANGELOG agree on the version', () => {
  const { version } = JSON.parse(read('../package.json'));
  const folder = new URL('..', import.meta.url).pathname.split('/').at(-2);
  // Both extensions built from this folder share src/version.ts.
  const manifest = read('../src/version.ts').match(/VERSION = '([^']+)'/)?.[1];
  const listed = JSON.parse(read('../../index.json'))
    .extensions.filter((e: { url: string }) => e.url.startsWith(`${folder}/`))
    .map((e: { version: string }) => e.version);
  const logged = read('../CHANGELOG.md').match(/^## (\S+)/m)?.[1];
  assert.equal(listed.length, 2);
  assert.deepEqual([manifest, ...listed, logged], [version, version, version, version]);
});
