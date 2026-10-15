import { toBook, toSummary } from './books.ts';
import { NotReadyError } from './debrid/types.ts';
import { chapters, type FileTarget } from './files.ts';
import { formatSize } from './format.ts';
import { cached, HttpError, host } from './host.ts';
import { magnetLink } from './magnet.ts';
import { loadRelease } from './release.ts';
import { findReleases, type WorkQuery } from './releases.ts';
import { searchAll } from './search.ts';
import { configuredServices, serviceById } from './services.ts';
import { VERSION } from './version.ts';

/** What a source hands back to resolve(): everything needed to fetch one chapter. */
interface ResolveData {
  service: string;
  hash: string;
  title?: string;
  trackers?: string[];
  target: FileTarget;
}

export interface Setting {
  key: string;
  label: string;
  type: string;
  help?: string;
  default?: unknown;
  options?: { value: string; label: string }[];
}

/** Where to search, shared by every extension built from this code. */
const searchSettings: Setting[] = [
  {
    key: 'sources',
    label: 'Search on',
    type: 'multiselect',
    default: ['audiobookbay', 'piratebay', 'knaben'],
    options: [
      { value: 'audiobookbay', label: 'AudioBook Bay' },
      { value: 'piratebay', label: 'The Pirate Bay' },
      { value: 'knaben', label: 'Knaben (RuTracker)' },
    ],
  },
  {
    key: 'language',
    label: 'Audiobook language',
    type: 'select',
    default: 'en',
    help: 'Versions that say they are in another language are marked as poor matches.',
    options: [
      { value: 'en', label: 'English' },
      { value: 'es', label: 'Spanish' },
      { value: 'fr', label: 'French' },
      { value: 'de', label: 'German' },
      { value: 'it', label: 'Italian' },
      { value: 'pt', label: 'Portuguese' },
      { value: 'ru', label: 'Russian' },
      { value: 'any', label: 'Any' },
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
];

export interface ExtensionOptions {
  id: string;
  name: string;
  description: string;
  /** Where copies installed from elsewhere (a computer on the same network) get updates. */
  updateUrl: string;
  /** A warning the user accepts before installing. */
  notice?: string;
  /** Settings of the services it plays through, shown before the search settings. */
  settings: Setting[];
  /** Shown instead of sources when no service is ready. */
  noServiceMessage: string;
}

/** An extension that finds audiobook torrents and plays them through the active services. */
export function makeExtension(options: ExtensionOptions) {
  return {
    manifest: {
      id: options.id,
      name: options.name,
      version: VERSION,
      updateUrl: options.updateUrl,
      description: options.description,
      notice: options.notice,
      // A source: no Home rows of its own, it finds versions of books from catalog extensions.
      releases: true,
      catalogs: [{ id: 'search', name: 'Torrents', search: true }],
      settings: [...options.settings, ...searchSettings],
    },

    async catalog(catalogId: string, query: { search?: string | null; skip?: number }) {
      const skip = query.skip ?? 0;
      if (catalogId === 'search') {
        const text = query.search?.trim();
        const found = text && skip === 0 ? await searchAll(text) : [];
        return { books: found.map(toSummary), hasMore: false };
      }
      return { books: [], hasMore: false };
    },

    /** Versions of a book from a catalog extension, best match first, with why they match. */
    async releases(work: WorkQuery) {
      const books = (await findReleases(work)).map(({ release, notes, match }) => {
        const summary = toSummary(release);
        return { ...summary, tags: [...notes, ...summary.tags], match };
      });
      return { books, hasMore: false };
    },

    async book(bookId: string) {
      return toBook(await loadRelease(bookId));
    },

    async sources(bookId: string, chapterId: string) {
      const services = configuredServices();
      if (services.length === 0) {
        return { sources: [], message: options.noServiceMessage };
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
      const service = serviceById(data.service);
      const key = configuredServices().find((s) => s.service.id === data.service)?.key;
      if (!service || key === undefined)
        throw new Error(`Add your ${service?.name ?? data.service} API key in the settings.`);
      const keep = service.cacheLinks !== false;
      const linkKey = `link:${data.service}:${data.hash}:${JSON.stringify(data.target)}`;
      const known = keep ? await host.cache.get<string>(linkKey) : null;
      if (known) return { url: known };
      try {
        const url = await service.resolve(
          key,
          magnetLink(data.hash, data.title, data.trackers),
          data.hash,
          data.target,
        );
        // Direct links stay valid for hours; reusing them spares the service and the wait.
        if (keep) await host.cache.set(linkKey, url, 3600);
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
}
