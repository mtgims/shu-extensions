import { basename, chapters } from './files.ts';
import { audioTags, formatSize } from './format.ts';
import type { Release } from './types.ts';

/** Book and chapter objects as the app expects them (see the app's docs/EXTENSIONS.md). */

const list = (names?: string) =>
  names
    ?.split(',')
    .map((n) => n.trim())
    .filter(Boolean);

export function tags(r: Release): string[] {
  const parsed = audioTags(r.title);
  return [r.format ?? parsed.format, r.bitrate ?? parsed.bitrate].filter((t): t is string => !!t);
}

function details(r: Release): string {
  const parts = [
    r.seeders === undefined ? undefined : `${r.seeders} seeders`,
    r.size ? formatSize(r.size) : undefined,
    r.source,
  ];
  return parts.filter(Boolean).join(' · ');
}

export function toSummary(r: Release) {
  return {
    id: r.id,
    title: r.title,
    authors: list(r.author),
    narrators: list(r.narrator),
    cover: r.poster,
    tags: tags(r),
    details: details(r),
  };
}

const chapterTitle = (name: string) => basename(name).replace(/\.\w{2,4}$/, '');

export function toBook(r: Release) {
  const files = chapters(r.files ?? []);
  // Without a usable file list there is one chapter: the whole torrent (its largest audio file).
  const bookChapters =
    files.length > 0
      ? files.map((f) => ({
          id: String(f.idx),
          title: chapterTitle(f.name),
          size: f.size,
        }))
      : [{ id: '-1', title: r.title, size: r.size }];
  return {
    ...toSummary(r),
    description: r.description,
    year: r.added?.slice(0, 4),
    chapters: bookChapters,
  };
}
