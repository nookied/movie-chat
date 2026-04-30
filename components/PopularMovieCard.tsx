'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { YtsMovieEntry } from '@/types';

interface Props {
  movie: YtsMovieEntry;
}

export default function PopularMovieCard({ movie }: Props) {
  const [imgFailed, setImgFailed] = useState(false);
  const firstGenre = movie.genres[0];
  const rec = encodeURIComponent(
    JSON.stringify({ title: movie.title, year: movie.year, type: 'movie', strictYear: true }),
  );

  return (
    <Link
      href={`/?rec=${rec}`}
      className="group flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-plex-border bg-plex-card transition-colors hover:border-plex-accent"
      aria-label={`Send "${movie.title}" to chat`}
    >
      <div className="relative aspect-[2/3] shrink-0 overflow-hidden bg-gray-800">
        {movie.poster && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={movie.poster}
            alt={`${movie.title} poster`}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-600">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10">
              <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
            </svg>
          </div>
        )}

        {movie.imdbRating > 0 && (
          <div className="absolute top-2 left-2 flex items-center gap-1 rounded bg-black/80 px-2 py-0.5 text-xs text-amber-300 backdrop-blur-sm">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            {movie.imdbRating.toFixed(1)}
          </div>
        )}

        {movie.synopsis && (
          <div className="absolute inset-0 flex items-end bg-black/85 p-3 opacity-0 transition-opacity group-hover:opacity-100">
            <p className="text-xs text-gray-200 line-clamp-6">{movie.synopsis}</p>
          </div>
        )}
      </div>

      <div className="flex min-w-0 grow flex-col p-2">
        <div className="mb-1 h-11 min-w-0">
          <h3 className="line-clamp-2 pb-1 text-sm font-medium leading-tight text-white" title={movie.title}>
            {movie.title}
          </h3>
        </div>
        <div className="mt-auto truncate text-xs text-gray-400">
          {movie.year}
          {firstGenre ? ` · ${firstGenre}` : ''}
        </div>
      </div>
    </Link>
  );
}
