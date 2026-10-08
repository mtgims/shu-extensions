import { describeTarget, isAudio, pickFile } from '../files.ts';
import { getText, host, poll } from '../host.ts';
import { type DebridService, FileNotFoundError, NotReadyError } from './types.ts';

const API = 'https://api.real-debrid.com/rest/1.0';

interface RdTorrent {
  id: string;
  hash: string;
  status: string;
}

interface RdInfo extends RdTorrent {
  progress: number;
  files: { id: number; path: string; bytes: number; selected: 0 | 1 }[];
  links: string[];
}

async function rd<T>(apiKey: string, path: string, form?: Record<string, string>): Promise<T> {
  const text = await getText(`${API}${path}`, {
    method: form ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${apiKey}` },
    form,
  });
  return (text ? JSON.parse(text) : undefined) as T;
}

const BUSY = ['magnet_conversion', 'queued'];

/**
 * Real-Debrid has no cache check anymore. Adding a cached torrent finishes within a second or
 * two, so the add itself tells us whether it is cached.
 */
export const realdebrid: DebridService = {
  id: 'realdebrid',
  name: 'Real-Debrid',

  async resolve(apiKey, magnet, hash, target) {
    // Listing the account is slow; after the first chapter the id is remembered.
    const idKey = `realdebrid-id:${hash}`;
    const id =
      (await host.cache.get<string>(idKey)) ??
      (await rd<RdTorrent[]>(apiKey, '/torrents?limit=100')).find(
        (t) => t.hash.toLowerCase() === hash,
      )?.id ??
      (await rd<{ id: string }>(apiKey, '/torrents/addMagnet', { magnet })).id;
    await host.cache.set(idKey, id, 24 * 3600);

    const info = () => rd<RdInfo>(apiKey, `/torrents/info/${id}`);
    let torrent = await poll(info, (t) => t.status !== 'magnet_conversion', 10);
    if (torrent.status === 'waiting_files_selection') {
      const audio = torrent.files.filter((f) => isAudio(f.path));
      const files = audio.length > 0 ? audio.map((f) => f.id).join(',') : 'all';
      await rd(apiKey, `/torrents/selectFiles/${id}`, { files });
      torrent = await poll(info, (t) => !BUSY.includes(t.status), 4);
    }
    if (torrent.status !== 'downloaded') {
      throw new NotReadyError(
        `Real-Debrid: ${torrent.status} ${torrent.progress ?? 0}%`,
        (torrent.progress ?? 0) / 100,
      );
    }

    // `links` lines up with the selected files, in order.
    const selected = torrent.files.filter((f) => f.selected === 1);
    const file = pickFile(
      selected.map((f) => ({ ...f, name: f.path, size: f.bytes })),
      target,
    );
    const link = file && torrent.links[selected.findIndex((f) => f.id === file.id)];
    if (!link) {
      throw new FileNotFoundError(`Real-Debrid has no file matching ${describeTarget(target)}`);
    }
    return (await rd<{ download: string }>(apiKey, '/unrestrict/link', { link })).download;
  },
};
