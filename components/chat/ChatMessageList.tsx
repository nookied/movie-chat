'use client';

import { RefObject } from 'react';
import { ChatMessage, Recommendation, TorrentOption } from '@/types';
import { recommendationKey } from '@/lib/mediaKeys';
import Message from '@/components/Message';
import RecommendationCard from '@/components/RecommendationCard';

interface Props {
  bottomRef: RefObject<HTMLDivElement>;
  forceRecommendationInLibrary: (recommendation: Recommendation) => boolean;
  isRecommendationDownloading: (recommendation: Recommendation) => boolean;
  isStreaming: boolean;
  messages: ChatMessage[];
  onDownload: (title: string, year?: number) => Promise<boolean>;
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
        <div key={message.id}>
          <Message
            message={message}
            thinking={isStreaming && message.role === 'assistant' && message.content === ''}
          />
          {message.role === 'assistant' && message.recommendations?.map((recommendation, index) => (
            <RecommendationCard
              key={recommendationKey(recommendation)}
              recommendation={recommendation}
              onPlexFound={onPlexFound}
              onResolveRecommendation={(nextRecommendation) =>
                onResolveRecommendation(message.id, index, nextRecommendation)}
              onTorrentsReady={onTorrentsReady}
              onNoSuitableQuality={onNoSuitableQuality}
              onNotFound={onNotFound}
              onDownload={onDownload}
              isDownloading={isRecommendationDownloading(recommendation)}
              forceInLibrary={forceRecommendationInLibrary(recommendation)}
            />
          ))}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
