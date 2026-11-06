import { parseSize } from '../format.ts';
import { getText, host } from '../host.ts';
import { hashId } from '../ids.ts';
import { hashFromMagnet, trackersOf } from '../magnet.ts';
import type { Release } from '../types.ts';
import type { Indexer } from './types.ts';

/** RuTor: an open Russian tracker. Its books category holds audiobooks next to e-books. */
const SITE = 'https://rutor.info';
const BOOKS = 11;
const NAME = 'RuTor';

const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

/** Audiobooks name their format; uploaders often type "МР3" in Cyrillic letters. */
const AUDIO = /(^|[^\p{L}\p{N}])([MМ][PР]3|[MМ]4[BВ]|AAC|FLAC|OGG|OPUS)([^\p{L}\p{N}]|$)/iu;

/** "17 Дек 17" → ISO date. */
export function parseDate(text: string): string | undefined {
  const m = text.match(/(\d{1,2})\s+(\S+)\s+(\d{2})/);
  const month = MONTHS.indexOf(m?.[2] ?? '');
  if (!m || month < 0) return undefined;
  return new Date(Date.UTC(2000 + Number(m[3]), month, Number(m[1]))).toISOString();
}

export interface Row {
  cells: string[];
  links: string[];
  seeders: string | null;
}

export function toRelease(row: Row): Release | undefined {
  const magnet = row.links.find((l) => l.startsWith('magnet:'));
  const hash = hashFromMagnet(magnet);
  const title = row.cells[1]?.replace(/\s+/g, ' ').trim();
  if (!hash || !title || !AUDIO.test(title)) return undefined;
  return {
    id: hashId(hash),
    infoHash: hash,
    title,
    source: NAME,
    // Rows with comments have one cell more, so size and peers are counted from the end.
    size: parseSize(row.cells[row.cells.length - 2] ?? ''),
    seeders: Number.parseInt(row.seeders?.replace(/\D/g, '') ?? '', 10) || 0,
    added: parseDate(row.cells[0] ?? ''),
    trackers: trackersOf(magnet).filter((t) => !t.includes('retracker.local')),
  };
}

export async function parseListing(html: string): Promise<Release[]> {
  const rows = await host.select(html, 'tr.gai, tr.tum', {
    cells: ['td'],
    links: ['a@href'],
    seeders: 'span.green',
  });
  return rows.map(toRelease).filter((r): r is Release => r !== undefined);
}

export const rutor: Indexer = {
  name: NAME,
  // 100: all words, in titles; 2: most seeders first.
  search: async (query) =>
    parseListing(await getText(`${SITE}/search/0/${BOOKS}/100/2/${encodeURIComponent(query)}`)),
};
