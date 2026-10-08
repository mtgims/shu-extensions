const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'm4b',
  'm4a',
  'aac',
  'flac',
  'ogg',
  'oga',
  'opus',
  'wma',
  'wav',
  'mka',
]);

export function extension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export const isAudio = (name: string) => AUDIO_EXTENSIONS.has(extension(name));

export const basename = (path: string) => path.split(/[\\/]/).pop() ?? path;

/**
 * Natural order, so "Chapter 2" comes before "Chapter 10". Hand-written because the app's JS
 * engine has no Intl.
 */
export function naturalCompare(a: string, b: string): number {
  const x = a.toLowerCase().match(/\d+|\D+/g) ?? [];
  const y = b.toLowerCase().match(/\d+|\D+/g) ?? [];
  // "2" and "02" are equal; only if nothing else differs does the spelling decide.
  let tie = 0;
  for (let i = 0; i < x.length && i < y.length; i++) {
    const p = x[i] as string;
    const q = y[i] as string;
    if (p === q) continue;
    if (/^\d/.test(p) && /^\d/.test(q)) {
      if (Number(p) !== Number(q)) return Number(p) - Number(q);
      tie ||= p < q ? -1 : 1;
      continue;
    }
    return p < q ? -1 : 1;
  }
  return x.length - y.length || tie;
}

/** The playable files of a torrent in listening order. */
export function chapters<T extends { name: string }>(files: T[]): T[] {
  return files.filter((f) => isAudio(f.name)).sort((a, b) => naturalCompare(a.name, b.name));
}

/**
 * Letters and digits only, in any script, so "Philosopher’s" equals "Philosopher's" and
 * "a/b.mp3" equals "a b.mp3".
 */
export const squash = (text: string) =>
  text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');

/** What the player wants: everything known about one chapter file, from the indexer. */
export interface FileTarget {
  /** As the indexer listed it; may differ from the real path (AudioBook Bay joins folders). */
  name?: string;
  /** Bytes; indexers often round it. */
  size?: number;
  /** Chapter number (0-based) and chapter count, in natural order of the audio files. */
  position?: number;
  count?: number;
}

const only = <T>(list: T[]) => (list.length === 1 ? list[0] : undefined);

/**
 * Finds the wanted file in a debrid service's file list. Services name and order files
 * differently from indexers, so it tries, in order: the file name, the end of the full path,
 * the size, then the chapter's position. Without a name it takes the largest audio file, which
 * is the whole book for single-file (m4b) releases.
 */
export function pickFile<T extends { name: string; size?: number }>(
  files: T[],
  target: FileTarget = {},
): T | undefined {
  const audio = chapters(files);
  const pool = audio.length > 0 ? audio : files;
  if (!target.name) {
    return pool.reduce<T | undefined>(
      (best, f) => (best && (best.size ?? 0) >= (f.size ?? 0) ? best : f),
      undefined,
    );
  }

  const wanted = squash(target.name);
  const wantedBase = squash(basename(target.name));
  const byName =
    only(
      files.filter(
        (f) => basename(f.name).toLowerCase() === basename(target.name ?? '').toLowerCase(),
      ),
    ) ??
    only(files.filter((f) => squash(basename(f.name)) === wantedBase)) ??
    // AudioBook Bay lists "Folder File.mp3" for "Folder/File.mp3": compare whole paths.
    only(files.filter((f) => squash(f.name).endsWith(wanted))) ??
    only(files.filter((f) => wanted.endsWith(squash(basename(f.name)))));
  if (byName) return byName;

  if (target.size) {
    const size = target.size;
    const bySize = only(
      pool.filter((f) => f.size !== undefined && Math.abs(f.size - size) <= size * 0.01),
    );
    if (bySize) return bySize;
  }

  if (target.position !== undefined && target.count === audio.length) {
    return audio[target.position];
  }
  return undefined;
}

export function describeTarget(target: FileTarget): string {
  return target.name ? basename(target.name) : 'the largest audio file';
}
