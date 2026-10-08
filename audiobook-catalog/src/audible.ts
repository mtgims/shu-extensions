import { getJson, setting } from './host.ts';
import type { Summary, Work } from './types.ts';

/** Audible's public catalog: the audiobook side of a book (narrators, length, rating, cover). */
const HOSTS: Record<string, string> = {
  us: 'api.audible.com',
  uk: 'api.audible.co.uk',
  ca: 'api.audible.ca',
  au: 'api.audible.com.au',
  de: 'api.audible.de',
  fr: 'api.audible.fr',
  es: 'api.audible.es',
  it: 'api.audible.it',
  in: 'api.audible.in',
  jp: 'api.audible.co.jp',
};

const LIST_GROUPS = 'contributors,media,product_attrs,rating';
const FULL_GROUPS = `${LIST_GROUPS},product_desc,product_extended_attrs,series,category_ladders`;

const api = () => `https://${HOSTS[setting('region', 'us')] ?? HOSTS.us}/1.0/catalog/products`;

export interface Product {
  asin: string;
  title: string;
  subtitle?: string;
  authors?: { name: string }[];
  narrators?: { name: string }[];
  product_images?: Record<string, string>;
  runtime_length_min?: number;
  release_date?: string;
  rating?: { overall_distribution?: { display_average_rating?: string; num_ratings?: number } };
  publisher_summary?: string;
  merchandising_summary?: string;
  series?: { title: string; sequence?: string }[];
  category_ladders?: { ladder: { name: string }[] }[];
  content_delivery_type?: string;
}

export function duration(minutes?: number): string | undefined {
  if (!minutes) return undefined;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

const ratingOf = (p: Product) => {
  const r = Number(p.rating?.overall_distribution?.display_average_rating);
  return r > 0 && (p.rating?.overall_distribution?.num_ratings ?? 0) > 0 ? r : undefined;
};

/** Publisher summaries are HTML. */
export function plainText(html?: string): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<\s*(br|\/p|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/^\s*[-–—_*=]{3,}\s*$/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  return text || undefined;
}

export function toSummary(p: Product): Summary {
  const rating = ratingOf(p);
  return {
    id: `audible:${p.asin}`,
    title: p.title,
    authors: p.authors?.slice(0, 2).map((a) => a.name),
    narrators: p.narrators?.slice(0, 3).map((n) => n.name),
    cover: p.product_images?.['500'],
    details: [duration(p.runtime_length_min), rating ? `★ ${rating.toFixed(1)}` : undefined]
      .filter(Boolean)
      .join(' · '),
  };
}

export function toWork(p: Product): Work {
  const series = p.series?.[0];
  const genres = [
    ...new Set((p.category_ladders ?? []).flatMap((c) => c.ladder.map((l) => l.name))),
  ].slice(0, 5);
  return {
    ...toSummary(p),
    description: plainText(p.publisher_summary) ?? plainText(p.merchandising_summary),
    year: p.release_date?.slice(0, 4),
    durationMinutes: p.runtime_length_min,
    rating: ratingOf(p),
    genres,
    series: series
      ? `${series.title}${series.sequence ? `, book ${series.sequence}` : ''}`
      : undefined,
    chapters: [],
  };
}

async function products(query: Record<string, string | number>, groups = LIST_GROUPS) {
  const res = await getJson<{ products: Product[]; total_results?: number }>(api(), {
    query: { ...query, response_groups: groups, image_sizes: '500' },
  });
  // Podcasts and other non-book content share the catalog.
  return {
    products: res.products.filter((p) => p.content_delivery_type !== 'PodcastParent'),
    total: res.total_results ?? 0,
  };
}

export async function search(keywords: string, skip: number, limit = 30) {
  const { products: found, total } = await products({
    keywords,
    num_results: limit,
    page: Math.floor(skip / limit),
    products_sort_by: 'Relevance',
  });
  return { books: found.map(toSummary), hasMore: skip + limit < Math.min(total, 300) };
}

/** What sells right now on Audible: mostly this month's releases. */
export async function newReleases(skip: number, limit = 30) {
  const { products: found } = await products({
    num_results: limit,
    page: Math.floor(skip / limit),
    products_sort_by: 'BestSellers',
  });
  const today = new Date().toISOString().slice(0, 10);
  const released = found.filter((p) => !p.release_date || p.release_date <= today);
  return { books: released.map(toSummary), hasMore: skip + limit < 150 };
}

export async function product(asin: string): Promise<Work> {
  const res = await getJson<{ product: Product }>(`${api()}/${encodeURIComponent(asin)}`, {
    query: { response_groups: FULL_GROUPS, image_sizes: '500' },
  });
  return toWork(res.product);
}

const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** How well an Audible product matches a book: all title words, and the author's last name. */
export function matchScore(p: Product, title: string, author?: string): number {
  const have = new Set(words(`${p.title} ${p.subtitle ?? ''}`));
  const wanted = words(title.replace(/[:(].*$/, ''));
  if (wanted.length === 0 || !wanted.every((w) => have.has(w))) return 0;
  const surname = author ? words(author).pop() : undefined;
  const byAuthor = surname ? (p.authors ?? []).some((a) => words(a.name).includes(surname)) : true;
  if (!byAuthor) return 0;
  // Prefer the plain edition over dramatized adaptations, summaries and bundles.
  const extra = words(p.title).length - wanted.length;
  return 10 - Math.min(extra, 9) + (p.runtime_length_min ? 1 : 0);
}

/** The audiobook edition of a book, if Audible has one. */
export async function findAudiobook(title: string, author?: string): Promise<Work | undefined> {
  const { products: found } = await products(
    { keywords: `${title} ${author ?? ''}`.trim(), num_results: 10, products_sort_by: 'Relevance' },
    FULL_GROUPS,
  );
  let best: Product | undefined;
  let bestScore = 0;
  for (const p of found) {
    const score = matchScore(p, title, author);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best ? toWork(best) : undefined;
}
