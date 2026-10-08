// Pure logic of the extension, run in Node. Parsing with host.select and real requests are
// covered by the app's integration test, which runs this extension in the real engine.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toBook, toSummary } from '../src/books.ts';
import { flattenTree } from '../src/debrid/alldebrid.ts';
import { chapters, naturalCompare, pickFile } from '../src/files.ts';
import { audioTags, formatSize, parseSize } from '../src/format.ts';
import { abbId, hashId, parseId, tpbId } from '../src/ids.ts';
import { toRelease as fromKnaben } from '../src/indexers/knaben.ts';
import { toRelease as fromTpb } from '../src/indexers/piratebay.ts';
import { parseFeed } from '../src/indexers/torznab.ts';
import { hashFromMagnet, magnetLink, normalizeHash, trackersOf } from '../src/magnet.ts';
import { mainTitle, rankReleases } from '../src/releases.ts';
import { mergeDuplicates, rank, relevance } from '../src/search.ts';
import type { Release } from '../src/types.ts';

const HASH = '0f54898dc1b8e49d96e32827377f651ea6c935af';

test('natural order without Intl', () => {
  const names = [
    'Chapter 10.mp3',
    'chapter 2.mp3',
    'Chapter 1.mp3',
    'Intro.mp3',
    'Chapter 02b.mp3',
  ];
  assert.deepEqual(names.sort(naturalCompare), [
    'Chapter 1.mp3',
    'chapter 2.mp3',
    'Chapter 02b.mp3',
    'Chapter 10.mp3',
    'Intro.mp3',
  ]);
  assert.deepEqual(
    chapters([{ name: 'b/10.mp3' }, { name: 'b/cover.jpg' }, { name: 'b/9.MP3' }]).map(
      (f) => f.name,
    ),
    ['b/9.MP3', 'b/10.mp3'],
  );
});

test('book ids carry what is needed after a restart', () => {
  assert.deepEqual(parseId(tpbId('45465717', HASH.toUpperCase())), {
    kind: 'tpb',
    tpbId: '45465717',
    hash: HASH,
  });
  assert.deepEqual(parseId(hashId(HASH)), { kind: 'h', hash: HASH });
  assert.deepEqual(parseId(abbId('some-book')), { kind: 'abb', slug: 'some-book' });
  assert.equal(parseId('atb:abb:../x'), undefined);
  assert.equal(parseId('atb:h:nothex'), undefined);
});

// AudioBook Bay lists "Folder File.ext" for "Folder/File.ext" and uses curly apostrophes.
const hpOnTorbox = [
  ["01 Harry Potter and the Philosopher's Stone (FCE)", "Philosopher's Stone", 644_811_325],
  ['04 Harry Potter and the Goblet of Fire (FCE)', 'Goblet of Fire', 1_401_000_000],
  ['07 Harry Potter and the Deathly Hallows (FCE)', 'Deathly Hallows', 1_389_000_000],
].map(([folder, title, size]) => ({
  name: `Complete Harry Potter (Fullcast)/${folder}/Harry Potter and the ${title} [Opus 5.1ch Encode].opus`,
  size: size as number,
}));

test('pickFile: name, joined path, size, then position', () => {
  const listed = (n: string, t: string) =>
    `${n} Harry Potter and the ${t} (FCE) Harry Potter and the ${t} [Opus 5.1ch Encode].opus`;
  assert.equal(pickFile(hpOnTorbox, { name: listed('01', 'Philosopher’s Stone') }), hpOnTorbox[0]);
  assert.equal(pickFile(hpOnTorbox, { name: listed('07', 'Deathly Hallows') }), hpOnTorbox[2]);

  const renamed = hpOnTorbox.map((f, i) => ({ ...f, name: `disc ${i}/track.opus` }));
  assert.equal(pickFile(renamed, { name: 'x', size: Math.round(614.94 * 1024 ** 2) }), renamed[0]);
  const gb13 = Math.round(1.3 * 1024 ** 3);
  assert.equal(pickFile(renamed, { name: 'x', size: gb13 }), undefined);
  assert.equal(pickFile(renamed, { name: 'x', size: gb13, position: 2, count: 3 }), renamed[2]);
  assert.equal(pickFile(renamed, { name: 'x', position: 2, count: 7 }), undefined);
  assert.equal(pickFile(renamed)?.size, 1_401_000_000);

  const cyrillic = [{ name: 'Книга/Глава 1.mp3' }, { name: 'Книга/Глава 2.mp3' }];
  assert.equal(pickFile(cyrillic, { name: 'Глава 2.mp3' }), cyrillic[1]);
  assert.equal(pickFile(cyrillic, { name: 'Глава 3.mp3' }), undefined);
});

