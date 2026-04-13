/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * Used to kick off the background auto-move poller for completed torrents.
 *
 * Next.js calls register() twice: once with NEXT_RUNTIME='edge' (for the
 * Edge runtime bundle) and once with NEXT_RUNTIME='nodejs' (for the server).
 * We guard against 'edge' because fs/timers are not available there.
 * We also allow undefined (older Next.js builds) to be safe.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'edge') {
    const { startAutoMovePoller } = await import('./lib/autoMove');
    const { getLogger } = await import('./lib/logger');
    const { ensureDiagnosticsToken } = await import('./lib/config');
    // Generate the diagnostics token on first boot so the bundle endpoint
    // always has a value to check against.
    ensureDiagnosticsToken();
    // Forces the logger to initialise and write the first line; also gives
    // us a clean marker in the daily log file for each server (re)start.
    getLogger('server').info('Server started', {
      nodeEnv: process.env.NODE_ENV,
      pid: process.pid,
    });
    startAutoMovePoller();
  }
}
