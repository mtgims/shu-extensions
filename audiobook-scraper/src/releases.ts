import { searchAll } from './search.ts';
import type { Release } from './types.ts';

/** A book from a catalog extension, as the app passes it to releases(). */
export interface WorkQuery {
  title: string;
  authors?: string[];
  durationMinutes?: number;
}

const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** Words that releases often leave out ("Philosopher's Stone" for "and the Philosopher's Stone"). */
const SMALL = new Set(['a', 'an', 'and', 'the', 'of', 's', 'to', 'in', 'on']);
const significant = (list: string[]) => {
  const kept = list.filter((w) => !SMALL.has(w));
  return kept.length > 0 ? kept : list;
};

/** "Dune: Deluxe Edition (Dune Chronicles, Book 1)" → "Dune" */
export const mainTitle = (title: string) => title.replace(/\s*[:([].*$/, '').trim() || title;

const BUNDLE =
  /\b(collection|complete|books? \d+ ?(-|to|&) ?\d+|series|omnibus|box ?set|trilogy)\b/i;
/** RuTracker marks English audiobooks "[Английский]"; other Cyrillic titles are translations. */
const TRANSLATED = (title: string) =>
  /\p{Script=Cyrillic}/u.test(title) && !/Английский|English/i.test(title);
/** "Atomic Habits (Hindi Edition)", "[Spanish]", "Español": a translation, unless the book is too. */
const LANGUAGE =
  /\b(hindi|spanish|espa[nñ]ol|french|fran[cç]ais|german|deutsch|italian|italiano|portuguese|portugu[eê]s|russian|japanese|chinese|arabic|turkish|polish|dutch|korean|svenska|norsk|dansk)\b/i;
const NOT_THE_BOOK = /\b(summary|analysis|study guide|dramati[sz]ed|bbc radio|unofficial)\b/i;

/**
 * How well a torrent matches the book: it must contain every word of the title, and the
 * author's last name when known. Single books beat collections; summaries and dramatizations
 * come last. Higher is better; 0 means no match.
 */
export function matchScore(release: Release, work: WorkQuery): number {
  const text = `${release.title} ${release.author ?? ''}`;
  const have = new Set(words(text));
  const wanted = significant(words(mainTitle(work.title)));
  if (wanted.length === 0 || !wanted.every((w) => have.has(w))) return 0;
  const surname = work.authors?.[0] ? words(work.authors[0]).pop() : undefined;
  if (surname && !have.has(surname)) return 0;
  let score = 100;
  if (BUNDLE.test(release.title)) score -= 40;
  if (NOT_THE_BOOK.test(release.title)) score -= 60;
  if (TRANSLATED(release.title) && !/\p{Script=Cyrillic}/u.test(work.title)) score -= 50;
  if (LANGUAGE.test(release.title) && !LANGUAGE.test(work.title)) score -= 50;
  // Fewer extra words: closer to just "Author - Title".
  score -= Math.min(words(release.title).length - wanted.length, 20);
  return score;
}

export function rankReleases(found: Release[], work: WorkQuery): Release[] {
  const scored = found.map((r) => ({ r, score: matchScore(r, work) })).filter((x) => x.score > 0);
  const seeders = (r: Release) => r.seeders ?? Number.MAX_SAFE_INTEGER;
  scored.sort((a, b) => b.score - a.score || seeders(b.r) - seeders(a.r));
  return scored.map((x) => x.r);
}

/** Torrents of a catalog book, best first. */
export async function findReleases(work: WorkQuery, limit = 15): Promise<Release[]> {
  const title = mainTitle(work.title);
  const surname = work.authors?.[0] ? words(work.authors[0]).pop() : undefined;
  let found = await searchAll(surname ? `${title} ${surname}` : title);
  // Some sites only match the title; try that too when the first search finds little.
  if (surname && rankReleases(found, work).length < 3) {
    const byTitle = await searchAll(title);
    found = [...found, ...byTitle.filter((r) => !found.some((f) => f.id === r.id))];
  }
  return rankReleases(found, work).slice(0, limit);
}
