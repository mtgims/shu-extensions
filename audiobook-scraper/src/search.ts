import { cached, host, setting, withTimeout } from './host.ts';
import { audiobookbay } from './indexers/audiobookbay.ts';
import { knaben } from './indexers/knaben.ts';
import { piratebay } from './indexers/piratebay.ts';
import { torznab } from './indexers/torznab.ts';
import type { Indexer } from './indexers/types.ts';
import type { Release } from './types.ts';

const INDEXERS: Record<string, Indexer> = { audiobookbay, piratebay, knaben };

/** No single site may hold up a search longer than this. */
const INDEXER_TIMEOUT = 10_000;

/** Keeps what a search found, so opening a book doesn't need to look it up again. */
export async function remember(list: Release[]): Promise<Release[]> {
  await Promise.all(list.map((r) => host.cache.set(`rel:${r.id}`, r, 24 * 3600)));
  return list;
}

export const recall = (id: string) => host.cache.get<Release>(`rel:${id}`);

/** Same torrent from several indexers becomes one release with the best numbers of each. */
export function mergeDuplicates(list: Release[]): Release[] {
  const byId = new Map<string, Release>();
  for (const r of list) {
    const seen = byId.get(r.id);
    if (!seen) {
      byId.set(r.id, { ...r });
      continue;
    }
    if (!seen.source.split(', ').includes(r.source)) seen.source += `, ${r.source}`;
    seen.seeders = Math.max(seen.seeders ?? 0, r.seeders ?? 0);
    seen.trackers = [...new Set([...(seen.trackers ?? []), ...(r.trackers ?? [])])];
    seen.tpbId ??= r.tpbId;
    seen.size ??= r.size;
  }
  return [...byId.values()];
}

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** Share of the query's words found in the title, from 0 to 1. */
export function relevance(title: string, query: string): number {
  const inTitle = new Set(words(title));
  const wanted = words(query);
  return wanted.length === 0 ? 1 : wanted.filter((w) => inTitle.has(w)).length / wanted.length;
}

/**
 * Best title match first (AudioBook Bay also matches on tags), then most seeders. AudioBook Bay
 * shows no seeder counts; as the dedicated audiobook tracker it goes first within its tier.
 */
export function rank(list: Release[], query: string): Release[] {
  const score = new Map(list.map((r) => [r, relevance(`${r.title} ${r.author ?? ''}`, query)]));
  const seeders = (r: Release) => r.seeders ?? Number.MAX_SAFE_INTEGER;
  return [...list].sort(
    (a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0) || seeders(b) - seeders(a),
  );
}

export function enabledIndexers(): Indexer[] {
  const chosen = setting<string[]>('sources', Object.keys(INDEXERS));
  const list = chosen.map((id) => INDEXERS[id]).filter((i): i is Indexer => i !== undefined);
  const torznabUrl = setting('torznabUrl', '');
  if (/^https?:\/\//.test(torznabUrl)) list.push(torznab(torznabUrl, setting('torznabKey', '')));
  return list;
}

/** Searches all enabled indexers at once. A failing or slow indexer is skipped. */
export async function searchAll(query: string): Promise<Release[]> {
  const indexers = enabledIndexers();
  const key = `search:${indexers.map((i) => i.name).join('|')}:${query.toLowerCase().trim()}`;
  const found = await cached(key, 30 * 60, async () => {
    const results = await Promise.allSettled(
      indexers.map((i) => withTimeout(i.search(query), INDEXER_TIMEOUT, i.name)),
    );
    results.forEach((res, i) => {
      if (res.status === 'rejected') host.log(`${indexers[i]?.name} failed: ${res.reason}`);
    });
    const all = results.flatMap((res) => (res.status === 'fulfilled' ? res.value : []));
    return rank(mergeDuplicates(all), query);
  });
  const minSeeders = Number(setting('minSeeders', 0)) || 0;
  // AudioBook Bay does not show seeders, so its results are never filtered out by them.
  return remember(found.filter((r) => r.seeders === undefined || r.seeders >= minSeeders));
}
