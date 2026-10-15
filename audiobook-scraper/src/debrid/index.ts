import { alldebrid } from './alldebrid.ts';
import { premiumize } from './premiumize.ts';
import { realdebrid } from './realdebrid.ts';
import { torbox } from './torbox.ts';
import type { DebridService } from './types.ts';

export const DEBRID: Record<string, DebridService> = { realdebrid, alldebrid, torbox, premiumize };
