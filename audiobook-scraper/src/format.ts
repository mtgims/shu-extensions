const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '?';
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  return `${(bytes / 1024 ** exp).toFixed(exp >= 3 ? 2 : 0)} ${UNITS[exp]}`;
}

/** Parses sizes like "205.01 MBs", "2.73 GB" or "880 KiB" into bytes. */
export function parseSize(text: string): number | undefined {
  const m = text.replace(/,/g, '').match(/([\d.]+)\s*([KMGT]?)i?B/i);
  if (!m?.[1]) return undefined;
  const exp = ['', 'K', 'M', 'G', 'T'].indexOf((m[2] ?? '').toUpperCase());
  return Math.round(Number.parseFloat(m[1]) * 1024 ** exp);
}

/** Pulls the audio format and bitrate out of a release title, e.g. "... [M4B 64kbps]". */
export function audioTags(title: string): { format?: string; bitrate?: string } {
  const format = title.match(/\b(m4b|m4a|mp3|flac|aac|opus|ogg)\b/i)?.[1]?.toUpperCase();
  const kbps = title.match(/\b(\d{2,3})\s?k(?:bps|b\/s)?\b/i)?.[1];
  return { format, bitrate: kbps ? `${kbps} kbps` : undefined };
}

export const decodeEntities = (text: string) =>
  text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
