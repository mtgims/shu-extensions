import { getText, hostOf } from '../host.ts';
import { hashId } from '../ids.ts';
import { hashFromMagnet, normalizeHash } from '../magnet.ts';
import type { Release } from '../types.ts';
import type { Indexer } from './types.ts';

/** Newznab/Torznab category for audiobooks. */
const AUDIOBOOKS = 3030;

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const tag = (xml: string, name: string) =>
  decode(xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? '').trim();

/** Parses a Torznab RSS reply. Items without an info hash or magnet are skipped. */
export function parseFeed(xml: string, source: string): Release[] {
  const releases: Release[] = [];
  for (const [, item = ''] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const attrs = new Map<string, string>();
    for (const [, name = '', value = ''] of item.matchAll(
      /<(?:torznab:)?attr\s+name="([^"]+)"\s+value="([^"]*)"/g,
    )) {
      attrs.set(name, decode(value));
    }
    const hash =
      normalizeHash(attrs.get('infohash')) ??
      hashFromMagnet(attrs.get('magneturl') ?? tag(item, 'link'));
    if (!hash) continue;
    const pubDate = new Date(tag(item, 'pubDate'));
    releases.push({
      id: hashId(hash),
      infoHash: hash,
      title: tag(item, 'title'),
      source,
      seeders: attrs.has('seeders') ? Number(attrs.get('seeders')) : undefined,
      size: Number(tag(item, 'size') || attrs.get('size')) || undefined,
      added: Number.isNaN(pubDate.getTime()) ? undefined : pubDate.toISOString(),
    });
  }
  return releases;
}

/** The user's Jackett or Prowlarr, which brings any tracker they support (private ones too). */
export function torznab(url: string, apiKey: string): Indexer {
  const name = `Torznab (${hostOf(url)})`;
  return {
    name,
    search: async (query) =>
      parseFeed(
        await getText(url, {
          query: { t: 'search', q: query, cat: AUDIOBOOKS, apikey: apiKey || undefined },
          timeout: 25000,
        }),
        name,
      ),
  };
}
