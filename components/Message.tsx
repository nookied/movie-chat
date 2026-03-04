'use client';

import { ChatMessage } from '@/types';

interface Props {
  message: ChatMessage;
  thinking?: boolean;
}

// Strip action tags from display text — they are handled by the app silently.
// Handles both the canonical format <recommendation>{...}</recommendation>
// and the malformed self-closing variant <recommendation{...}> some models emit.
// Also strips partial tags that are still arriving mid-stream.
function cleanContent(content: string): string {
  return content
    // Complete canonical tags
    .replace(/<recommendation>[\s\S]*?<\/recommendation>/g, '')
    .replace(/<download>[\s\S]*?<\/download>/g, '')
    // Malformed self-closing opening: <recommendation{...}>
    .replace(/<recommendation\s*\{[^>]*\}>/g, '')
    .replace(/<download\s*\{[^>]*\}>/g, '')
    // Orphaned opening/closing tags left when model mixes formats
    .replace(/<\/?recommendation>/g, '')
    .replace(/<\/?download>/g, '')
    // Partial tag still mid-stream at end of content
    .replace(/<(recommendation|download)[^>]*$/g, '')
    .trim();
}

export default function Message({ message, thinking = false }: Props) {
  const { role } = message;

  // Info messages are kept in state for LLM context but not shown in the chat UI
  if (role === 'info') return null;

  const isUser = role === 'user';
  const displayText = cleanContent(message.content);

  if (!displayText && !isUser && !thinking) return null;

  return (
    <div className={`flex ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
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
