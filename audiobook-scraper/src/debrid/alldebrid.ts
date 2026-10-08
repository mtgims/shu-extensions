import { describeTarget, pickFile } from '../files.ts';
import { getJson, poll } from '../host.ts';
import { type DebridService, FileNotFoundError, NotReadyError } from './types.ts';

const API = 'https://api.alldebrid.com';
const AGENT = 'audiobook-scraper';
const READY = 4;

async function ad<T>(
  apiKey: string,
  path: string,
  form: Record<string, string | string[]>,
): Promise<T> {
  const json = await getJson<{ status: string; data: T; error?: { message: string } }>(
    `${API}${path}`,
    { headers: { authorization: `Bearer ${apiKey}` }, form: { agent: AGENT, ...form } },
  );
  if (json.status !== 'success') throw new Error(`AllDebrid: ${json.error?.message ?? 'error'}`);
  return json.data;
}

interface Node {
  n: string;
  s?: number;
  l?: string;
  e?: Node[];
}

/** AllDebrid returns files as a folder tree; flatten it to paths. */
export function flattenTree(
  nodes: Node[],
  prefix = '',
): { name: string; size?: number; link: string }[] {
  return nodes.flatMap((node) =>
    node.e
      ? flattenTree(node.e, `${prefix}${node.n}/`)
      : node.l
        ? [{ name: `${prefix}${node.n}`, size: node.s, link: node.l }]
        : [],
  );
}

interface Status {
  status: string;
  statusCode: number;
  downloaded?: number;
  size?: number;
}

export const alldebrid: DebridService = {
  id: 'alldebrid',
  name: 'AllDebrid',

  async resolve(apiKey, magnet, _hash, target) {
    const upload = await ad<{ magnets: { id: number; error?: { message: string } }[] }>(
      apiKey,
      '/v4/magnet/upload',
      { 'magnets[]': magnet },
    );
    const added = upload.magnets[0];
    if (!added || added.error) {
      throw new Error(`AllDebrid: ${added?.error?.message ?? 'upload failed'}`);
    }
    const id = String(added.id);

    const status = await poll(
      async () => {
        const data = await ad<{ magnets: Status | Status[] }>(apiKey, '/v4.1/magnet/status', {
          id,
        });
        return [data.magnets].flat()[0];
      },
      (s) => !s || s.statusCode >= READY,
      3,
    );
    if (!status || status.statusCode !== READY) {
      const pct = status?.size ? Math.round(((status.downloaded ?? 0) / status.size) * 100) : 0;
      throw new NotReadyError(`AllDebrid: ${status?.status ?? 'unknown'} ${pct}%`, pct / 100);
    }

    const data = await ad<{ magnets: { files: Node[] }[] }>(apiKey, '/v4/magnet/files', {
      'id[]': id,
    });
    const file = pickFile(flattenTree(data.magnets[0]?.files ?? []), target);
    if (!file) {
      throw new FileNotFoundError(`AllDebrid has no file matching ${describeTarget(target)}`);
    }
    return (await ad<{ link: string }>(apiKey, '/v4/link/unlock', { link: file.link })).link;
  },
};
