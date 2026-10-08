import { configuredServices } from './debrid/index.ts';
import { host } from './host.ts';
import { parseId } from './ids.ts';
import { postDetails } from './indexers/audiobookbay.ts';
import { torrentFiles } from './indexers/piratebay.ts';
import { recall } from './search.ts';
import type { Release, TorrentFile } from './types.ts';

export type LoadedRelease = Release & { infoHash: string };

const definedOnly = <T extends object>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;

/** File list from the indexer, else from a debrid service that has the torrent cached. */
async function findFiles(release: LoadedRelease): Promise<TorrentFile[] | undefined> {
  if (release.tpbId) {
    const files = await torrentFiles(release.tpbId).catch(() => []);
    if (files.length > 0) return files;
  }
  for (const { service, key } of configuredServices()) {
    const files = await service.cachedFiles?.(key, release.infoHash).catch(() => undefined);
    if (files?.length) return files;
  }
  return undefined;
}

/**
 * Everything known about a book: what the search saw, plus the AudioBook Bay post and the
 * file list, which are only fetched when someone opens it. Cached for a day.
 */
export async function loadRelease(bookId: string): Promise<LoadedRelease> {
  const loaded = await host.cache.get<LoadedRelease>(`loaded:${bookId}`);
  if (loaded) return loaded;

  const id = parseId(bookId);
  if (!id) throw new Error(`Unknown book ${bookId}`);
  let release: Release = (await recall(bookId)) ?? {
    id: bookId,
    title: id.kind === 'abb' ? id.slug.replace(/-/g, ' ') : 'Audiobook',
    source: id.kind === 'abb' ? 'AudioBook Bay' : id.kind === 'tpb' ? 'The Pirate Bay' : '',
  };
  if (id.kind === 'tpb') {
    release.tpbId = id.tpbId;
    release.infoHash = id.hash;
  } else if (id.kind === 'h') {
    release.infoHash = id.hash;
  } else if (!release.infoHash) {
    const post = await postDetails(id.slug);
    // What the listing showed wins; the post fills in the rest (hash, files, credits).
    release = { ...definedOnly(post), ...definedOnly(release) } as Release;
  }
  if (!release.infoHash) throw new Error('This post has no torrent.');
  const result = release as LoadedRelease;
  result.files ??= await findFiles(result);
  await host.cache.set(`loaded:${bookId}`, result, 24 * 3600);
  return result;
}
