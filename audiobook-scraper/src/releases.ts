import { setting } from './host.ts';
import { searchAll } from './search.ts';
import type { Release } from './types.ts';

/** A book from a catalog extension, as the app passes it to releases(). */
export interface WorkQuery {
  title: string;
  authors?: string[];
  narrators?: string[];
  durationMinutes?: number;
  year?: string;
}

/** A torrent of the book, how well it matches, and why (shown with the version in the app). */
export interface Ranked {
  release: Release;
  score: number;
  notes: string[];
  /** How sure the match is; the app only plays a "good" one without asking. */
  match: Match;
}

export type Match = 'good' | 'fair' | 'poor';

/** Notes that are no reason for doubt. */
const REASSURING = new Set(['Same narrator', 'Length matches']);
/** Notes that mean it is probably not the book the catalog shows. */
const WRONG = new Set([
  'Summary or adaptation',
  'Different author',
  'Other language',
  'Too small for the whole book',
]);

/**
 * Good: the book itself, at most one unexplained word and nothing off. Poor: probably another
 * book, or not this book alone (a low score, as collections get). Fair: the book with a doubt,
 * like a different narrator, a sequel-like extra word or a noisy name.
 */
export function matchOf(score: number, notes: string[]): Match {
  if (score < 60 || notes.some((n) => WRONG.has(n))) return 'poor';
  if (score >= 90 && notes.every((n) => REASSURING.has(n))) return 'good';
  return 'fair';
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
  /\b(collection|complete|(books?|volumes?|vol) ?\d+ ?(-|to|&) ?\d+|series|omnibus|box ?set|trilogy)\b/i;
/** Language names in release titles ("(Hindi Edition)", "[Spanish]", "Español"), by code. */
const LANGUAGES: Record<string, string> = {
  english: 'en',
  hindi: 'hi',
  spanish: 'es',
  espanol: 'es',
  french: 'fr',
  francais: 'fr',
  german: 'de',
  deutsch: 'de',
  italian: 'it',
  italiano: 'it',
  portuguese: 'pt',
  portugues: 'pt',
  russian: 'ru',
  japanese: 'ja',
  chinese: 'zh',
  arabic: 'ar',
  turkish: 'tr',
  polish: 'pl',
  dutch: 'nl',
  korean: 'ko',
  svenska: 'sv',
  norsk: 'no',
  dansk: 'da',
};
const LANGUAGE =
  /\b(english|hindi|spanish|espa[nñ]ol|french|fran[cç]ais|german|deutsch|italian|italiano|portuguese|portugu[eê]s|russian|japanese|chinese|arabic|turkish|polish|dutch|korean|svenska|norsk|dansk)\b/i;

/** The language a title names, or undefined when it names none (most English releases). */
export function languageOf(title: string): string | undefined {
  const name = title.match(LANGUAGE)?.[1];
  if (name) return LANGUAGES[name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')];
  // RuTracker marks English audiobooks "[Английский]"; other Cyrillic titles are Russian.
  if (/\p{Script=Cyrillic}/u.test(title)) return /Английский/i.test(title) ? 'en' : 'ru';
  return undefined;
}
const NOT_THE_BOOK =
  /\b(summary|analysis|study guide|dramati[sz]ed|radio (drama|play)|bbc radio|unofficial)\b/i;
/** Shortened readings. "Unabridged" doesn't match: no word boundary inside it. */
const ABRIDGED = /\b(abridged|abr)\b/i;

/** Words uploaders add that say nothing about which book it is. */
const NOISE = new Set(
  (
    'audiobook audiobooks audio book unabridged retail audible english eng read by narrated ' +
    'narrator narrators performed full cast edition version mp3 m4b m4a aac flac opus ogg vbr ' +
    'cbr kbps khz stereo mono hq rip ripped chaptered chapters chapter tagged cover part parts ' +
    'disc disk cd cds hours hrs hr min mins art epub ebook pdf'
  ).split(' '),
);

/** Bitrates, sample rates, sizes, years and running times: not words of a title. */
const MEASURES =
  /\b\d+(\.\d+)?\s?(k|kbps|kb\/s|khz|mb|gb|mib|gib|h|hrs?|hours?|m|mins?|minutes?)\b|\b(19|20)\d\d\b/gi;

/**
 * Words of the torrent name that nothing explains: not the title (subtitle and series
 * included), the authors, the narrators or the usual format words. "Messiah" in "Dune Messiah"
 * is one, so the sequel ranks below "Dune".
 */
function unexplained(release: Release, work: WorkQuery): string[] {
  const known = new Set([
    ...words(work.title),
    ...(work.authors ?? []).flatMap(words),
    ...(work.authors ?? []).map(initials),
    ...(work.narrators ?? []).flatMap(words),
    ...words(release.author ?? ''),
    ...words(release.narrator ?? ''),
  ]);
  const englishOnRuTracker =
    /\p{Script=Cyrillic}/u.test(release.title) && languageOf(release.title) === 'en';
  return words(release.title.replace(MEASURES, ' ')).filter(
    (w) =>
      !known.has(w) &&
      !SMALL.has(w) &&
      !NOISE.has(w) &&
      // A language name is judged as a language, not as an extra word.
      !LANGUAGES[w.normalize('NFD').replace(/\p{M}/gu, '')] &&
      // RuTracker's English audiobooks repeat title and author in Russian ("Dune / Дюна").
      !(englishOnRuTracker && /\p{Script=Cyrillic}/u.test(w)),
  );
}

const surname = (name: string) => words(name).pop();

/** "J. R. R. Tolkien" → "jrr", as uploaders often write it. */
const initials = (name: string) =>
  words(name)
    .filter((w) => w.length === 1)
    .join('');

/**
 * A different person with the author's surname: "Brian Herbert" when looking for Frank Herbert.
 * The word right before the surname is a first name nothing else explains.
 */
function otherAuthor(release: Release, work: WorkQuery): boolean {
  const author = work.authors?.[0];
  const last = author ? surname(author) : undefined;
  if (!author || !last) return false;
  const known = new Set([...words(author), initials(author), ...words(work.title)]);
  const list = words(release.title);
  const at = list.indexOf(last);
  const before = at > 0 ? list[at - 1] : undefined;
  // A first name is written in the same script as the surname; "[Английский] Rowling" isn't one.
  const latin = (w: string) => /^\p{Script=Latin}+$/u.test(w);
  if (!before || before.length <= 2 || latin(before) !== latin(last) || known.has(before)) {
    return false;
  }
  // "Joanne Rowling" for "J. K. Rowling" is the same person.
  const first = words(author)[0] ?? '';
  return !(first.length === 1 && before.startsWith(first));
}

/** A sensible size for the book's length: 32 to 256 kbps, more for lossless. */
function sizeRange(minutes: number, release: Release): [number, number] {
  const seconds = minutes * 60;
  const lossless = /\bflac\b/i.test(`${release.title} ${release.format ?? ''}`);
  return [(seconds * 32000) / 8 / 1.25, ((seconds * (lossless ? 1400000 : 256000)) / 8) * 1.25];
}

/**
 * How well a torrent matches the book. It must contain every word of the title, and the
 * author's last name when known; otherwise the score is 0. Then: unexplained words, a
 * collection, a summary or a release in a language other than [language] cost points; the
 * catalog's narrator and a size that fits the book's length earn some. Higher is better.
 */
export function assess(release: Release, work: WorkQuery, language = 'en'): Ranked {
  const text = `${release.title} ${release.author ?? ''} ${release.narrator ?? ''}`;
  const have = new Set(words(text));
  const wanted = significant(words(mainTitle(work.title)));
  const author = work.authors?.[0] ? surname(work.authors[0]) : undefined;
  if (wanted.length === 0 || !wanted.every((w) => have.has(w)) || (author && !have.has(author))) {
    return { release, score: 0, notes: [], match: 'poor' };
  }
  let score = 100;
  const notes: string[] = [];

  if (BUNDLE.test(release.title)) {
    score -= 40;
    notes.push('Possibly a collection');
  }
  if (NOT_THE_BOOK.test(release.title)) {
    score -= 80;
    notes.push('Summary or adaptation');
  }
  if (ABRIDGED.test(release.title)) {
    score -= 30;
    notes.push('Abridged');
  }
  if (otherAuthor(release, work)) {
    score -= 50;
    notes.push('Different author');
  }
  // Only a language the title names counts: an unmarked release could be in any.
  const spoken = languageOf(release.title);
  if (spoken && language !== 'any' && spoken !== language && spoken !== languageOf(work.title)) {
    score -= 50;
    notes.push('Other language');
  }

  // Numbers ("Book 2", "01") say less than words, so they cost less. Capped, so that a
  // wordy name of the right book still beats a summary.
  let extra = 0;
  for (const w of unexplained(release, work)) extra += /^\d+$/.test(w) ? 3 : 15;
  score -= Math.min(extra, 30);

  const narrators = (work.narrators ?? []).map(surname).filter((n): n is string => !!n);
  if (narrators.length > 0) {
    if (narrators.some((n) => have.has(n))) {
      score += 15;
      notes.unshift('Same narrator');
    } else if (release.narrator) {
      score -= 15;
      notes.push('Different narrator');
    }
  }

  if (work.durationMinutes && release.size) {
    const [low, high] = sizeRange(work.durationMinutes, release);
    if (release.size < low) {
      score -= 40;
      notes.push('Too small for the whole book');
    } else if (release.size > high) {
      score -= 30;
      if (!notes.includes('Possibly a collection')) notes.push('Possibly several books');
    } else {
      score += 10;
      notes.push('Length matches');
    }
  }
  const final = Math.max(score, 1);
  return { release, score: final, notes, match: matchOf(final, notes) };
}

export function rankReleases(found: Release[], work: WorkQuery, language = 'en'): Ranked[] {
  const ranked = found.map((r) => assess(r, work, language)).filter((x) => x.score > 0);
  const seeders = (r: Release) => r.seeders ?? Number.MAX_SAFE_INTEGER;
  ranked.sort((a, b) => b.score - a.score || seeders(b.release) - seeders(a.release));
  return ranked;
}

/** Torrents of a catalog book, best first. */
export async function findReleases(work: WorkQuery, limit = 15): Promise<Ranked[]> {
  const title = mainTitle(work.title);
  const author = work.authors?.[0] ? surname(work.authors[0]) : undefined;
  const language = setting('language', 'en');
  let found = await searchAll(author ? `${title} ${author}` : title);
  // Some sites only match the title; try that too when the first search finds little.
  if (author && rankReleases(found, work, language).length < 3) {
    const byTitle = await searchAll(title);
    found = [...found, ...byTitle.filter((r) => !found.some((f) => f.id === r.id))];
  }
  return rankReleases(found, work, language).slice(0, limit);
}
