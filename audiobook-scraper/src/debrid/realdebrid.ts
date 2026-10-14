import { describeTarget, isAudio, pickFile } from '../files.ts';
import { getText, HttpError, host, poll } from '../host.ts';
import { magnetLink } from '../magnet.ts';
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
/** Real-Debrid gave up on the torrent; waiting won't help. */
const FAILED = ['magnet_error', 'error', 'virus', 'dead'];

/**
 * The torrent in the user's account, added if it isn't there yet, once its file list is known
 * (or `attempts` seconds have passed).
 */
async function inAccount(
  apiKey: string,
  hash: string,
  magnet: string,
  attempts: number,
): Promise<RdInfo> {
  // Listing the account is slow; after the first look the id is remembered.
  const idKey = `realdebrid-id:${hash}`;
  const find = async () =>
    (await rd<RdTorrent[]>(apiKey, '/torrents?limit=100')).find(
      (t) => t.hash.toLowerCase() === hash,
    )?.id ?? (await rd<{ id: string }>(apiKey, '/torrents/addMagnet', { magnet })).id;
  const known = await host.cache.get<string>(idKey);
  let id = known ?? (await find());
  const info = () => rd<RdInfo>(apiKey, `/torrents/info/${id}`);
  const converted = (t: RdInfo) => t.status !== 'magnet_conversion';
  const torrent = await poll(info, converted, attempts).catch(async (err: unknown) => {
    // Removed on the site since it was remembered: add it again.
    if (!known || !(err instanceof HttpError) || err.status !== 404) throw err;
    id = await find();
    return poll(info, converted, attempts);
  });
  await host.cache.set(idKey, id, 24 * 3600);
  return torrent;
}

/**
 * Real-Debrid has no cache check anymore. Adding a cached torrent finishes within a second or
 * two, so the add itself tells us whether it is cached.
 */
export const realdebrid: DebridService = {
  id: 'realdebrid',
  name: 'Real-Debrid',

  // Indexers like Knaben list no files; without them a book would be one file of many.
  async cachedFiles(apiKey, hash) {
    const torrent = await inAccount(apiKey, hash, magnetLink(hash), 3);
    return torrent.files?.length
      ? torrent.files.map((f) => ({ idx: f.id, name: f.path, size: f.bytes }))
      : undefined;
  },

  async resolve(apiKey, magnet, hash, target) {
    let torrent = await inAccount(apiKey, hash, magnet, 10);
    const info = () => rd<RdInfo>(apiKey, `/torrents/info/${torrent.id}`);
    if (torrent.status === 'waiting_files_selection') {
      const audio = torrent.files.filter((f) => isAudio(f.path));
      const files = audio.length > 0 ? audio.map((f) => f.id).join(',') : 'all';
      await rd(apiKey, `/torrents/selectFiles/${torrent.id}`, { files });
      torrent = await poll(info, (t) => !BUSY.includes(t.status), 4);
    }
    if (FAILED.includes(torrent.status)) {
      throw new Error(`Real-Debrid can't download this torrent (${torrent.status}).`);
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
