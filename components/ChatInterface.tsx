'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, Recommendation, ActiveDownload, TorrentOption } from '@/types';
import Message from './Message';
import RecommendationCard from './RecommendationCard';
import DownloadTracker from './DownloadTracker';

// Parse all <recommendation>{...}</recommendation> blocks from a string
function extractRecommendations(text: string): Recommendation[] {
  const regex = /<recommendation>([\s\S]*?)<\/recommendation>/g;
  const results: Recommendation[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.title && parsed.year) {
        results.push({
          title: String(parsed.title),
          year: Number(parsed.year),
          type: parsed.type === 'tv' ? 'tv' : 'movie',
        });
      }
    } catch { /* skip malformed */ }
  }
  return results;
}

// Parse all <download>{...}</download> blocks from a string
function extractDownloadActions(text: string): Array<{ title: string; year: number }> {
  const regex = /<download>([\s\S]*?)<\/download>/g;
  const results: Array<{ title: string; year: number }> = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.title && parsed.year) {
        results.push({ title: String(parsed.title), year: Number(parsed.year) });
      }
    } catch { /* skip malformed */ }
  }
  return results;
}

function recKey(r: Recommendation) {
  return `${r.title.toLowerCase()}-${r.year}`;
}

function torrentKey(title: string, year: number) {
  return `${title.toLowerCase()}-${year}`;
}

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Hey! I'm your Plex movie assistant. Tell me what you're in the mood for — a genre, a vibe, an actor — and I'll find you something to watch.",
};

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeDownload, setActiveDownload] = useState<ActiveDownload | null>(null);

  // Stores the best torrent for each recommended movie (keyed by "title-year")
  const pendingTorrents = useRef<Map<string, TorrentOption>>(new Map());
  const shownRecs = useRef<Set<string>>(new Set());

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Inject a system info message visible in chat and included in LLM history
  const addInfoMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'info', content },
    ]);
  }, []);

  // Called by RecommendationCard when Plex check finds the movie
  const handlePlexFound = useCallback((title: string, _year: number) => {
    addInfoMessage(`[System] "${title}" is already in your Plex library.`);
  }, [addInfoMessage]);

  // Called by RecommendationCard when 1080p torrents are found
  const handleTorrentsReady = useCallback((title: string, year: number, torrents: TorrentOption[]) => {
    pendingTorrents.current.set(torrentKey(title, year), torrents[0]);
    addInfoMessage(`[System] "${title}" is available for download.`);
  }, [addInfoMessage]);

  // Called by RecommendationCard when movie is on YTS but no 1080p
  const handleNoSuitableQuality = useCallback((title: string, _year: number) => {
    addInfoMessage(`[System] "${title}" is on YTS but no 1080p version is available.`);
  }, [addInfoMessage]);

  // Triggered when the LLM emits a <download> tag
  const triggerDownload = useCallback(async (title: string, year: number) => {
    const torrent = pendingTorrents.current.get(torrentKey(title, year));

    if (!torrent) {
      addInfoMessage(`[System] No download ready for "${title}". Try asking again after the availability check completes.`);
      return;
    }

    try {
      const res = await fetch('/api/transmission/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ magnet: torrent.magnet }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to add torrent');

      setActiveDownload({
        torrentId: data.id,
        torrentName: title,
        addedAt: Date.now(),
      });
    } catch (err) {
      addInfoMessage(`[System] Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [addInfoMessage]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput('');

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text };
    const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '' };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    // Info messages become 'assistant' role so the LLM sees them as context
    const history = [...messages, userMsg]
      .filter((m) => m.content)
      .map((m) => ({
        role: m.role === 'info' ? 'assistant' : m.role,
        content: m.content,
      }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => 'Unknown error');
        let errMsg = errText;
        try { errMsg = JSON.parse(errText).error ?? errText; } catch { /* not JSON */ }
        throw new Error(errMsg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;
        setMessages((prev) =>
          prev.map((m) => m.id === assistantMsg.id ? { ...m, content: fullContent } : m)
        );
      }

      // Extract recommendation tags → attach to message
      const recs = extractRecommendations(fullContent);
      if (recs.length > 0) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: fullContent, recommendation: recs[0] } : m
          )
        );
        recs.forEach((r) => shownRecs.current.add(recKey(r)));
      }

      // Extract download tags → fire silently
      const downloads = extractDownloadActions(fullContent);
      for (const d of downloads) {
        triggerDownload(d.title, d.year);
      }

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Something went wrong';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: `Sorry, I ran into an error: ${errMsg}. Make sure Ollama is running.` }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, messages, triggerDownload]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
        {messages.map((msg) => (
          <div key={msg.id}>
            <Message message={msg} />
            {msg.role === 'assistant' && msg.recommendation && (
              <RecommendationCard
                key={recKey(msg.recommendation)}
                recommendation={msg.recommendation}
                onPlexFound={handlePlexFound}
                onTorrentsReady={handleTorrentsReady}
                onNoSuitableQuality={handleNoSuitableQuality}
              />
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-plex-border bg-plex-card px-4 py-3">
        <div className="flex items-end gap-3 max-w-4xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="What are you in the mood for?"
            rows={1}
            disabled={isStreaming}
            className="flex-1 resize-none bg-gray-800 text-gray-100 placeholder-gray-500 rounded-xl px-4 py-3
              text-sm border border-gray-700 focus:outline-none focus:border-plex-accent
              disabled:opacity-50 transition-colors"
            style={{ minHeight: '48px', maxHeight: '160px' }}
          />
          <button
            onClick={sendMessage}
            disabled={isStreaming || !input.trim()}
            className="w-10 h-10 flex-shrink-0 rounded-xl bg-plex-accent text-black flex items-center justify-center
              hover:bg-plex-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isStreaming ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 animate-spin">
                <path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-center text-gray-600 text-xs mt-2">
          Enter to send · Shift+Enter for new line
        </p>
      </div>

      {activeDownload && (
        <DownloadTracker
          download={activeDownload}
          onComplete={() => setActiveDownload(null)}
        />
      )}
    </>
  );
}
