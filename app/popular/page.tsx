import Link from 'next/link';
import PopularMoviesPanel from '@/components/PopularMoviesPanel';

export const metadata = {
  title: 'Popular Movies — Movie Chat',
};

export default function PopularPage() {
  return (
    <main className="min-h-screen bg-plex-bg">
      <header
        className="flex items-center gap-3 border-b border-plex-border bg-plex-card"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
          paddingBottom: '1rem',
          paddingLeft: 'max(1.5rem, env(safe-area-inset-left))',
          paddingRight: 'max(1.5rem, env(safe-area-inset-right))',
        }}
      >
        <Link
          href="/"
          className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          aria-label="Back to chat"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-white font-semibold text-lg leading-none">Popular Movies</h1>
          <p className="hidden sm:block text-gray-400 text-xs mt-0.5">Browse top titles on YTS</p>
        </div>
      </header>

      <PopularMoviesPanel />
    </main>
  );
}
