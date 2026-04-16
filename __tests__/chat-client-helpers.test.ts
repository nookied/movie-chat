import { describe, expect, it } from 'vitest';
import { buildChatHistory, shouldRetryRecommendationTag } from '@/hooks/useChatSendMessage';
import {
  downloadSkippedSystemMessage,
  titleAvailableSystemMessage,
} from '@/lib/chat/systemMessages';
import { ChatMessage } from '@/types';

describe('buildChatHistory', () => {
  it('drops the static welcome message and empty placeholders', () => {
    const messages: ChatMessage[] = [
      { id: 'welcome', role: 'assistant', content: 'Welcome' },
      { id: 'user-1', role: 'user', content: 'find me a thriller' },
      { id: 'assistant-1', role: 'assistant', content: '' },
    ];

    const history = buildChatHistory(messages, {
      id: 'user-2',
      role: 'user',
      content: 'something from the 90s',
    });

    expect(history).toEqual([
      { role: 'user', content: 'find me a thriller' },
      { role: 'user', content: 'something from the 90s' },
    ]);
  });

  it('maps info messages back to assistant role for the LLM history', () => {
    const messages: ChatMessage[] = [
      { id: 'info-1', role: 'info', content: '[System] "Alien" is available.' },
    ];

    const history = buildChatHistory(messages, {
      id: 'user-1',
      role: 'user',
      content: 'download it',
    });

    expect(history).toEqual([
      { role: 'assistant', content: '[System] "Alien" is available.' },
      { role: 'user', content: 'download it' },
    ]);
  });
});

describe('shouldRetryRecommendationTag', () => {
  it('retries for a substantive declarative response with no recommendation tag', () => {
    expect(shouldRetryRecommendationTag(
      'You should watch Arrival. It is cerebral, emotional, and exactly the kind of first-contact film that lingers.',
      0
    )).toBe(true);
  });

  it('does not retry when recommendations were already extracted', () => {
    expect(shouldRetryRecommendationTag('Watch Arrival.', 1)).toBe(false);
  });

  it('does not retry for clarifying questions', () => {
    expect(shouldRetryRecommendationTag('What genre are you in the mood for?', 0)).toBe(false);
  });

  it('does not retry for the guarded short helper phrases', () => {
    expect(shouldRetryRecommendationTag(
      'To give you something that really fits, tell me if you want a movie or a show.',
      0
    )).toBe(false);
  });

  it('does not retry for short replies', () => {
    expect(shouldRetryRecommendationTag('Try Alien.', 0)).toBe(false);
  });
});

describe('chat system message helpers', () => {
  it('formats movie availability prompts with the exact download wording', () => {
    expect(titleAvailableSystemMessage('Arrival')).toBe(
      '[System] "Arrival" is available. Ask the user: "Want me to download Arrival?"'
    );
  });

  it('formats tv availability prompts for both season and complete-series cases', () => {
    expect(titleAvailableSystemMessage('Severance', 2)).toBe(
      '[System] "Severance" Season 2 is available. Ask the user: "Want me to download Season 2 of Severance?"'
    );
    expect(titleAvailableSystemMessage('Severance', 0)).toBe(
      '[System] "Severance" Complete Series is available. Ask the user: "Want me to download Complete Series of Severance?"'
    );
  });

  it('formats download-skipped prompts differently for movies vs tv seasons', () => {
    expect(downloadSkippedSystemMessage('Alien')).toBe(
      '[System] "Alien" is already in your Plex library — download skipped.'
    );
    expect(downloadSkippedSystemMessage('Severance', 2)).toBe(
      '[System] "Severance" Season 2 is already in your Plex library — download skipped.'
    );
  });
});
