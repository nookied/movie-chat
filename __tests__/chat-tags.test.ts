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

  it('includes year when provided', () => {
    expect(recommendationTag({ title: 'Arrival', year: 2016, type: 'movie' })).toBe(
      '<recommendation>{"title":"Arrival","year":2016,"type":"movie"}</recommendation>'
    );
  });

  it('omits year when undefined', () => {
    const tag = recommendationTag({ title: 'Test', type: 'tv' });
    expect(tag).not.toContain('"year"');
  });
});

describe('extractRecommendations — edge cases', () => {
  it('skips entries with no title', () => {
    const text = '<recommendation>{"year":2020,"type":"movie"}</recommendation>';
    expect(extractRecommendations(text)).toEqual([]);
  });

  it('handles malformed JSON gracefully', () => {
    const text = '<recommendation>{not valid json}</recommendation>';
    expect(extractRecommendations(text)).toEqual([]);
  });

  it('deduplicates by title+year', () => {
    const text = [
      '<recommendation>{"title":"Dune","year":2021,"type":"movie"}</recommendation>',
      '<recommendation>{"title":"Dune","year":2021,"type":"movie"}</recommendation>',
    ].join('\n');
    expect(extractRecommendations(text)).toHaveLength(1);
  });

  it('treats same title with different years as distinct', () => {
    const text = [
      '<recommendation>{"title":"Dune","year":1984,"type":"movie"}</recommendation>',
      '<recommendation>{"title":"Dune","year":2021,"type":"movie"}</recommendation>',
    ].join('\n');
    expect(extractRecommendations(text)).toHaveLength(2);
  });

  it('normalizes non-string year to number or undefined', () => {
    const text = '<recommendation>{"title":"Test","year":"2021","type":"movie"}</recommendation>';
    const result = extractRecommendations(text);
    expect(result[0].year).toBe(2021);
  });

  it('sets year to undefined for non-numeric year strings', () => {
    const text = '<recommendation>{"title":"Test","year":"unknown","type":"movie"}</recommendation>';
    const result = extractRecommendations(text);
    expect(result[0].year).toBeUndefined();
  });

  it('defaults type to movie when not tv', () => {
    const text = '<recommendation>{"title":"Test","type":"film"}</recommendation>';
    const result = extractRecommendations(text);
    expect(result[0].type).toBe('movie');
  });

  it('extracts tags embedded in surrounding text', () => {
    const text = 'Great choice! Here is a recommendation: <recommendation>{"title":"Alien","year":1979,"type":"movie"}</recommendation> Let me know what you think.';
    expect(extractRecommendations(text)).toEqual([
      { title: 'Alien', year: 1979, type: 'movie' },
    ]);
  });

  it('handles multiline tag content from small models', () => {
    const text = '<recommendation>{\n  "title": "Alien",\n  "year": 1979,\n  "type": "movie"\n}</recommendation>';
    expect(extractRecommendations(text)).toEqual([
      { title: 'Alien', year: 1979, type: 'movie' },
    ]);
  });
});

describe('stripChatActionTags — edge cases', () => {
  it('strips multiple tags from the same message', () => {
    const text = [
      'Try these:',
      '<recommendation>{"title":"A","type":"movie"}</recommendation>',
      '<recommendation>{"title":"B","type":"movie"}</recommendation>',
    ].join('\n');
    expect(stripChatActionTags(text)).toBe('Try these:');
  });

  it('strips orphaned closing tags', () => {
    const text = 'text </recommendation> more </download> end';
    expect(stripChatActionTags(text)).toBe('text  more  end');
  });

  it('strips orphaned opening tags', () => {
    const text = 'text <recommendation> more <download> end';
    expect(stripChatActionTags(text)).toBe('text  more  end');
  });

  it('returns empty string for tag-only content', () => {
    expect(stripChatActionTags('<recommendation>{"title":"X","type":"movie"}</recommendation>')).toBe('');
  });

  it('handles partial tag at end of streaming chunk', () => {
    expect(stripChatActionTags('Nice movie <recommendation')).toBe('Nice movie');
    expect(stripChatActionTags('Done <download')).toBe('Done');
  });
});
