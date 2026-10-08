import { getJson, setting } from './host.ts';
import type { Summary } from './types.ts';

/**
 * Open Library knows what people read: its trending lists and "most read" ranking (how many
 * readers logged a book) are what the home rows are made of.
 */
const API = 'https://openlibrary.org';
const FIELDS =
  'key,title,author_name,cover_i,first_publish_year,editions,editions.title,editions.language,editions.cover_i';

interface Edition {
  title?: string;
  language?: string[];
  cover_i?: number;
}

export interface Doc {
  key: string;
  title: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  /** With `lang`, Open Library puts the best edition in that language first. */
  editions?: { docs?: Edition[] };
}

/** Open Library's search takes two-letter codes for `lang`, three-letter ones elsewhere. */
const TWO_LETTER: Record<string, string> = {
  eng: 'en',
  spa: 'es',
  fre: 'fr',
  ger: 'de',
  ita: 'it',
  por: 'pt',
};

export const coverUrl = (id: number) => `https://covers.openlibrary.org/b/id/${id}-L.jpg`;

/** "/works/OL82563W" → "ol:OL82563W" */
export const workId = (key: string) => `ol:${key.replace(/^\/works\//, '')}`;

/** Edition titles are often lowercase ("The 48 laws of power"); the work's title is spelled right. */
const sameWords = (a: string, b: string) =>
  a.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === b.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** The edition in the chosen language, if the work has one ("O Alquimista" → "The Alchemist"). */
function localEdition(doc: Doc, lang: string): Edition | undefined {
  const edition = doc.editions?.docs?.[0];
  return edition?.language?.includes(lang) ? edition : undefined;
}

export function toSummary(doc: Doc, lang = 'any'): Summary {
  const edition = localEdition(doc, lang);
  const cover = edition?.cover_i ?? doc.cover_i;
  return {
    id: workId(doc.key),
    title: edition?.title && !sameWords(edition.title, doc.title) ? edition.title : doc.title,
    authors: doc.author_name?.slice(0, 2),
    cover: cover ? coverUrl(cover) : undefined,
    details: doc.first_publish_year ? `First published ${doc.first_publish_year}` : undefined,
  };
}

const language = () => setting('language', 'eng');

/**
 * List items in the chosen language. Books without a cover look broken in a row of covers, and
 * books with no edition in that language are of no use to the listener; both are left out.
 */
function summaries(docs: Doc[]): Summary[] {
  const lang = language();
  return docs
    .filter((d) => d.cover_i && (lang === 'any' || localEdition(d, lang)))
    .map((d) => toSummary(d, lang));
}

const langParam = () => TWO_LETTER[language()];

/** The most read books of a subject ("fantasy", "thriller", …), in the chosen language. */
export async function mostRead(subject: string, skip: number, limit = 24) {
  const lang = language();
  const q = `subject:"${subject}"${lang === 'any' ? '' : ` language:${lang}`}`;
  const res = await getJson<{ docs: Doc[]; numFound: number }>(`${API}/search.json`, {
    query: { q, sort: 'readinglog', fields: FIELDS, limit, offset: skip, lang: langParam() },
    timeout: 20000,
  });
  return {
    books: summaries(res.docs),
    hasMore: skip + res.docs.length < Math.min(res.numFound, 500),
  };
}

/** What people are reading on Open Library right now. */
export async function trending(skip: number, limit = 30) {
  const res = await getJson<{ works: Doc[] }>(`${API}/trending/daily.json`, {
    query: { limit: skip + limit },
    timeout: 20000,
  });
  const works = res.works.slice(skip);
  const hasMore = works.length === limit && skip + limit < 150;
  if (language() === 'any' || works.length === 0) return { books: summaries(works), hasMore };
  // The trending list has original titles only; one search finds the editions in the chosen
  // language for all of them at once.
  const keys = works.map((w) => `"${w.key}"`).join(' OR ');
  const found = await getJson<{ docs: Doc[] }>(`${API}/search.json`, {
    query: { q: `key:(${keys})`, fields: FIELDS, limit: works.length, lang: langParam() },
    timeout: 20000,
  });
  const byKey = new Map(found.docs.map((d) => [d.key, d]));
  const inOrder = works.map((w) => byKey.get(w.key)).filter((d): d is Doc => d !== undefined);
  return { books: summaries(inOrder), hasMore };
}

interface WorkJson {
  title: string;
  description?: string | { value: string };
  subjects?: string[];
  covers?: number[];
  first_publish_date?: string;
  authors?: { author: { key: string } }[];
}

export interface WorkDetails {
  title: string;
  author?: string;
  description?: string;
  genres: string[];
  cover?: string;
  year?: string;
}

/** A work's page. Pass the author when the list already showed it, to skip one request. */
export async function work(olId: string, knownAuthor?: string): Promise<WorkDetails> {
  const json = await getJson<WorkJson>(`${API}/works/${encodeURIComponent(olId)}.json`);
  const authorKey = json.authors?.[0]?.author.key;
  const author = knownAuthor
    ? knownAuthor
    : authorKey
      ? await getJson<{ name?: string }>(`${API}${authorKey}.json`).then(
          (a) => a.name,
          () => undefined,
        )
      : undefined;
  const description =
    typeof json.description === 'string' ? json.description : json.description?.value;
  return {
    title: json.title,
    author,
    // Open Library descriptions often end with a list of links and source notes.
    description: description?.split(/\n-{3,}|\n\s*\(\[source\]/)[0]?.trim(),
    genres: (json.subjects ?? []).filter((s) => s.length < 30 && !/[:=]/.test(s)).slice(0, 6),
    cover: json.covers?.find((c) => c > 0)
      ? coverUrl(json.covers.find((c) => c > 0) as number)
      : undefined,
    year: json.first_publish_date?.match(/\d{4}/)?.[0],
  };
}
