import { describeTarget, pickFile } from '../files.ts';
import { getJson } from '../host.ts';
import { magnetLink } from '../magnet.ts';
import { type DebridService, FileNotFoundError, NotReadyError } from './types.ts';

const API = 'https://www.premiumize.me/api';

async function pm<T>(apiKey: string, path: string, form?: Record<string, string>): Promise<T> {
  // The key is appended by hand: a `query` option would collapse repeated items[] parameters.
  const url = `${API}${path}${path.includes('?') ? '&' : '?'}apikey=${encodeURIComponent(apiKey)}`;
  const res = await getJson<T & { status: string; message?: string }>(url, {
    method: form ? 'POST' : 'GET',
    form,
  });
  if (res.status !== 'success') throw new Error(`Premiumize: ${res.message ?? 'error'}`);
  return res;
}

interface DirectDl {
  content?: { path: string; size: number; link: string }[];
}

/** Lists a torrent's files, but only when it is already cached. */
const directDl = async (apiKey: string, magnet: string) =>
  (await pm<DirectDl>(apiKey, '/transfer/directdl', { src: magnet })).content ?? [];

export const premiumize: DebridService = {
  id: 'premiumize',
  name: 'Premiumize',

  async cached(apiKey, hashes) {
    // items[] repeats, so it goes in the URL by hand.
    const items = hashes.map((h) => `items[]=${h}`).join('&');
    const res = await pm<{ response: boolean[] }>(apiKey, `/cache/check?${items}`);
    return new Set(hashes.filter((_, i) => res.response[i]));
  },

  async cachedFiles(apiKey, hash) {
    const content = await directDl(apiKey, magnetLink(hash));
    return content.length > 0
      ? content.map((f, idx) => ({ idx, name: f.path, size: f.size }))
      : undefined;
  },

  async resolve(apiKey, magnet, _hash, target) {
    const content = await directDl(apiKey, magnet).catch(() => []);
    if (content.length === 0) {
      // Not cached (directdl only serves cached content): start a transfer, or keep waiting on
      // the one already running.
      await pm(apiKey, '/transfer/create', { src: magnet }).catch((err: Error) => {
        if (!/already/i.test(err.message)) throw err;
      });
      throw new NotReadyError('Premiumize: downloading');
    }
    const file = pickFile(
      content.map((f) => ({ ...f, name: f.path })),
      target,
    );
    if (!file) {
      throw new FileNotFoundError(`Premiumize has no file matching ${describeTarget(target)}`);
    }
    return file.link;
  },
};
