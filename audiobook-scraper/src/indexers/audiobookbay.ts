import { parseSize } from '../format.ts';
import { cached, getText, host, setting } from '../host.ts';
import { abbId } from '../ids.ts';
import { normalizeHash } from '../magnet.ts';
import type { Release, TorrentFile } from '../types.ts';
import type { Indexer } from './types.ts';

const NAME = 'AudioBook Bay';

/** Posts per listing page; the latest catalog pages by this. */
export const ABB_PAGE_SIZE = 9;

/** AudioBook Bay changes domains now and then; users can set the current one. */
const site = () =>
  `https://${setting('abbDomain', 'audiobookbay.lu').replace(/^\w+:\/\/|\/+$/g, '')}`;

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const question = (s?: string) => (s && s !== '?' ? s : undefined);

/** Post titles read "Title - Author"; the title itself may contain " - " too. */
export function splitTitle(full: string): { title: string; author?: string } {
  const at = full.lastIndexOf(' - ');
  return at > 0 ? { title: full.slice(0, at), author: full.slice(at + 3) } : { title: full };
}

/** A search or listing page. Results have no info hash yet; the post page has it. */
export async function parseListing(html: string): Promise<Release[]> {
  const posts = await host.select(html, 'div.post', {
    title: '.postTitle h2 a',
    href: '.postTitle h2 a@href',
    cover: '.postContent img@src',
    info: ['.postContent p'],
  });
  const releases: Release[] = [];
  for (const post of posts) {
    const slug = post.href?.match(/\/abss\/([^/]+)\/?/)?.[1];
    if (!slug || !post.title) continue;
    const info = clean(post.info[post.info.length - 1]);
    const posted = info.match(/Posted:\s*(\d{1,2} \w{3} \d{4})/)?.[1];
    const added = posted ? new Date(`${posted} UTC`) : undefined;
    releases.push({
      id: abbId(slug),
      ...splitTitle(clean(post.title)),
      source: NAME,
      poster: post.cover ?? undefined,
      format: question(info.match(/Format:\s*([^/]+?)\s*\//)?.[1]),
      bitrate: question(info.match(/Bitrate:\s*(.+?)\s*File Size/)?.[1]),
      size: parseSize(info.match(/File Size:\s*([\d.,]+\s*[KMGT]?B)/i)?.[1] ?? ''),
      added: added && !Number.isNaN(added.getTime()) ? added.toISOString() : undefined,
    });
  }
  return releases.slice(0, ABB_PAGE_SIZE);
}

/** A post page: info hash, trackers, file list and book details. */
export async function parseDetail(html: string): Promise<Partial<Release>> {
  const [rows, [page]] = await Promise.all([
    host.select(html, 'table tr', { cells: ['td'] }),
    host.select(html, 'body', {
      title: 'h1[itemprop="name"]',
      poster: 'img[itemprop="image"]@src',
      author: 'div.desc .author',
      narrators: ['div.desc .narrator'],
      format: 'div.desc .format',
      bitrate: 'div.desc .bitrate',
      paras: ['div.desc p'],
    }),
  ]);
  const cells = rows.map((r) => r.cells.map(clean));
  const cellAfter = (label: string) => cells.find((r) => r[0] === label)?.[1];

  const trackers = cells
    .filter((r) => r[0] === 'Announce URL:' || r[0] === 'Tracker:')
    .map((r) => r[1] ?? '')
    .filter((t) => /^(udp|https?):\/\//.test(t));

  // AudioBook Bay joins folder and file name with a space ("CD1 Chapter 1.mp3"); the
  // debrid side matches on that (see files.ts).
  const files: TorrentFile[] = [];
  for (const row of cells) {
    if (row.length !== 1 || !row[0]) continue;
    const m = row[0].match(/^(.+\.\w{2,4}) ([\d.,]+ [KMGT]?B)s?$/);
    if (m?.[1] && m[2]) files.push({ idx: files.length, name: m[1], size: parseSize(m[2]) });
  }

  const narrators = (page?.narrators ?? []).map(clean).filter(Boolean);
  const description = (page?.paras ?? []).slice(1).map(clean).filter(Boolean).join('\n');
  return {
    infoHash: normalizeHash(cellAfter('Info Hash:')),
    title: splitTitle(clean(page?.title)).title || undefined,
    poster: page?.poster ?? undefined,
    author: clean(page?.author) || undefined,
    narrator: narrators.join(', ') || undefined,
    format: question(clean(page?.format)),
    bitrate: question(clean(page?.bitrate)),
    size: parseSize(cellAfter('Combined File Size:') ?? ''),
    description: description || undefined,
    trackers,
    files: files.length > 0 ? files : undefined,
  };
}

export const audiobookbay: Indexer = {
  name: NAME,
  search: async (query) =>
    parseListing(await getText(`${site()}/`, { query: { s: query.toLowerCase() } })),
};

/** Newest posts; page starts at 1. */
export async function latest(page: number): Promise<Release[]> {
  return parseListing(await getText(page > 1 ? `${site()}/page/${page}/` : `${site()}/`));
}

export function postDetails(slug: string): Promise<Partial<Release>> {
  return cached(`abb:${slug}`, 24 * 3600, async () =>
    parseDetail(await getText(`${site()}/abss/${encodeURIComponent(slug)}/`)),
  );
}
