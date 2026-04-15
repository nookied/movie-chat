'use client';

import { ChatMessage } from '@/types';
import { stripChatActionTags } from '@/lib/chatTags';

interface Props {
  message: ChatMessage;
  thinking?: boolean;
}

export default function Message({ message, thinking = false }: Props) {
  const { role } = message;

  // Info messages are kept in state for LLM context but not shown in the chat UI
  if (role === 'info') return null;

  const isUser = role === 'user';
  const displayText = stripChatActionTags(message.content);

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
