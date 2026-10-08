import { getJson } from '../host.ts';
import { tpbId } from '../ids.ts';
import { normalizeHash } from '../magnet.ts';
import type { Release, TorrentFile } from '../types.ts';
import type { Indexer } from './types.ts';

const API = 'https://apibay.org';
const AUDIOBOOKS = 102;
const NAME = 'The Pirate Bay';

const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.bittor.pw:1337/announce',
  'udp://public.popcorn-tracker.org:6969/announce',
];

interface ApiTorrent {
  id: string | number;
  name: string;
  info_hash: string;
  seeders: string | number;
  size: string | number;
  added: string | number;
  category: string | number;
}

export function toRelease(t: ApiTorrent): Release | undefined {
  const hash = normalizeHash(t.info_hash);
  // apibay answers an empty search with a single placeholder row with id 0.
  if (!hash || String(t.id) === '0' || Number(t.category) !== AUDIOBOOKS) return undefined;
  return {
    id: tpbId(String(t.id), hash),
    infoHash: hash,
    title: t.name,
    source: NAME,
    seeders: Number(t.seeders),
    size: Number(t.size),
    added: new Date(Number(t.added) * 1000).toISOString(),
    trackers: TRACKERS,
    tpbId: String(t.id),
  };
}

const toReleases = (rows: ApiTorrent[]) =>
  rows.map(toRelease).filter((r): r is Release => r !== undefined);

export const piratebay: Indexer = {
  name: NAME,
  search: async (query) =>
    toReleases(
      await getJson<ApiTorrent[]>(`${API}/q.php`, { query: { q: query, cat: AUDIOBOOKS } }),
    ),
};

/** The 100 most seeded audiobooks. */
export async function top100(): Promise<Release[]> {
  return toReleases(
    await getJson<ApiTorrent[]>(`${API}/precompiled/data_top100_${AUDIOBOOKS}.json`),
  );
}

/** File list in torrent order. */
export async function torrentFiles(id: string): Promise<TorrentFile[]> {
  const rows = await getJson<{ name: string[]; size: number[] }[]>(`${API}/f.php`, {
    query: { id },
  });
  const files = rows.map((row, idx) => ({ idx, name: row.name[0] ?? '', size: row.size[0] }));
  return files.filter((f) => f.name && f.name !== 'Filelist not found');
}
