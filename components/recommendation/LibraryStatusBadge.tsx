'use client';

interface Props {
  forceInLibrary: boolean;
  plexState: 'idle' | 'loading' | 'done' | 'skipped' | 'error';
  showPlex: boolean;
  someSeasonsInPlex: boolean;
}

export default function LibraryStatusBadge({
  forceInLibrary,
  plexState,
  showPlex,
  someSeasonsInPlex,
}: Props) {
  if (plexState === 'loading' && !forceInLibrary) {
    return (
      <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full flex-shrink-0 animate-pulse">
        Checking Plex...
      </span>
    );
  }

  if (showPlex) {
    return (
      <span className="text-xs bg-green-900/60 text-green-400 border border-green-700 px-2 py-0.5 rounded-full flex-shrink-0">
        On Plex ✓
      </span>
    );
  }

  if (someSeasonsInPlex) {
    return (
      <span className="text-xs bg-yellow-900/40 text-yellow-500 border border-yellow-700/50 px-2 py-0.5 rounded-full flex-shrink-0">
        Partially in library
      </span>
    );
  }

  return (
    <span className="text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0">
      Not in library
    </span>
  );
}
