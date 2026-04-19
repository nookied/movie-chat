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
      (!m.timestamp || now - m.timestamp < maxAgeMs)
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
      if (valid.length > 0) setMessages(valid);
    } catch { /* localStorage unavailable or corrupt — keep welcome */ }
  }, [storageKey, maxStoredMessages]);

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
