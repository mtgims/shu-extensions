import { decodeEntities } from '../format.ts';
import { cached, type FetchOptions, HttpError, host } from '../host.ts';
import type { Release } from '../types.ts';

/** Golden Audiobooks: a WordPress site whose posts play MP3 files in the browser. */
const API = 'https://goldenaudiobooks.com/wp-json/wp/v2';
export const NAME = 'Golden Audiobooks';
export const PAGE = 20;

export const goldId = (post: number | string) => `gold:${post}`;
export const postOf = (id: string) => id.match(/^gold:(\d+)$/)?.[1];

/** "Andy Weir – Project Hail Mary Audiobook" → title and author; "… Audiobook (Stephen Fry)" names the narrator. */
export function splitTitle(raw: string): { title: string; author?: string; narrator?: string } {
  const full = decodeEntities(raw);
  const narrator = full.match(/\b(?:audio ?books?|audibook)\s*\(([^)]+)\)/i)?.[1];
  const name = full.replace(/\s+(audio ?books?|audibook)\b.*$/i, '').trim();
  const at = name.indexOf(' – ');
  const parts = at > 0 ? { author: name.slice(0, at), title: name.slice(at + 3) } : { title: name };
  return narrator ? { ...parts, narrator } : parts;
}

interface Post {
  id: number;
  title: { rendered: string };
  featured_media: number;
}

async function getPage<T>(path: string, query: FetchOptions['query']) {
  const url = `${API}/${path}`;
  const res = await host.fetch(url, { query });
  if (!res.ok) throw new HttpError(res.status, url, res.text);
  // Header names may come in any case.
  const pages = Object.entries(res.headers).find(([k]) => k.toLowerCase() === 'x-wp-totalpages');
  return { items: JSON.parse(res.text) as T[], pages: Number(pages?.[1] ?? 1) };
}

/** Posts newest first, or those whose title has the search words; page starts at 1. */
export function listPosts(page: number, search?: string) {
  const query = search ? { search, search_columns: 'post_title' } : {};
  return cached(`gold:list:${search ?? ''}:${page}`, 3600, async () => {
    const { items, pages } = await getPage<Post>('posts', {
      ...query,
      page,
      per_page: PAGE,
      _fields: 'id,title,featured_media',
    });
    // Covers in one small request; embedding them makes the answer a hundred times larger.
    const ids = items.map((p) => p.featured_media).filter((id) => id > 0);
    const media = ids.length
      ? (
          await getPage<{ id: number; source_url: string }>('media', {
            include: ids.join(','),
            per_page: PAGE,
            _fields: 'id,source_url',
          })
        ).items
      : [];
    const releases: Release[] = items.map((p) => ({
      id: goldId(p.id),
      ...splitTitle(p.title.rendered),
      source: NAME,
      poster: media.find((m) => m.id === p.featured_media)?.source_url,
    }));
    return { releases, hasMore: page < pages };
  });
}

export interface GoldenBook {
  title: string;
  author?: string;
  narrator?: string;
  cover?: string;
  files: string[];
}

/** The post's player list, in order. */
export async function parsePost(title: string, content: string): Promise<GoldenBook> {
  const [page] = await host.select(content, 'body', {
    cover: 'img@src',
    files: ['audio source@src'],
  });
  return {
    ...splitTitle(title),
    cover: page?.cover ?? undefined,
    // WordPress adds "?_=1" to tell its players apart.
    files: (page?.files ?? []).map((f) => f.replace(/\?_=\d+$/, '')),
  };
}

export function loadPost(post: string): Promise<GoldenBook> {
  return cached(`gold:post:${post}`, 24 * 3600, async () => {
    const { items } = await getPage<{ title: { rendered: string }; content: { rendered: string } }>(
      'posts',
      { include: post, _fields: 'title,content' },
    );
    const found = items[0];
    if (!found) throw new Error('This book is no longer on Golden Audiobooks.');
    return parsePost(found.title.rendered, found.content.rendered);
  });
}
