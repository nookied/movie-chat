import { DownloadStatus } from '@/types';
import { cfg } from '@/lib/config';

function rpcUrl() {
  return `${cfg('transmissionBaseUrl', 'TRANSMISSION_BASE_URL', 'http://localhost:9091')}/transmission/rpc`;
}

function authHeader(): Record<string, string> {
  const username = cfg('transmissionUsername', 'TRANSMISSION_USERNAME');
  const password = cfg('transmissionPassword', 'TRANSMISSION_PASSWORD');
  if (!username && !password) return {};
  return {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  };
}

// Transmission requires a session ID obtained from a 409 response
async function getSessionId(): Promise<string> {
  const res = await fetch(rpcUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ method: 'session-get' }),
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });

  if (res.status === 409) {
    const id = res.headers.get('X-Transmission-Session-Id');
    if (id) return id;
  }

  // Transmission occasionally responds without a 409 — the header may still be present
  const id = res.headers.get('X-Transmission-Session-Id');
  if (!id) throw new Error('Failed to obtain Transmission session ID (header missing)');
  return id;
}

async function rpc(
  sessionId: string,
  method: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch(rpcUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Transmission-Session-Id': sessionId,
      ...authHeader(),
    },
    body: JSON.stringify({ method, arguments: args }),
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`Transmission RPC error: ${res.status}`);

  const data = await res.json();
  if (data.result !== 'success') {
    throw new Error(`Transmission returned: ${data.result}`);
  }

  return data.arguments;
}

export async function addTorrent(magnet: string): Promise<number> {
  const sessionId = await getSessionId();
  const downloadDir = cfg('transmissionDownloadDir', 'TRANSMISSION_DOWNLOAD_DIR');

  const args: Record<string, unknown> = { filename: magnet };
  if (downloadDir) args['download-dir'] = downloadDir;

  const result = (await rpc(sessionId, 'torrent-add', args)) as Record<
    string,
    unknown
  >;

  // Result is either torrent-added or torrent-duplicate
  const torrent =
    (result['torrent-added'] as Record<string, unknown>) ??
    (result['torrent-duplicate'] as Record<string, unknown>);

  if (!torrent) throw new Error('No torrent info in response');

  return Number(torrent.id);
}

export async function getTorrentStatus(id: number): Promise<DownloadStatus> {
  const sessionId = await getSessionId();

  const result = (await rpc(sessionId, 'torrent-get', {
    ids: [id],
    fields: [
      'id',
      'name',
      'percentDone',
      'status',
      'eta',
      'rateDownload',
      'downloadDir',
      'files',
    ],
  })) as Record<string, unknown>;

  const torrents = result.torrents as DownloadStatus[];
  if (!torrents?.length) throw new Error('Torrent not found');

  return torrents[0];
}

export async function listActiveTorrents(): Promise<DownloadStatus[]> {
  const sessionId = await getSessionId();

  const result = (await rpc(sessionId, 'torrent-get', {
    fields: ['id', 'name', 'percentDone', 'status', 'eta', 'rateDownload', 'downloadDir', 'files'],
  })) as Record<string, unknown>;

  const torrents = result.torrents as DownloadStatus[];
  if (!torrents?.length) return [];

  // Include: actively downloading/checking (percentDone < 1, not stopped)
  // Also include: fully done but not yet removed (percentDone = 1, status 0 = stopped/seeding-done)
  // so the app can complete the move even if the page was closed during download
  return torrents.filter((t) => t.status !== 0 || t.percentDone >= 1);
}

export async function pauseTorrent(id: number): Promise<void> {
  const sessionId = await getSessionId();
  await rpc(sessionId, 'torrent-stop', { ids: [id] });
}

export async function resumeTorrent(id: number): Promise<void> {
  const sessionId = await getSessionId();
  await rpc(sessionId, 'torrent-start', { ids: [id] });
}

export async function removeTorrent(id: number, deleteData = false): Promise<void> {
  const sessionId = await getSessionId();
  await rpc(sessionId, 'torrent-remove', { ids: [id], 'delete-local-data': deleteData });
}
