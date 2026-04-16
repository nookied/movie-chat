'use client';

import { Dispatch, RefObject, SetStateAction } from 'react';

interface Props {
  input: string;
  inputRef: RefObject<HTMLTextAreaElement>;
  isStreaming: boolean;
  onSend: () => void;
  setInput: Dispatch<SetStateAction<string>>;
}

export default function ChatComposer({ input, inputRef, isStreaming, onSend, setInput }: Props) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }

  function handleInputChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(event.target.value);
    event.target.style.height = 'auto';
    event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
  }

  return (
    <div
      className="border-t border-plex-border bg-plex-card pt-3"
      style={{
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}
    >
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
          onClick={onSend}
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
  );
}
