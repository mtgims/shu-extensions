import type { DebridService } from './debrid/types.ts';
import { setting } from './host.ts';

/** The services this extension plays through; each entry file sets its own. */
let active: Record<string, DebridService> = {};

export function useServices(services: Record<string, DebridService>): void {
  active = services;
}

export const serviceById = (id: string): DebridService | undefined => active[id];

/** Services ready to use: those that need no key, and those the user gave a key for. */
export function configuredServices(): { service: DebridService; key: string }[] {
  return Object.values(active)
    .map((service) => ({
      service,
      key: service.needsKey === false ? '' : String(setting(service.id, '')).trim(),
    }))
    .filter((s) => s.service.needsKey === false || s.key.length > 0);
}
