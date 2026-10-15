// Torrents played by the app (host.torrent), with a fake app. `host` is read when the modules
// load, so the fake goes in first and the modules are imported after it.
import assert from 'node:assert/strict';
import { test } from 'node:test';

type Options = Record<string, unknown>;
const calls: { op: string; magnet: string; index?: number; options?: Options }[] = [];
const cache = new Map<string, unknown>();
const torrent = {
  files: async (magnet: string, options?: Options) => {
    calls.push({ op: 'files', magnet, options });
    return [
      { index: 1, path: 'Book/01 Opening.mp3', size: 1000 },
      { index: 2, path: 'Book/02 Middle.mp3', size: 2000 },
      { index: 3, path: 'Book/cover.jpg', size: 10 },
    ];
  },
  stream: async (magnet: string, index: number, options?: Options) => {
    calls.push({ op: 'stream', magnet, index, options });
    return `http://127.0.0.1:4100/stream/x?index=${index}`;
  },
};
const host: Record<string, unknown> = {
  settings: {},
  torrent,
  cache: {
    get: async (key: string) => cache.get(key) ?? null,
    set: async (key: string, value: unknown) => void cache.set(key, value),
  },
  sleep: async () => {},
  log: () => {},
};
(globalThis as unknown as { host: unknown }).host = host;
const { torrent: service, torrentOptions } = await import('../src/debrid/torrent.ts');
const { configuredServices, useServices } = await import('../src/services.ts');

const HASH = '0f54898dc1b8e49d96e32827377f651ea6c935af';
const magnet = `magnet:?xt=urn:btih:${HASH}`;

test('plays the wanted file through the app, with the settings as options', async () => {
  calls.length = 0;
  host.settings = { keepDays: 'forever', storageLimit: '2', uploadLimit: '50' };
  const url = await service.resolve('', magnet, HASH, { name: 'Book 02 Middle.mp3' });
  assert.equal(url, 'http://127.0.0.1:4100/stream/x?index=2');
  const stream = calls.find((c) => c.op === 'stream');
  assert.equal(stream?.index, 2);
  assert.deepEqual(stream?.options, {
    folder: undefined,
    deleteWhenFinished: true,
    keepDays: null,
    storageLimit: 2 * 2 ** 30,
    downloadLimit: 0,
    uploadLimit: 50 * 1024,
    shareAfter: false,
  });
});

test('defaults work with nothing set', () => {
  host.settings = {};
  const o = torrentOptions();
  assert.equal(o.keepDays, 30);
  assert.equal(o.storageLimit, 5 * 2 ** 30);
  assert.equal(o.deleteWhenFinished, true);
});

test('the file list comes from the app when an indexer has none', async () => {
  assert.deepEqual((await service.cachedFiles?.('', HASH))?.slice(0, 1), [
    { idx: 1, name: 'Book/01 Opening.mp3', size: 1000 },
  ]);
});

test('ready without a key; an older app gets a clear message', async () => {
  useServices({ torrent: service });
  assert.deepEqual(
    configuredServices().map((s) => s.service.id),
    ['torrent'],
  );
  host.torrent = undefined;
  await assert.rejects(service.resolve('', magnet, HASH, {}), /Update Shu to 0\.6\.0/);
  host.torrent = torrent;
});
