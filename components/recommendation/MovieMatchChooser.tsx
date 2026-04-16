'use client';

import { MovieDisambiguationCandidate } from '@/types';

interface Props {
  candidates: MovieDisambiguationCandidate[];
  onSelect: (candidate: MovieDisambiguationCandidate) => void;
  title: string;
}

export default function MovieMatchChooser({ candidates, onSelect, title }: Props) {
  return (
    <div className="mt-3 rounded-lg border border-plex-border bg-gray-900/60 p-3">
      <p className="text-xs text-gray-300">
        Multiple exact matches found for <span className="text-white font-medium">{title}</span>. Pick the right one before we check Plex or downloads.
      </p>
      <div className="mt-3 space-y-2">
        {candidates.map((candidate) => (
          <button
            key={`${candidate.tmdbId}-${candidate.year ?? 'unknown'}`}
            onClick={() => onSelect(candidate)}
            className="w-full rounded-lg border border-plex-border bg-plex-card px-3 py-2 text-left transition-colors hover:border-plex-accent/70 hover:bg-gray-800"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-white">
                {candidate.title}
                {candidate.year !== undefined ? ` (${candidate.year})` : ''}
              </span>
              <span className="text-xs font-semibold text-plex-accent">Choose</span>
            </div>
            {candidate.overview ? (
              <p className="mt-1 line-clamp-2 text-xs text-gray-400">{candidate.overview}</p>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
