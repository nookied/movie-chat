'use client';

import { memo, RefObject, useCallback } from 'react';
import { ChatMessage, Recommendation, TorrentOption } from '@/types';
import { recommendationKey } from '@/lib/mediaKeys';
import Message from '@/components/Message';
import RecommendationCard from '@/components/RecommendationCard';

interface Props {
  bottomRef: RefObject<HTMLDivElement>;
  forceRecommendationInLibrary: (recommendation: Recommendation) => boolean;
  isRecommendationDownloading: (recommendation: Recommendation, season?: number) => boolean;
  isStreaming: boolean;
  messages: ChatMessage[];
  onDownload: (title: string, year?: number, mediaType?: 'movie' | 'tv') => Promise<boolean>;
  onNoSuitableQuality: (title: string, year?: number) => void;
  onNotFound: (title: string) => void;
  onPlexFound: (title: string, year?: number) => void;
  onResolveRecommendation: (messageId: string, recommendationIndex: number, recommendation: Recommendation) => void;
  onTorrentsReady: (
    title: string,
    year: number | undefined,
    torrents: TorrentOption[],
    mediaType: 'movie' | 'tv',
    season?: number,
    strictYear?: boolean
  ) => void;
}

// A per-message item. Wrapping the inline arrows in `useCallback` here keeps
// their identity stable across parent re-renders, so `useRecommendationCardState`'s
// main effect does not re-fire every time `ChatInterface` re-renders (which
// happens on every input keystroke and every streaming token).
interface ItemProps {
  forceRecommendationInLibrary: (recommendation: Recommendation) => boolean;
  isRecommendationDownloading: (recommendation: Recommendation, season?: number) => boolean;
  isStreaming: boolean;
  message: ChatMessage;
  onDownload: (title: string, year?: number, mediaType?: 'movie' | 'tv') => Promise<boolean>;
  onNoSuitableQuality: (title: string, year?: number) => void;
  onNotFound: (title: string) => void;
  onPlexFound: (title: string, year?: number) => void;
  onResolveRecommendation: (messageId: string, recommendationIndex: number, recommendation: Recommendation) => void;
  onTorrentsReady: (
    title: string,
    year: number | undefined,
    torrents: TorrentOption[],
    mediaType: 'movie' | 'tv',
    season?: number,
    strictYear?: boolean
  ) => void;
}

// Wrapped in `memo` so older messages in the list skip re-rendering each time
// the assistant message streams a new chunk — only the message whose `message`
// prop actually changed re-renders.
const ChatMessageItem = memo(function ChatMessageItem({
  forceRecommendationInLibrary,
  isRecommendationDownloading,
  isStreaming,
  message,
  onDownload,
  onNoSuitableQuality,
  onNotFound,
  onPlexFound,
  onResolveRecommendation,
  onTorrentsReady,
}: ItemProps) {
  return (
    <div>
      <Message
        message={message}
        thinking={isStreaming && message.role === 'assistant' && message.content === ''}
      />
      {message.role === 'assistant' && message.recommendations?.map((recommendation, index) => (
        <RecommendationSlot
          key={recommendationKey(recommendation)}
          forceInLibrary={forceRecommendationInLibrary(recommendation)}
          index={index}
          isRecommendationDownloading={isRecommendationDownloading}
          messageId={message.id}
          onDownload={onDownload}
          onNoSuitableQuality={onNoSuitableQuality}
          onNotFound={onNotFound}
          onPlexFound={onPlexFound}
          onResolveRecommendation={onResolveRecommendation}
          onTorrentsReady={onTorrentsReady}
          recommendation={recommendation}
        />
      ))}
    </div>
  );
});

interface SlotProps {
  forceInLibrary: boolean;
  index: number;
  isRecommendationDownloading: (recommendation: Recommendation, season?: number) => boolean;
  messageId: string;
  onDownload: (title: string, year?: number, mediaType?: 'movie' | 'tv') => Promise<boolean>;
  onNoSuitableQuality: (title: string, year?: number) => void;
  onNotFound: (title: string) => void;
  onPlexFound: (title: string, year?: number) => void;
  onResolveRecommendation: (messageId: string, recommendationIndex: number, recommendation: Recommendation) => void;
  onTorrentsReady: (
    title: string,
    year: number | undefined,
    torrents: TorrentOption[],
    mediaType: 'movie' | 'tv',
    season?: number,
    strictYear?: boolean
  ) => void;
  recommendation: Recommendation;
}

// Bridge between the list-level handler (which needs `messageId` + `index` to
// locate the recommendation) and the card-level handler (which only receives
// the resolved recommendation). Memoising here keeps the closure identity
// stable per-slot across parent renders.
function RecommendationSlot({
  forceInLibrary,
  index,
  isRecommendationDownloading,
  messageId,
  onDownload,
  onNoSuitableQuality,
  onNotFound,
  onPlexFound,
  onResolveRecommendation,
  onTorrentsReady,
  recommendation,
}: SlotProps) {
  const handleResolve = useCallback((next: Recommendation) => {
    onResolveRecommendation(messageId, index, next);
  }, [index, messageId, onResolveRecommendation]);

  const handleIsDownloading = useCallback((season?: number) => (
    isRecommendationDownloading(recommendation, season)
  ), [isRecommendationDownloading, recommendation]);

  return (
    <RecommendationCard
      forceInLibrary={forceInLibrary}
      isDownloading={handleIsDownloading}
      onDownload={onDownload}
      onNoSuitableQuality={onNoSuitableQuality}
      onNotFound={onNotFound}
      onPlexFound={onPlexFound}
      onResolveRecommendation={handleResolve}
      onTorrentsReady={onTorrentsReady}
      recommendation={recommendation}
    />
  );
}

export default function ChatMessageList({
  bottomRef,
  forceRecommendationInLibrary,
  isRecommendationDownloading,
  isStreaming,
  messages,
  onDownload,
  onNoSuitableQuality,
  onNotFound,
  onPlexFound,
  onResolveRecommendation,
  onTorrentsReady,
}: Props) {
  return (
    <div
      className="flex-1 overflow-y-auto overscroll-none py-6 space-y-5"
      style={{
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}
    >
      {messages.map((message) => (
        <ChatMessageItem
          key={message.id}
          forceRecommendationInLibrary={forceRecommendationInLibrary}
          isRecommendationDownloading={isRecommendationDownloading}
          isStreaming={isStreaming}
          message={message}
          onDownload={onDownload}
          onNoSuitableQuality={onNoSuitableQuality}
          onNotFound={onNotFound}
          onPlexFound={onPlexFound}
          onResolveRecommendation={onResolveRecommendation}
          onTorrentsReady={onTorrentsReady}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
