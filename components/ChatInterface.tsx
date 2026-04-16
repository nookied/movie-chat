'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatMessage } from '@/types';
import DownloadsPanel from './DownloadsPanel';
import ChatComposer from './chat/ChatComposer';
import ChatMessageList from './chat/ChatMessageList';
import { randomId } from '@/lib/randomId';
import {
  noSuitableQualitySystemMessage,
  notFoundSystemMessage,
  plexFoundSystemMessage,
} from '@/lib/chat/systemMessages';
import { useAppDownloads } from '@/hooks/useAppDownloads';
import { useChatHistory } from '@/hooks/useChatHistory';
import { useChatSendMessage } from '@/hooks/useChatSendMessage';
import { useDownloadTrigger } from '@/hooks/useDownloadTrigger';
import { usePendingTorrents } from '@/hooks/usePendingTorrents';

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Hey! I'm your Plex movie assistant. Tell me what you're in the mood for — a genre, a vibe, an actor — and I'll find you something to watch.",
};

export default function ChatInterface() {
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, setMessages } = useChatHistory({
    isStreaming,
    welcomeMessage: WELCOME,
  });

  const addInfoMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: randomId(), role: 'info', content },
    ]);
  }, [setMessages]);

  const {
    activeDownloads,
    handleDownloadComplete,
    handleDownloadMoved,
    isRecommendationDownloading,
    isRecommendationForcedInLibrary,
    trackStartedDownload,
  } = useAppDownloads();

  const { handleTorrentsReady, pendingTorrents } = usePendingTorrents(addInfoMessage);
  const triggerDownload = useDownloadTrigger({
    addInfoMessage,
    pendingTorrents,
    trackStartedDownload,
  });
  const { sendMessage } = useChatSendMessage({
    isStreaming,
    messages,
    setIsStreaming,
    setMessages,
    triggerDownload,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput('');
    await sendMessage(text);
  }, [input, isStreaming, sendMessage]);

  const handlePlexFound = useCallback((title: string) => {
    addInfoMessage(plexFoundSystemMessage(title));
  }, [addInfoMessage]);

  const handleNoSuitableQuality = useCallback((title: string) => {
    addInfoMessage(noSuitableQualitySystemMessage(title));
  }, [addInfoMessage]);

  const handleNotFound = useCallback((title: string) => {
    addInfoMessage(notFoundSystemMessage(title));
  }, [addInfoMessage]);

  return (
    <>
      <ChatMessageList
        bottomRef={bottomRef}
        forceRecommendationInLibrary={isRecommendationForcedInLibrary}
        isRecommendationDownloading={isRecommendationDownloading}
        isStreaming={isStreaming}
        messages={messages}
        onDownload={triggerDownload}
        onNoSuitableQuality={handleNoSuitableQuality}
        onNotFound={handleNotFound}
        onPlexFound={handlePlexFound}
        onTorrentsReady={handleTorrentsReady}
      />

      <DownloadsPanel
        downloads={activeDownloads}
        onMoved={handleDownloadMoved}
        onComplete={handleDownloadComplete}
      />

      <ChatComposer
        input={input}
        inputRef={inputRef}
        isStreaming={isStreaming}
        onSend={handleSend}
        setInput={setInput}
      />
    </>
  );
}
