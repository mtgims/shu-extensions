import * as audible from './audible.ts';
import { cached, host, setting } from './host.ts';
import * as openlibrary from './openlibrary.ts';
import type { Summary, Work } from './types.ts';

/** Remembers what lists showed, so a book page can start everything at once. */
async function remember<T extends { books: Summary[] }>(page: T): Promise<T> {
  await Promise.all(page.books.map((b) => host.cache.set(`sum:${b.id}`, b, 24 * 3600)));
  return page;
}

/** Genre label → Open Library subject. The first ones are on Home by default. */
const GENRES: Record<string, string> = {
  Fantasy: 'fantasy',
  Thrillers: 'thriller',
  Romance: 'romance',
  'Science fiction': 'science fiction',
  'Self-help': 'self-help',
  Mystery: 'mystery',
  Horror: 'horror',
  Biographies: 'biography',
  History: 'history',
  'Young adult': 'young adult fiction',
  Classics: 'classic literature',
  Business: 'business',
  Children: 'juvenile fiction',
};
const DEFAULT_HOME_GENRES = Object.keys(GENRES).slice(0, 6);

const rowId = (label: string) => `genre:${GENRES[label]}`;

const extension = {
  manifest: {
    id: 'community.audiobook-catalog',
    name: 'Audiobook Catalog',
    version: '1.0.0',
    description:
      'Trending and most read books, new audiobook releases and genres, with narrators, length and ratings. Playing needs a source extension.',
    catalogs: [
      { id: 'search', name: 'Audiobooks', search: true },
      { id: 'trending', name: 'Trending now' },
      { id: 'new', name: 'New releases' },
      { id: 'genres', name: 'Browse by genre', genres: Object.keys(GENRES) },
      ...Object.keys(GENRES).map((label) => ({ id: rowId(label), name: label })),
    ],
    settings: [
      {
        key: 'homeGenres',
        label: 'Genres on Home',
        type: 'multiselect',
        default: DEFAULT_HOME_GENRES,
        options: Object.keys(GENRES).map((g) => ({ value: g, label: g })),
      },
      {
        key: 'language',
        label: 'Book language',
        type: 'select',
        default: 'eng',
        help: 'For trending and genre lists.',
        options: [
          { value: 'eng', label: 'English' },
          { value: 'spa', label: 'Spanish' },
          { value: 'fre', label: 'French' },
          { value: 'ger', label: 'German' },
          { value: 'ita', label: 'Italian' },
          { value: 'por', label: 'Portuguese' },
          { value: 'any', label: 'Any' },
        ],
      },
      {
        key: 'region',
        label: 'Audible store',
        type: 'select',
        default: 'us',
        help: 'Where narrators, lengths, ratings and new releases come from.',
        options: [
          { value: 'us', label: 'United States' },
          { value: 'uk', label: 'United Kingdom' },
          { value: 'ca', label: 'Canada' },
          { value: 'au', label: 'Australia' },
          { value: 'de', label: 'Germany' },
          { value: 'fr', label: 'France' },
          { value: 'es', label: 'Spain' },
          { value: 'it', label: 'Italy' },
          { value: 'in', label: 'India' },
          { value: 'jp', label: 'Japan' },
        ],
      },
    ],
  },

  async catalog(
    id: string,
    options: { search?: string | null; skip?: number; genre?: string | null },
  ) {
    const skip = options.skip ?? 0;
    const key = `${id}:${options.genre ?? ''}:${options.search ?? ''}:${skip}:${setting('language', '')}:${setting('region', '')}`;
    if (id === 'search') {
      const text = options.search?.trim();
      return text
        ? cached(key, 1800, () => audible.search(text, skip))
        : { books: [], hasMore: false };
    }
    if (id === 'trending')
      return remember(await cached(key, 3600, () => openlibrary.trending(skip)));
    if (id === 'new') return cached(key, 3600, () => audible.newReleases(skip));
    if (id === 'genres') {
      const subject = GENRES[options.genre ?? ''];
      return subject
        ? remember(await cached(key, 6 * 3600, () => openlibrary.mostRead(subject, skip)))
        : { books: [], hasMore: false };
    }
    if (id.startsWith('genre:')) {
      const label = Object.keys(GENRES).find((g) => rowId(g) === id);
      const onHome = setting<string[]>('homeGenres', DEFAULT_HOME_GENRES);
      if (!label || !onHome.includes(label)) return { books: [], hasMore: false };
      return remember(
        await cached(key, 6 * 3600, () => openlibrary.mostRead(GENRES[label] as string, skip)),
      );
    }
    return { books: [], hasMore: false };
  },

  async book(id: string): Promise<Work> {
    const key = `book:${id}:${setting('region', '')}`;
    if (id.startsWith('audible:'))
      return cached(key, 24 * 3600, () => audible.product(id.slice(8)));
    if (!id.startsWith('ol:')) throw new Error(`Unknown book ${id}`);
    return cached(key, 24 * 3600, async () => {
      // The audiobook edition adds what a listener cares about: narrator, length, rating. When
      // the list already gave title and author, both lookups run at the same time.
      const seen = await host.cache.get<Summary>(`sum:${id}`);
      const findEdition = (title: string, author?: string) =>
        audible.findAudiobook(title, author).catch(() => undefined);
      const [book, early] = await Promise.all([
        openlibrary.work(id.slice(3), seen?.authors?.[0]),
        seen ? findEdition(seen.title, seen.authors?.[0]) : Promise.resolve(undefined),
      ]);
      const edition = early ?? (seen ? undefined : await findEdition(book.title, book.author));
      return {
        id,
        title: book.title,
        authors: book.author ? [book.author] : edition?.authors,
        narrators: edition?.narrators,
        cover: edition?.cover ?? book.cover,
        details: edition?.details,
        description: edition?.description ?? book.description,
        year: book.year ?? edition?.year,
        durationMinutes: edition?.durationMinutes,
        rating: edition?.rating,
        genres: edition?.genres?.length ? edition.genres : book.genres,
        series: edition?.series,
        chapters: [],
      };
    });
  },

  /** Catalog books have no files of their own; source extensions provide the versions. */
  async sources() {
    return { sources: [], message: 'Install a source extension to play this book.' };
  },
};

(globalThis as unknown as { extension: typeof extension }).extension = extension;
