'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage, Recommendation, ActiveDownload, TorrentOption } from '@/types';
import Message from './Message';
import RecommendationCard from './RecommendationCard';
import DownloadTracker from './DownloadTracker';

// Parse recommendation tags from a string.
// Handles both the canonical format: <recommendation>{"json"}</recommendation>
// and the malformed self-closing variant: <recommendation{"json"}> some models emit.
function extractRecommendations(text: string): Recommendation[] {
  const results: Recommendation[] = [];
  const seen = new Set<string>();

  function tryAdd(json: string) {
    try {
      const parsed = JSON.parse(json);
      if (parsed.title && parsed.year) {
        const key = `${String(parsed.title)}-${Number(parsed.year)}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            title: String(parsed.title),
            year: Number(parsed.year),
            type: parsed.type === 'tv' ? 'tv' : 'movie',
          });
        }
      }
    } catch { /* skip malformed */ }
  }

  let match;
  const r1 = /<recommendation>([\s\S]*?)<\/recommendation>/g;
  while ((match = r1.exec(text)) !== null) tryAdd(match[1]);
  const r2 = /<recommendation(\{[\s\S]*?\})>/g;
  while ((match = r2.exec(text)) !== null) tryAdd(match[1]);

  return results;
}

// Parse download tags from a string. Same dual-format tolerance as above.
function extractDownloadActions(text: string): Array<{ title: string; year: number }> {
  const results: Array<{ title: string; year: number }> = [];
  const seen = new Set<string>();

  function tryAdd(json: string) {
    try {
      const parsed = JSON.parse(json);
      if (parsed.title && parsed.year) {
        const key = `${String(parsed.title)}-${Number(parsed.year)}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ title: String(parsed.title), year: Number(parsed.year) });
        }
      }
    } catch { /* skip malformed */ }
  }

  let match;
  const r1 = /<download>([\s\S]*?)<\/download>/g;
  while ((match = r1.exec(text)) !== null) tryAdd(match[1]);
  const r2 = /<download(\{[\s\S]*?\})>/g;
  while ((match = r2.exec(text)) !== null) tryAdd(match[1]);

  return results;
}

// Strip torrent noise: "Dead Mans Wire (2025) [1080p] [WEBRip]..." → "Dead Mans Wire"
function cleanTorrentName(raw: string): string {
  return raw.replace(/\s*[\[(]?\d{4}[\])]?.*$/s, '').trim() || raw;
}

function recKey(r: Recommendation) {
  return `${r.title.toLowerCase()}-${r.year}`;
}

function torrentKey(title: string, year: number) {
  return `${title.toLowerCase()}-${year}`;
}

// crypto.randomUUID() is only available in secure contexts (HTTPS / localhost).
// When accessed over plain HTTP via a local IP (e.g. from a phone), it's undefined.
// This helper falls back to a Math.random-based v4 UUID in that case.
function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Hey! I'm your Plex movie assistant. Tell me what you're in the mood for — a genre, a vibe, an actor — and I'll find you something to watch.",
};

const CHAT_STORAGE_KEY = 'movie-chat-history';
const MAX_STORED_MESSAGES = 200;
const APP_TORRENT_IDS_KEY = 'movie-chat-app-torrents';

function loadAppTorrentIds(): Set<number> {
  try {
    const stored = localStorage.getItem(APP_TORRENT_IDS_KEY);
    if (!stored) return new Set();
    return new Set(JSON.parse(stored) as number[]);
  } catch { return new Set(); }
}

