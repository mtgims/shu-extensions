/** One file inside a torrent. `idx` is its position in the list it came from. */
export interface TorrentFile {
  idx: number;
  name: string;
  size?: number;
}

/** A single torrent release found on an indexer. */
export interface Release {
  /** Book id, see ids.ts. */
  id: string;
  /** Lowercase hex. AudioBook Bay results only get it once their detail page is read. */
  infoHash?: string;
  title: string;
  /** Indexer names, joined when the same torrent shows up on several. */
  source: string;
  size?: number;
  seeders?: number;
  poster?: string;
  description?: string;
  author?: string;
  narrator?: string;
  format?: string;
  bitrate?: string;
  /** ISO date. */
  added?: string;
  files?: TorrentFile[];
  trackers?: string[];
  /** The Pirate Bay torrent id, used to fetch its file list. */
  tpbId?: string;
}
