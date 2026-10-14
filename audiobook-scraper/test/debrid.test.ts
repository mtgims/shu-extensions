// Debrid services against canned API answers. `host` is read when the modules load, so the
// fake goes in first and the modules are imported after it.
import assert from 'node:assert/strict';
import { test } from 'node:test';

type Reply = { status?: number; body: unknown };
let answer: (url: string) => Reply = () => ({ body: {} });
const cache = new Map<string, unknown>();
(globalThis as unknown as { host: unknown }).host = {
  settings: {},
  fetch: async (url: string) => {
    const { status = 200, body } = answer(url);
    return { status, ok: status < 300, headers: {}, text: JSON.stringify(body) };
  },
  cache: {
    get: async (key: string) => cache.get(key) ?? null,
    set: async (key: string, value: unknown) => void cache.set(key, value),
  },
  sleep: async () => {},
  log: () => {},
};
const { realdebrid } = await import('../src/debrid/realdebrid.ts');
const { alldebrid } = await import('../src/debrid/alldebrid.ts');
const { NotReadyError } = await import('../src/debrid/types.ts');

const HASH = '0f54898dc1b8e49d96e32827377f651ea6c935af';
const files = [{ id: 1, path: '/Book/01.mp3', bytes: 100, selected: 1 }];

test('Real-Debrid: a torrent removed on the site is added again; failures are errors', async () => {
  cache.set(`realdebrid-id:${HASH}`, 'gone');
  answer = (url) => {
    if (url.includes('/torrents/info/gone')) return { status: 404, body: { error: 'unknown' } };
    if (url.endsWith('/torrents?limit=100')) return { body: [] };
    if (url.endsWith('/addMagnet')) return { body: { id: 'new' } };
    if (url.includes('/torrents/info/new')) {
      return { body: { id: 'new', status: 'downloaded', files, links: ['https://rd/l'] } };
    }
    if (url.endsWith('/unrestrict/link')) return { body: { download: 'https://rd/file.mp3' } };
    throw new Error(`unexpected ${url}`);
  };
  assert.equal(await realdebrid.resolve('key', 'magnet:', HASH, {}), 'https://rd/file.mp3');
  assert.equal(cache.get(`realdebrid-id:${HASH}`), 'new');
  assert.deepEqual(await realdebrid.cachedFiles?.('key', HASH), [
    { idx: 1, name: '/Book/01.mp3', size: 100 },
  ]);

  answer = () => ({ body: { id: 'new', status: 'dead', progress: 0, files, links: [] } });
  await assert.rejects(
    realdebrid.resolve('key', 'magnet:', HASH, {}),
    (err) => !(err instanceof NotReadyError) && /dead/.test(String(err)),
  );
  answer = () => ({ body: { id: 'new', status: 'downloading', progress: 40, files, links: [] } });
  await assert.rejects(realdebrid.resolve('key', 'magnet:', HASH, {}), NotReadyError);
});

test('AllDebrid: a failed download is an error, not "still downloading"', async () => {
  const status = (statusCode: number, text: string) => (url: string) =>
    url.includes('/magnet/upload')
      ? { body: { status: 'success', data: { magnets: [{ id: 7 }] } } }
      : { body: { status: 'success', data: { magnets: { status: text, statusCode } } } };
  answer = status(7, 'Not downloaded in 20 min');
  await assert.rejects(
    alldebrid.resolve('key', 'magnet:', HASH, {}),
    (err) => !(err instanceof NotReadyError) && /20 min/.test(String(err)),
  );
  answer = status(1, 'Downloading');
  await assert.rejects(alldebrid.resolve('key', 'magnet:', HASH, {}), NotReadyError);
});
