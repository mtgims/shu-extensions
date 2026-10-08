import { getJson } from '../host.ts';
import { hashId, tpbId } from '../ids.ts';
import { normalizeHash, trackersOf } from '../magnet.ts';
import type { Release } from '../types.ts';
import type { Indexer } from './types.ts';

/**
 * Knaben is a meta-search over many public trackers (1337x, RuTracker, The Pirate Bay, Nyaa,
 * LimeTorrents and more), which is how this extension covers sites behind Cloudflare.
 */
const API = 'https://api.knaben.org/v1';
const AUDIOBOOKS = 1003000;

interface Hit {
  title: string;
  hash: string | null;
  bytes: number | null;
  seeders: number | null;
  date: string | null;
  cachedOrigin: string | null;
  details: string | null;
  magnetUrl: string | null;
}

export function toRelease(hit: Hit): Release | undefined {
  const hash = normalizeHash(hit.hash);
  if (!hash) return undefined;
  const origin = hit.cachedOrigin?.replace(/\s*\(proxy\)$/i, '');
  const fromTpb = origin === 'The Pirate Bay' ? hit.details?.match(/[?&]id=(\d+)/)?.[1] : undefined;
  return {
    // The same id as the Pirate Bay indexer gives, so duplicates merge.
    id: fromTpb ? tpbId(fromTpb, hash) : hashId(hash),
    infoHash: hash,
    title: hit.title,
    source: origin ?? 'Knaben',
    seeders: hit.seeders ?? undefined,
    size: hit.bytes ?? undefined,
    added: hit.date ?? undefined,
    trackers: trackersOf(hit.magnetUrl),
    tpbId: fromTpb,
  };
}

export const knaben: Indexer = {
  name: 'Knaben',
  search: async (query) => {
    const res = await getJson<{ hits: Hit[] }>(API, {
      json: {
        search_type: '100%',
        search_field: 'title',
        query,
        categories: [AUDIOBOOKS],
        order_by: 'seeders',
        order_direction: 'desc',
        size: 100,
        hide_unsafe: true,
        hide_xxx: true,
      },
    });
    return res.hits.map(toRelease).filter((r): r is Release => r !== undefined);
  },
};
