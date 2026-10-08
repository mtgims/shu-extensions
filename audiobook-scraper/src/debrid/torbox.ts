import { describeTarget, pickFile } from '../files.ts';
import { type FetchOptions, getJson, host, poll } from '../host.ts';
import { type DebridService, FileNotFoundError, NotReadyError } from './types.ts';

const API = 'https://api.torbox.app/v1/api';

async function tb<T>(apiKey: string, path: string, options: FetchOptions = {}): Promise<T> {
  const res = await getJson<{ success: boolean; data: T; detail?: string }>(`${API}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!res.success) throw new Error(`TorBox: ${res.detail ?? 'error'}`);
  return res.data;
}

interface CachedEntry {
  hash: string;
  files?: { name: string; size: number }[];
}

interface TbTorrent {
  id: number;
  hash: string;
  download_present: boolean;
  download_state: string;
  progress: number;
  files?: { id: number; name: string; size: number }[];
}

export const torbox: DebridService = {
  id: 'torbox',
  name: 'TorBox',

  async cached(apiKey, hashes) {
    const data = await tb<CachedEntry[] | null>(apiKey, '/torrents/checkcached', {
      query: { format: 'list', hash: hashes.join(',') },
    });
    return new Set((data ?? []).map((e) => e.hash.toLowerCase()));
  },

  async cachedFiles(apiKey, hash) {
    const data = await tb<CachedEntry[] | null>(apiKey, '/torrents/checkcached', {
      query: { format: 'list', list_files: 'true', hash },
    });
    return data?.[0]?.files?.map((f, idx) => ({ idx, name: f.name, size: f.size }));
  },

  async resolve(apiKey, magnet, hash, target) {
    // Listing the account is slow (seconds); after the first chapter the id is remembered.
    const idKey = `torbox-id:${hash}`;
    let id = (await host.cache.get<number>(idKey)) ?? undefined;
    if (id === undefined) {
      const mine = await tb<TbTorrent[]>(apiKey, '/torrents/mylist', {
        query: { bypass_cache: 'true' },
      });
      id = mine.find((t) => t.hash.toLowerCase() === hash)?.id;
    }
    if (id === undefined) {
      const created = await tb<{ torrent_id: number }>(apiKey, '/torrents/createtorrent', {
        multipart: { magnet },
      });
      id = created.torrent_id;
    }

    const torrent = await poll(
      () =>
        tb<TbTorrent>(apiKey, '/torrents/mylist', {
          query: { bypass_cache: 'true', id: String(id) },
        }),
      (t) => t.download_present,
      3,
    );
    if (!torrent.download_present) {
      const pct = Math.round((torrent.progress ?? 0) * 100);
      throw new NotReadyError(`TorBox: ${torrent.download_state} ${pct}%`, pct / 100);
    }

    await host.cache.set(idKey, id, 24 * 3600);
    const file = pickFile(torrent.files ?? [], target);
    if (!file) throw new FileNotFoundError(`TorBox has no file matching ${describeTarget(target)}`);
    return tb<string>(apiKey, '/torrents/requestdl', {
      query: { token: apiKey, torrent_id: String(id), file_id: String(file.id) },
    });
  },
};
