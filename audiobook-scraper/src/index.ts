import { toBook, toSummary } from './books.ts';
import { configuredServices, DEBRID } from './debrid/index.ts';
import { NotReadyError } from './debrid/types.ts';
import { chapters, type FileTarget } from './files.ts';
import { formatSize } from './format.ts';
import { cached, HttpError, host, setting } from './host.ts';
import { magnetLink } from './magnet.ts';
import { loadRelease } from './release.ts';
import { findReleases, type WorkQuery } from './releases.ts';
import { searchAll } from './search.ts';

/** What a source hands back to resolve(): everything needed to fetch one chapter. */
interface ResolveData {
  service: string;
  hash: string;
  title?: string;
  trackers?: string[];
  target: FileTarget;
}

const debridHelp = 'Leave empty if you don’t use it.';

const extension = {
  manifest: {
    id: 'community.audiobook-scraper',
    name: 'Audiobook Scraper',
    version: '1.1.0',
    description:
      'Finds audiobook torrents on AudioBook Bay, The Pirate Bay and the trackers Knaben indexes, and plays them through Real-Debrid, AllDebrid, TorBox or Premiumize.',
    // A source: no Home rows of its own, it finds versions of books from catalog extensions.
    releases: true,
    catalogs: [{ id: 'search', name: 'Torrents', search: true }],
    settings: [
      { key: 'torbox', label: 'TorBox API key', type: 'password', help: debridHelp },
      { key: 'realdebrid', label: 'Real-Debrid API key', type: 'password', help: debridHelp },
      { key: 'alldebrid', label: 'AllDebrid API key', type: 'password', help: debridHelp },
      { key: 'premiumize', label: 'Premiumize API key', type: 'password', help: debridHelp },
      {
        key: 'sources',
        label: 'Search on',
        type: 'multiselect',
        default: ['audiobookbay', 'piratebay', 'knaben'],
        options: [
          { value: 'audiobookbay', label: 'AudioBook Bay' },
          { value: 'piratebay', label: 'The Pirate Bay' },
          { value: 'knaben', label: 'Knaben (1337x, RuTracker, …)' },
        ],
      },
      { key: 'minSeeders', label: 'Minimum seeders', type: 'number', default: 0 },
      {
        key: 'abbDomain',
        label: 'AudioBook Bay address',
        type: 'text',
        default: 'audiobookbay.lu',
        help: 'Change it when the site moves.',
      },
      {
        key: 'torznabUrl',
        label: 'Jackett / Prowlarr Torznab URL',
        type: 'text',
        help: 'Optional. Adds any tracker they support, private ones included.',
      },
      { key: 'torznabKey', label: 'Jackett / Prowlarr API key', type: 'password' },
    ],
  },

  async catalog(catalogId: string, options: { search?: string | null; skip?: number }) {
    const skip = options.skip ?? 0;
    if (catalogId === 'search') {
      const text = options.search?.trim();
      const found = text && skip === 0 ? await searchAll(text) : [];
      return { books: found.map(toSummary), hasMore: false };
    }
    return { books: [], hasMore: false };
  },

  /** Versions of a book from a catalog extension, best match first. */
  async releases(work: WorkQuery) {
    return { books: (await findReleases(work)).map(toSummary), hasMore: false };
  },

  async book(bookId: string) {
    return toBook(await loadRelease(bookId));
  },

  async sources(bookId: string, chapterId: string) {
    const services = configuredServices();
    if (services.length === 0) {
      return {
        sources: [],
        message: 'Add a debrid API key in this extension’s settings to play audiobooks.',
      };
    }
    const release = await loadRelease(bookId);
    const hash = release.infoHash;
    const file = release.files?.find((f) => String(f.idx) === chapterId);
    const audio = chapters(release.files ?? []);
    const position = file ? audio.indexOf(file) : -1;
    const target: FileTarget = {
      name: file?.name,
      size: file?.size,
      position: position >= 0 ? position : undefined,
      count: position >= 0 ? audio.length : undefined,
    };

    // Cache state changes rarely; checking once per book (not per chapter) saves requests.
    const flags = await Promise.all(
      services.map(({ service, key }) =>
        service.cached
          ? cached(
              `cached:${service.id}:${hash}`,
              600,
              async () => (await service.cached?.(key, [hash]))?.has(hash) ?? null,
            ).catch(() => null)
          : Promise.resolve(null),
      ),
    );
    const size = formatSize(file?.size ?? release.size);
    return {
      sources: services.map(({ service }, i) => {
        const isCached = flags[i];
        const state =
          isCached === true ? 'Cached' : isCached === false ? 'Not cached yet' : undefined;
        const data: ResolveData = {
          service: service.id,
          hash,
          title: release.title,
          trackers: release.trackers,
          target,
        };
        return {
          id: service.id,
          name: service.name,
          description: [state, size].filter(Boolean).join(' · '),
          cached: isCached ?? undefined,
          resolve: data,
        };
      }),
    };
  },

  async resolve(data: ResolveData) {
    const service = DEBRID[data.service];
    const key = String(setting(data.service, '')).trim();
    if (!service || !key)
      throw new Error(`Add your ${service?.name ?? data.service} API key in the settings.`);
    const linkKey = `link:${data.service}:${data.hash}:${JSON.stringify(data.target)}`;
    const known = await host.cache.get<string>(linkKey);
    if (known) return { url: known };
    try {
      const url = await service.resolve(
        key,
        magnetLink(data.hash, data.title, data.trackers),
        data.hash,
        data.target,
      );
      // Direct links stay valid for hours; reusing them spares the service and the wait.
      await host.cache.set(linkKey, url, 3600);
      return { url };
    } catch (err) {
      if (err instanceof NotReadyError) {
        return { status: 'downloading', message: err.message, progress: err.progress };
      }
      if (err instanceof HttpError) {
        throw new Error(
          err.status === 401 || err.status === 403
            ? `${service.name} rejected the API key (HTTP ${err.status}). Check it in the settings.`
            : `${service.name} failed (HTTP ${err.status}). Try again later.`,
        );
      }
      throw err;
    }
  },
};

(globalThis as unknown as { extension: typeof extension }).extension = extension;
