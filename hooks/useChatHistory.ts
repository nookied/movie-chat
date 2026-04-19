'use client';

import { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '@/types';

const MAX_HISTORY_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function trimChatHistory(
  messages: ChatMessage[],
  maxMessages: number,
  maxAgeMs = MAX_HISTORY_AGE_MS,
  now = Date.now()
): ChatMessage[] {
  return messages
    .filter((m) =>
      m.id && m.role && m.content &&
      (!!m.timestamp && now - m.timestamp < maxAgeMs)
    )
    .slice(-maxMessages);
}

interface Options {
  isStreaming: boolean;
  maxStoredMessages?: number;
  storageKey?: string;
  welcomeMessage: ChatMessage;
}

export function useChatHistory({
  isStreaming,
  maxStoredMessages = 100,
  storageKey = 'movie-chat-history',
  welcomeMessage,
}: Options) {
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const firstSaveRef = useRef(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as ChatMessage[];
      const valid = trimChatHistory(parsed, maxStoredMessages);
      if (valid.length === 0) return;

      // Functional merge so we don't clobber messages appended by concurrent
      // effects on the same mount (e.g., ?rec=... injecting a recommendation
      // before this localStorage load commits).
      setMessages((prev) => {
        const validIds = new Set(valid.map((m) => m.id));
        const additions = prev.filter(
          (m) => m.id !== welcomeMessage.id && !validIds.has(m.id)
        );
        return additions.length === 0 ? valid : [...valid, ...additions];
      });
    } catch { /* localStorage unavailable or corrupt — keep welcome */ }
  }, [maxStoredMessages, storageKey, welcomeMessage]);

  useEffect(() => {
    if (firstSaveRef.current) {
      firstSaveRef.current = false;
      return;
    }
    if (isStreaming) return;

    try {
      const toStore = messages
        .filter((message) => message.content)
        .slice(-maxStoredMessages);
      localStorage.setItem(storageKey, JSON.stringify(toStore));
    } catch { /* storage full or unavailable */ }
  }, [isStreaming, maxStoredMessages, messages, storageKey]);

  return { messages, setMessages };
}
