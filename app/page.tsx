import Link from 'next/link';
import { Suspense } from 'react';
import ChatInterface from '@/components/ChatInterface';
import NewChatButton from '@/components/NewChatButton';

export default function Home() {
  return (
    <main className="flex flex-col h-screen h-dvh bg-plex-bg">
      {/* Header
          In standalone PWA mode, the black-translucent status bar overlays the very top
          of the app. calc() stacks the regular 1rem padding on top of safe-area-inset-top
          so content clears the bar on every iPhone (notch, Dynamic Island, or none).
          Left/right insets handle landscape orientation on notched iPhones. */}
      <header
        className="flex items-center gap-3 border-b border-plex-border bg-plex-card"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
          paddingBottom: '1rem',
          paddingLeft: 'max(1.5rem, env(safe-area-inset-left))',
          paddingRight: 'max(1.5rem, env(safe-area-inset-right))',
        }}
      >
        <div className="w-8 h-8 rounded bg-plex-accent flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-black">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
          </svg>
        </div>
        <div className="min-w-0">
          <h1 className="text-white font-semibold text-lg leading-none whitespace-nowrap">Movie Chat</h1>
          <p className="hidden sm:block text-gray-400 text-xs mt-0.5">An AI-powered Plex assistant</p>
        </div>
        <Link
          href="/popular"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition-colors text-sm font-medium"
          aria-label="Popular movies"
          title="Popular movies"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" />
          </svg>
          <span className="hidden sm:inline">Popular</span>
        </Link>
        <div className="flex-1" />
        <div className="w-px h-6 bg-plex-border mx-1" aria-hidden="true" />
        <NewChatButton />
        <Link
          href="/settings"
          className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
          aria-label="Settings"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a6.97 6.97 0 0 0-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.47.47 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.47.47 0 0 0-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
        </Link>
      </header>

      {/* Chat — Suspense boundary is required by useSearchParams() inside ChatInterface. */}
      <Suspense fallback={null}>
        <ChatInterface />
      </Suspense>
    </main>
  );
}
