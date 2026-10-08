import type { Release } from '../types.ts';

export interface Indexer {
  name: string;
  search(query: string): Promise<Release[]>;
}