test('magnets and hashes without URLSearchParams', () => {
  const magnet = magnetLink(HASH, 'A Book & More', ['udp://a.example:1/announce']);
  assert.match(
    magnet,
    new RegExp(`^magnet:\\?xt=urn:btih:${HASH}&dn=A%20Book%20%26%20More&tr=udp`),
  );
  assert.deepEqual(trackersOf(magnet).slice(0, 1), ['udp://a.example:1/announce']);
  assert.equal(hashFromMagnet(magnet), HASH);
  assert.equal(normalizeHash('B5KITDOBXDSJ3FXDFATTO73FD2TMSNNP'), HASH);
});

test('indexer rows become releases with mergeable ids', () => {
  const tpb = fromTpb({
    id: '45465717',
    name: 'Book',
    info_hash: HASH.toUpperCase(),
    seeders: '338',
    size: '933905211',
    added: '1621161202',
    category: '102',
  });
  const kn = fromKnaben({
    title: 'Book',
    hash: HASH,
    bytes: 1,
    seeders: 5,
    date: null,
    cachedOrigin: 'The Pirate Bay (proxy)',
    details: 'https://knaben.xyz/thepiratebay/description.php?id=45465717',
    magnetUrl: `magnet:?xt=urn:btih:${HASH}&tr=udp%3A%2F%2Ft.example%3A1%2Fannounce`,
  });
  assert.equal(tpb?.id, kn?.id);
  const [merged] = mergeDuplicates([tpb as Release, kn as Release]);
  assert.equal(merged?.seeders, 338);
  assert.ok(merged?.trackers?.includes('udp://t.example:1/announce'));
});

test('ranking: title match, then unknown seeders, then most seeders', () => {
  assert.equal(relevance('Project Hail Mary Andy Weir', 'andy weir project hail mary'), 1);
  const list: Release[] = [
    { id: '1', title: 'Get Lost', source: 's', seeders: 500 },
    { id: '2', title: 'Project Hail Mary', source: 's' },
    { id: '3', title: 'Project Hail Mary MP3', source: 's', seeders: 10 },
  ];
  assert.deepEqual(
    rank(list, 'project hail mary').map((r) => r.id),
    ['2', '3', '1'],
  );
});

test('Torznab feeds parse without an XML library', () => {
  const xml = `<rss xmlns:torznab="http://torznab.com/schemas/2015/feed"><channel>
    <item><title><![CDATA[With & hash]]></title><size>1000</size><pubDate>Sun, 16 May 2021 10:00:00 +0000</pubDate>
      <torznab:attr name="seeders" value="12"/><torznab:attr name="infohash" value="${HASH}"/></item>
    <item><title>Magnet only</title><torznab:attr name="magneturl" value="magnet:?xt=urn:btih:${'a'.repeat(40)}&amp;dn=x"/></item>
    <item><title>Only a file</title><link>https://jackett/dl/1.torrent</link></item>
  </channel></rss>`;
  assert.deepEqual(
    parseFeed(xml, 'J').map((r) => [r.title, r.seeders, r.infoHash, r.size]),
    [
      ['With & hash', 12, HASH, 1000],
      ['Magnet only', undefined, 'a'.repeat(40), undefined],
    ],
  );
});

