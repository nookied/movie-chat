'use client';

import { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '@/types';

interface Options {
  isStreaming: boolean;
  maxStoredMessages?: number;
  storageKey?: string;
  welcomeMessage: ChatMessage;
}

export function useChatHistory({
  isStreaming,
  maxStoredMessages = 200,
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
      const valid = parsed.filter((message) => message.id && message.role && message.content);
      if (valid.length > 0) setMessages(valid);
    } catch { /* localStorage unavailable or corrupt — keep welcome */ }
  }, [storageKey]);

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
