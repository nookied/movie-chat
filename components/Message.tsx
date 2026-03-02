'use client';

import { ChatMessage } from '@/types';

interface Props {
  message: ChatMessage;
}

// Strip action tags from display text — they are handled by the app silently
function cleanContent(content: string): string {
  return content
    .replace(/<recommendation>[\s\S]*?<\/recommendation>/g, '')
    .replace(/<download>[\s\S]*?<\/download>/g, '')
    .trim();
}

export default function Message({ message }: Props) {
  const { role } = message;

  // Info messages are rendered as a centered system notice
  if (role === 'info') {
    return (
      <div className="flex justify-center my-1">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-950/40 border border-amber-800/40 text-amber-400/80 text-xs italic max-w-[90%] text-center">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 flex-shrink-0">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
          </svg>
          {message.content}
        </div>
      </div>
    );
  }

  const isUser = role === 'user';
  const displayText = cleanContent(message.content);

  if (!displayText && !isUser) return null;

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold
          ${isUser
            ? 'bg-plex-accent text-black'
            : 'bg-gray-700 text-gray-300'
          }`}
      >
        {isUser ? 'U' : 'AI'}
      </div>

      {/* Bubble */}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap
          ${isUser
            ? 'bg-plex-accent text-black rounded-tr-sm'
            : 'bg-plex-card text-gray-200 rounded-tl-sm border border-plex-border'
          }`}
      >
        {displayText || (
          <span className="inline-flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:300ms]" />
          </span>
        )}
      </div>
    </div>
  );
}
