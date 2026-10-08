/** The app's API for extensions (the app's docs/EXTENSIONS.md), plus small helpers on top. */

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | undefined>;
  timeout?: number;
  body?: string;
  json?: unknown;
  form?: Record<string, string | number | (string | number)[]>;
  multipart?: Record<string, string>;
}

export interface FetchResult {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  text: string;
}

type Fields = Record<string, string | [string]>;
type Selected<F extends Fields> = {
  [K in keyof F]: F[K] extends [string] ? string[] : string | null;
};

interface Host {
  fetch(url: string, options?: FetchOptions): Promise<FetchResult>;
  select(
    html: string,
    selector: string,
  ): Promise<{ text: string; html: string; attrs: Record<string, string> }[]>;
  select<F extends Fields>(html: string, selector: string, fields: F): Promise<Selected<F>[]>;
  settings: Record<string, unknown>;
  cache: {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown, seconds?: number): Promise<void>;
  };
  sleep(ms: number): Promise<void>;
  log(...args: unknown[]): void;
}

/** Set up by the app before this code runs. */
export const host = (globalThis as unknown as { host: Host }).host;

export class HttpError extends Error {
  status: number;
  constructor(status: number, url: string, text: string) {
    super(`HTTP ${status} from ${hostOf(url)}: ${text.slice(0, 200)}`);
    this.status = status;
  }
}

export const hostOf = (url: string) => url.match(/^\w+:\/\/([^/?#]+)/)?.[1] ?? url;

/** fetch that throws on HTTP errors and returns the body. */
export async function getText(url: string, options?: FetchOptions): Promise<string> {
  const res = await host.fetch(url, options);
  if (!res.ok) throw new HttpError(res.status, url, res.text);
  return res.text;
}

export async function getJson<T>(url: string, options?: FetchOptions): Promise<T> {
  return JSON.parse(await getText(url, options)) as T;
}

/** Runs `compute` once per key while its result is cached. */
export async function cached<T>(
  key: string,
  seconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  const hit = await host.cache.get<T>(key);
  if (hit !== null) return hit;
  const value = await compute();
  await host.cache.set(key, value, seconds);
  return value;
}

/** Rejects after `ms` so one slow site can't hold up a search. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    promise,
    host.sleep(ms).then(() => {
      throw new Error(`${what} took longer than ${ms / 1000}s`);
    }),
  ]);
}

/** Calls `fn` until `done` accepts the result or the attempts run out; returns the last result. */
export async function poll<T>(
  fn: () => Promise<T>,
  done: (value: T) => boolean,
  attempts: number,
  intervalMs = 1000,
): Promise<T> {
  let value = await fn();
  for (let i = 1; i < attempts && !done(value); i++) {
    await host.sleep(intervalMs);
    value = await fn();
  }
  return value;
}

export function setting<T>(key: string, fallback: T): T {
  const value = host.settings[key];
  return value === undefined || value === null || value === '' ? fallback : (value as T);
}
