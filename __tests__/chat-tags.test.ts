import { describe, expect, it } from 'vitest';
import {
  extractDownloadActions,
  extractRecommendations,
  recommendationTag,
  stripChatActionTags,
} from '@/lib/chatTags';

describe('extractRecommendations', () => {
  it('parses canonical and malformed recommendation tags and dedupes them', () => {
    const text = [
      'Watch this.',
      '<recommendation>{"title":"Arrival","year":2016,"type":"movie"}</recommendation>',
      '<recommendation{"title":"Arrival","year":2016,"type":"movie"}>',
      '<recommendation{"title":"Severance","type":"tv"}>',
    ].join('\n');

    expect(extractRecommendations(text)).toEqual([
      { title: 'Arrival', year: 2016, type: 'movie' },
      { title: 'Severance', type: 'tv', year: undefined },
    ]);
  });
});

describe('extractDownloadActions', () => {
  it('parses download tags in both supported formats', () => {
    const text = [
      '<download>{"title":"Arrival","year":2016}</download>',
      '<download{"title":"Severance"}>',
    ].join('\n');

    expect(extractDownloadActions(text)).toEqual([
      { title: 'Arrival', year: 2016 },
      { title: 'Severance', year: undefined },
    ]);
  });
});

describe('stripChatActionTags', () => {
  it('removes full, malformed, and partial action tags from display text', () => {
    const text = [
      'Under the Skin is a great pick.',
      '<recommendation>{"title":"Under the Skin","year":2013,"type":"movie"}</recommendation>',
      '<download{"title":"Under the Skin","year":2013}>',
      '<recommendation',
    ].join('\n');

    expect(stripChatActionTags(text)).toBe('Under the Skin is a great pick.');
  });
});

describe('recommendationTag', () => {
  it('serializes a recommendation in the expected app format', () => {
    expect(recommendationTag({ title: 'Send Help', type: 'movie' })).toBe(
      '<recommendation>{"title":"Send Help","type":"movie"}</recommendation>'
    );
  });
});
