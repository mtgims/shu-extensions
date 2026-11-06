import { getJson } from '../host.ts';
import { hashId } from '../ids.ts';
import { normalizeHash } from '../magnet.ts';
import type { Release } from '../types.ts';
import type { Indexer } from './types.ts';

/** Bitsearch indexes torrents seen on the DHT. Its API needs no key. */
const API = 'https://bitsearch.to/api/v1/search';
const NAME = 'Bitsearch';
/** "AudioBook", and "Other/Audio" where many audiobooks land instead (checked November 2026). */
const CATEGORIES = [{ category: 8 }, { category: 1, subCategory: 1 }];

export interface Hit {
  infohash: string;
  title: string;
  size: number | null;
  seeders: number | null;
}

// No date: its `updatedAt` is when the DHT last saw the torrent, not when it was posted.
export function toRelease(hit: Hit): Release | undefined {
  const hash = normalizeHash(hit.infohash);
  if (!hash) return undefined;
  return {
    id: hashId(hash),
    infoHash: hash,
    title: hit.title,
    source: NAME,
    seeders: hit.seeders ?? undefined,
    size: hit.size ?? undefined,
    trackers: ['udp://tracker.bitsearch.to:1337/announce'],
  };
}

export const bitsearch: Indexer = {
  name: NAME,
  search: async (query) => {
    const pages = await Promise.all(
      CATEGORIES.map((c) =>
        getJson<{ results: Hit[] }>(API, {
          query: { q: query, sort: 'seeders', limit: 50, ...c },
        }),
      ),
    );
    return pages
      .flatMap((p) => p.results)
      .map(toRelease)
      .filter((r): r is Release => r !== undefined);
  },
};
