export const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://open.demonii.com:1337/announce',
];

export function magnetLink(hash: string, name?: string, trackers: string[] = []): string {
  // "urn:btih:" stays literal: debrid services don't accept it percent-encoded.
  const parts = [`xt=urn:btih:${hash}`];
  if (name) parts.push(`dn=${encodeURIComponent(name)}`);
  for (const tr of new Set([...trackers, ...DEFAULT_TRACKERS])) {
    parts.push(`tr=${encodeURIComponent(tr)}`);
  }
  return `magnet:?${parts.join('&')}`;
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Returns a lowercase 40-char hex info hash from hex or base32 input, or undefined. */
export function normalizeHash(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (/^[0-9a-f]{40}$/i.test(s)) return s.toLowerCase();
  if (!/^[A-Z2-7]{32}$/i.test(s)) return undefined;
  let bits = '';
  for (const c of s.toUpperCase()) bits += BASE32.indexOf(c).toString(2).padStart(5, '0');
  return (bits.match(/.{4}/g) ?? []).map((b) => Number.parseInt(b, 2).toString(16)).join('');
}

export function hashFromMagnet(magnet?: string | null): string | undefined {
  return normalizeHash(magnet?.match(/urn:btih:([0-9a-z]+)/i)?.[1]);
}

/** The `tr` parameters of a magnet link. */
export function trackersOf(magnet?: string | null): string[] {
  return [...(magnet ?? '').matchAll(/[?&]tr=([^&]+)/g)].map((m) =>
    decodeURIComponent((m[1] as string).replace(/\+/g, ' ')),
  );
}
