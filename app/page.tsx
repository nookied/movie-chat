import ChatInterface from '@/components/ChatInterface';

export default function Home() {
  return (
    <main className="flex flex-col h-screen bg-plex-bg">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-4 border-b border-plex-border bg-plex-card">
        <div className="w-8 h-8 rounded bg-plex-accent flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-black">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
          </svg>
        </div>
        <div>
          <h1 className="text-white font-semibold text-lg leading-none">Movie Chat</h1>
          <p className="text-gray-400 text-xs mt-0.5">Plex · Ollama · Transmission</p>
        </div>
      </header>

      {/* Chat */}
      <ChatInterface />
    </main>
  );
}
