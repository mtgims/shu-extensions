import { toSummary } from './books.ts';
import { listPosts, loadPost, NAME, PAGE, postOf } from './golden/site.ts';
import { mainTitle, rankReleases, type WorkQuery } from './releases.ts';
import { VERSION } from './version.ts';

/** Audiobooks streamed as plain MP3 files from Golden Audiobooks: no torrents, no account. */

async function bookOf(bookId: string) {
  const post = postOf(bookId);
  if (!post) throw new Error(`Unknown book: ${bookId}`);
  return loadPost(post);
}

const extension = {
  manifest: {
    id: 'community.golden-audiobooks',
    name: NAME,
    version: VERSION,
    updateUrl:
      'https://raw.githubusercontent.com/mtgims/shu-extensions/main/audiobook-scraper/dist/golden-audiobooks.js',
    description:
      'Plays audiobooks from Golden Audiobooks, which streams them as MP3 files: no torrents and no account. Mostly popular English books.',
    releases: true,
    catalogs: [
      { id: 'search', name: NAME, search: true },
      { id: 'latest', name: `New on ${NAME}` },
    ],
  },

  async catalog(catalogId: string, query: { search?: string | null; skip?: number }) {
    const search = query.search?.trim();
    if (catalogId === 'search' && !search) return { books: [], hasMore: false };
    const page = Math.floor((query.skip ?? 0) / PAGE) + 1;
    const { releases, hasMore } = await listPosts(page, search || undefined);
    return { books: releases.map(toSummary), hasMore };
  },

  async releases(work: WorkQuery) {
    // WordPress matches "Half-Blood" only as one word; the site writes "Half Blood".
    const { releases } = await listPosts(1, mainTitle(work.title).replace(/-/g, ' '));
    const byId = new Map(releases.map((r) => [r.id, r]));
    // Ranked on "Author – Title" as torrent names read, so another author's book stands out.
    // Some posts name no author: assumed to be the catalog's, never better than fair.
    const named = releases.map((r) => ({
      ...r,
      title: `${r.author ?? work.authors?.[0] ?? ''} – ${r.title}`,
      author: undefined,
    }));
    const books = rankReleases(named, work).map(({ release, notes, match }) => {
      const original = byId.get(release.id) ?? release;
      const guessed = !original.author;
      return {
        ...toSummary(original),
        tags: guessed ? ['Author not named', ...notes] : notes,
        match: guessed && match === 'good' ? 'fair' : match,
      };
    });
    return { books, hasMore: false };
  },

  async book(bookId: string) {
    const book = await bookOf(bookId);
    if (book.files.length === 0) throw new Error('This book has no audio on Golden Audiobooks.');
    return {
      id: bookId,
      title: book.title,
      authors: book.author ? [book.author] : undefined,
      narrators: book.narrator ? [book.narrator] : undefined,
      cover: book.cover,
      details: NAME,
      chapters: book.files.map((_, i) => ({ id: String(i), title: `Part ${i + 1}` })),
    };
  },

  async sources(bookId: string, chapterId: string) {
    const url = (await bookOf(bookId)).files[Number(chapterId)];
    if (!url) return { sources: [], message: 'This part is missing on Golden Audiobooks.' };
    return { sources: [{ id: 'mp3', name: NAME, url }] };
  },
};

(globalThis as unknown as { extension: typeof extension }).extension = extension;
