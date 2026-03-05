/**
 * Next.js instrumentation hook — runs once when the server process starts.
 * Used to kick off the background auto-move poller for completed torrents.
 *
 * The `nodejs` runtime guard prevents this from running in the Edge runtime
 * (which doesn't have access to Node.js APIs like fs or timers).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startAutoMovePoller } = await import('./lib/autoMove');
    startAutoMovePoller();
  }
}
