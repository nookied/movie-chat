import { describe, expect, it } from 'vitest';
import { trimChatHistory } from '@/hooks/useChatHistory';
import { ChatMessage } from '@/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const EPOCH = 1000 * DAY_MS;

function msg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { id: 'msg-1', role: 'user', content: 'hello', ...overrides };
}

describe('trimChatHistory', () => {
  it('keeps messages within the age limit', () => {
    const m = msg({ id: 'a', timestamp: EPOCH - DAY_MS });
    expect(trimChatHistory([m], 100, 7 * DAY_MS, EPOCH)).toEqual([m]);
  });

  it('drops messages older than maxAgeMs', () => {
    const old = msg({ id: 'old', timestamp: EPOCH - 8 * DAY_MS });
    const fresh = msg({ id: 'fresh', timestamp: EPOCH - DAY_MS });
    expect(trimChatHistory([old, fresh], 100, 7 * DAY_MS, EPOCH)).toEqual([fresh]);
  });

  it('drops messages without a timestamp', () => {
    const m = msg({ id: 'no-ts' });
    expect(trimChatHistory([m], 100, 7 * DAY_MS, EPOCH)).toEqual([]);
  });

  it('trims to maxMessages keeping the most recent entries', () => {
    const msgs = Array.from({ length: 5 }, (_, i) =>
      msg({ id: `m${i}`, content: `msg ${i}`, timestamp: EPOCH - DAY_MS })
    );
    expect(trimChatHistory(msgs, 3, 7 * DAY_MS, EPOCH)).toEqual(msgs.slice(-3));
  });

  it('applies both age and count limits together', () => {
    const old = msg({ id: 'old', timestamp: EPOCH - 8 * DAY_MS });
    const kept = Array.from({ length: 5 }, (_, i) =>
      msg({ id: `k${i}`, content: `msg ${i}`, timestamp: EPOCH - DAY_MS })
    );
    const result = trimChatHistory([old, ...kept], 3, 7 * DAY_MS, EPOCH);
    expect(result).toEqual(kept.slice(-3));
  });

  it('drops messages missing required fields', () => {
    const missingId = { id: '', role: 'user' as const, content: 'x' };
    const missingContent = { id: 'a', role: 'user' as const, content: '' };
    expect(trimChatHistory([missingId, missingContent], 100, 7 * DAY_MS, EPOCH)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(trimChatHistory([], 100, 7 * DAY_MS, EPOCH)).toEqual([]);
  });
});
