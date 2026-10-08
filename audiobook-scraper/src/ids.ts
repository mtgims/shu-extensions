/**
 * Book ids. They carry what is needed to load the book again after the app restarts:
 *   atb:h:<infohash>            a torrent known by hash (Knaben, Torznab)
 *   atb:tpb:<tpb id>:<infohash>  a Pirate Bay torrent (its id gives the file list)
 *   atb:abb:<slug>               an AudioBook Bay post (the hash is on the post)
 * Chapter ids are file indexes in the torrent, or -1 for "the whole torrent".
 */
const PREFIX = 'atb:';

export const hashId = (hash: string) => `${PREFIX}h:${hash.toLowerCase()}`;
export const tpbId = (id: string, hash: string) => `${PREFIX}tpb:${id}:${hash.toLowerCase()}`;
export const abbId = (slug: string) => `${PREFIX}abb:${slug}`;

export type ParsedId =
  | { kind: 'h'; hash: string }
  | { kind: 'tpb'; tpbId: string; hash: string }
  | { kind: 'abb'; slug: string };

export function parseId(id: string): ParsedId | undefined {
  let m = id.match(/^atb:h:([0-9a-f]{40})$/);
  if (m?.[1]) return { kind: 'h', hash: m[1] };
  m = id.match(/^atb:tpb:(\d+):([0-9a-f]{40})$/);
  if (m?.[1] && m[2]) return { kind: 'tpb', tpbId: m[1], hash: m[2] };
  m = id.match(/^atb:abb:([^:/?#\s]+)$/);
  if (m?.[1]) return { kind: 'abb', slug: m[1] };
  return undefined;
}
