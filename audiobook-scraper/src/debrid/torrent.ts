import { describeTarget, pickFile } from '../files.ts';
import { host, setting, type TorrentOptions } from '../host.ts';
import { magnetLink } from '../magnet.ts';
import { type DebridService, FileNotFoundError } from './types.ts';

/** The settings, in the units the app wants (bytes, bytes a second, days). */
export function torrentOptions(): TorrentOptions {
  const number = (key: string, fallback: string) => {
    const value = Number(setting(key, fallback));
    return Number.isFinite(value) ? value : 0;
  };
  const keep = String(setting('keepDays', '30'));
  return {
    folder: String(setting('downloadFolder', '')).trim() || undefined,
    deleteWhenFinished: setting<unknown>('deleteWhenFinished', true) !== false,
    keepDays: keep === 'forever' ? null : Number(keep) || 30,
    storageLimit: number('storageLimit', '5') * 2 ** 30,
    downloadLimit: number('downloadLimit', '0') * 1024,
    uploadLimit: number('uploadLimit', '0') * 1024,
    shareAfter: setting<unknown>('shareAfterDownload', false) === true,
  };
}

function engine() {
  if (!host.torrent) throw new Error('Update Shu to 0.6.0 or later to play these.');
  return host.torrent;
}

async function files(magnet: string) {
  const list = await engine().files(magnet, torrentOptions());
  return list.map((f) => ({ ...f, name: f.path }));
}

/** Plays torrents in the app itself, downloading from the people sharing them. */
export const torrent: DebridService = {
  id: 'torrent',
  name: 'Torrent',
  needsKey: false,
  // Its links are on this device and change when the app restarts its engine.
  cacheLinks: false,

  async cachedFiles(_key, hash) {
    return (await files(magnetLink(hash))).map((f) => ({
      idx: f.index,
      name: f.path,
      size: f.size,
    }));
  },

  async resolve(_key, magnet, _hash, target) {
    const file = pickFile(await files(magnet), target);
    if (!file)
      throw new FileNotFoundError(`The torrent has no file matching ${describeTarget(target)}`);
    return engine().stream(magnet, file.index, torrentOptions());
  },
};
