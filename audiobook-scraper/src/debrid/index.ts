import { setting } from '../host.ts';
import { alldebrid } from './alldebrid.ts';
import { premiumize } from './premiumize.ts';
import { realdebrid } from './realdebrid.ts';
import { torbox } from './torbox.ts';
import type { DebridService } from './types.ts';

export const DEBRID: Record<string, DebridService> = { realdebrid, alldebrid, torbox, premiumize };

/** Services the user gave an API key for, in a fixed order. */
export function configuredServices(): { service: DebridService; key: string }[] {
  return Object.values(DEBRID)
    .map((service) => ({ service, key: String(setting(service.id, '')).trim() }))
    .filter((s) => s.key.length > 0);
}