function saveAppTorrentIds(ids: Set<number>) {
  try {
    localStorage.setItem(APP_TORRENT_IDS_KEY, JSON.stringify(Array.from(ids)));
  } catch { }
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([]);

  // Stores the best torrent for each recommended movie (keyed by "title-year")
  const pendingTorrents = useRef<Map<string, TorrentOption>>(new Map());
  const shownRecs = useRef<Set<string>>(new Set());

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Restore chat history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as ChatMessage[];
      // Drop any empty messages left over from an interrupted stream
      const valid = parsed.filter((m) => m.id && m.role && m.content);
      if (valid.length > 0) setMessages(valid);
    } catch { /* localStorage unavailable or corrupt — keep welcome */ }
  }, []);

  // Persist chat history whenever messages settle (not while streaming)
  useEffect(() => {
    if (isStreaming) return;
    try {
      const toStore = messages
        .filter((m) => m.content) // skip empty streaming placeholders
        .slice(-MAX_STORED_MESSAGES);
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(toStore));
    } catch { /* storage full or unavailable */ }
  }, [messages, isStreaming]);

  // On mount, pick up any app-initiated downloads already in progress in Transmission
  useEffect(() => {
    fetch('/api/transmission/status')
      .then((r) => r.json())
      .then((torrents) => {
        if (!Array.isArray(torrents) || torrents.length === 0) return;
        const appIds = loadAppTorrentIds();
        const downloads: ActiveDownload[] = torrents
          .filter((t: { id: number }) => appIds.has(t.id))
          .map((t: { id: number; name: string }) => ({
            torrentId: t.id,
            torrentName: cleanTorrentName(t.name),
            addedAt: Date.now(),
            fromApp: true,
          }));
        if (downloads.length > 0) setActiveDownloads(downloads);
      })
      .catch(() => { /* Transmission not reachable — no-op */ });
  }, []);

  // Inject a system info message visible in chat and included in LLM history
  const addInfoMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: randomId(), role: 'info', content },
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

      const appIds = loadAppTorrentIds();
      appIds.add(data.id);
      saveAppTorrentIds(appIds);

      setActiveDownloads((prev) => [
        ...prev.filter((d) => d.torrentId !== data.id),
        { torrentId: data.id, torrentName: title, addedAt: Date.now(), fromApp: true },
      ]);
    } catch (err) {
      addInfoMessage(`[System] Download failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [addInfoMessage]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput('');

    const userMsg: ChatMessage = { id: randomId(), role: 'user', content: text };
    const assistantMsg: ChatMessage = { id: randomId(), role: 'assistant', content: '' };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    // Build LLM history — exclude the static welcome message (id:'welcome') and empty messages.
    // The welcome message is a pre-written UI string, not a real model turn; including it as
    // an assistant message at position 0 creates an invalid system→assistant→user pattern
    // that causes some models to return an empty response.
    const history = [...messages, userMsg]
      .filter((m) => m.content && m.id !== 'welcome')
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

      // Guard: if the model returned nothing, surface it as an error instead of silent blank
      if (!fullContent.trim()) {
        throw new Error('No response received. Please try again.');
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
            ? { ...m, content: `Sorry, I ran into an error: ${errMsg}` }
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
      <div className="flex-1 overflow-y-auto overscroll-none px-4 py-6 space-y-5">
        {messages.map((msg) => (
          <div key={msg.id}>
            <Message message={msg} thinking={isStreaming && msg.role === 'assistant' && msg.content === ''} />
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
        {activeDownloads.map((dl) => (
          <DownloadTracker
            key={dl.torrentId}
            download={dl}
            onComplete={() => {
              setActiveDownloads((prev) => prev.filter((d) => d.torrentId !== dl.torrentId));
              const appIds = loadAppTorrentIds();
              appIds.delete(dl.torrentId);
              saveAppTorrentIds(appIds);
            }}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* pt-3 always; pb grows to cover iPhone home-indicator via safe-area-inset-bottom */}
      <div className="border-t border-plex-border bg-plex-card px-4 pt-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
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
              text-base sm:text-sm border border-gray-700 focus:outline-none focus:border-plex-accent
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
        <p className="hidden sm:block text-center text-gray-600 text-xs mt-2">
          Enter to send · Shift+Enter for new line
        </p>
      </div>

    </>
  );
}
