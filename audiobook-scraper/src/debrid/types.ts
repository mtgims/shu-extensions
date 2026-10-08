import type { FileTarget } from '../files.ts';
import type { TorrentFile } from '../types.ts';

export interface DebridService {
  id: string;
  name: string;
  /**
   * Which of `hashes` are instantly available. Only services that can tell without adding the
   * torrent to the user's account implement this (Real-Debrid and AllDebrid removed it).
   */
  cached?(apiKey: string, hashes: string[]): Promise<Set<string>>;
  /** File list of a cached torrent, again without side effects. */
  cachedFiles?(apiKey: string, hash: string): Promise<TorrentFile[] | undefined>;
  /** Adds the torrent if needed and returns a direct link to the wanted file. */
  resolve(apiKey: string, magnet: string, hash: string, target: FileTarget): Promise<string>;
}

/** The service is still downloading the torrent. `progress` is 0 to 1 when known. */
export class NotReadyError extends Error {
  progress?: number;
  constructor(message: string, progress?: number) {
    super(message);
    this.progress = progress;
  }
}

export class FileNotFoundError extends Error {}