test('books: chapters in order, whole-torrent fallback, credits split', () => {
  const release: Release = {
    id: hashId(HASH),
    infoHash: HASH,
    title: 'Dune 64kbps M4B',
    source: 'AudioBook Bay',
    narrator: 'Scott Brick, Simon Vance',
    size: 1536 * 1024 ** 2,
    files: [
      { idx: 0, name: 'b/02.mp3', size: 1 },
      { idx: 1, name: 'b/cover.jpg' },
      { idx: 2, name: 'b/01.mp3', size: 1 },
    ],
  };
  assert.deepEqual(
    toBook(release).chapters.map((c) => c.id),
    ['2', '0'],
  );
  assert.deepEqual(
    toBook({ ...release, files: undefined }).chapters.map((c) => c.id),
    ['-1'],
  );
  const summary = toSummary(release);
  assert.deepEqual(summary.narrators, ['Scott Brick', 'Simon Vance']);
  assert.deepEqual(summary.tags, ['M4B', '64 kbps']);
  assert.equal(summary.details, '1.50 GB · AudioBook Bay');
});

test('sizes and AllDebrid trees', () => {
  assert.equal(parseSize('205.01 MBs'), Math.round(205.01 * 1024 ** 2));
  assert.equal(formatSize(undefined), '?');
  assert.deepEqual(audioTags('x 128kbps MP3'), { format: 'MP3', bitrate: '128 kbps' });
  assert.deepEqual(flattenTree([{ n: 'A', e: [{ n: '1.mp3', s: 5, l: 'u' }] }]), [
    { name: 'A/1.mp3', size: 5, link: 'u' },
  ]);
});

test('releases: the book itself first, then collections, translations and summaries', () => {
  const work = { title: "Harry Potter and the Philosopher's Stone", authors: ['J. K. Rowling'] };
  const r = (id: string, title: string, seeders?: number): Release => ({
    id,
    title,
    source: 's',
    seeders,
  });
  const ranked = rankReleases(
    [
      r(
        'ru',
        'Роулинг Джоан - Гарри Поттер и Философский камень / Harry Potter and the Philosopher’s Stone Rowling',
        90,
      ),
      r(
        'en-ru',
        '[Английский] Rowling Joanne - Harry Potter and the Philosopher’s Stone [Stephen Fry]',
        20,
      ),
      r(
        'box',
        'J.K. Rowling - Harry Potter Complete Collection (Philosopher’s Stone to Deathly Hallows)',
        500,
      ),
      r('one', 'J.K. Rowling - Harry Potter and the Philosopher’s Stone (Stephen Fry)', 40),
      r('summary', 'Summary of Harry Potter and the Philosopher’s Stone by J.K. Rowling', 5),
      r('other', 'J.K. Rowling - Harry Potter and the Chamber of Secrets', 300),
      r('wrong-author', 'Harry Potter and the Philosopher’s Stone - Fan Reading', 300),
    ],
    work,
  );
  assert.deepEqual(
    ranked.map((x) => x.id),
    ['one', 'en-ru', 'box', 'ru', 'summary'],
  );
  assert.equal(mainTitle('Dune: Deluxe Edition (Dune Chronicles, Book 1)'), 'Dune');
});

test('releases: translated editions rank below the original', () => {
  const work = { title: 'Atomic Habits', authors: ['James Clear'] };
  const ranked = rankReleases(
    [
      {
        id: 'hindi',
        title: 'Atomic Habits (Hindi Edition) - James Clear',
        source: 's',
        seeders: 90,
      },
      {
        id: 'es',
        title: 'James Clear - Hábitos Atómicos [Español] Atomic Habits',
        source: 's',
        seeders: 80,
      },
      { id: 'en', title: 'Atomic Habits - James Clear (Unabridged)', source: 's', seeders: 10 },
    ],
    work,
  );
  assert.deepEqual(
    ranked.map((r) => r.id),
    ['en', 'hindi', 'es'],
  );
});
