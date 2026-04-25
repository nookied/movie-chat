import { describe, it, expect } from 'vitest';
import { extractDirectTitleLookup } from '@/lib/directTitleLookup';
import { recommendationTag } from '@/lib/chatTags';

describe('extractDirectTitleLookup', () => {
  it('extracts a fully quoted title lookup immediately', () => {
    expect(extractDirectTitleLookup('"send help"')).toEqual({
      title: 'Send Help',
      type: 'movie',
      year: undefined,
    });
  });

  it('extracts an explicit title declaration', () => {
    expect(extractDirectTitleLookup('the film is titled "send help"')).toEqual({
      title: 'Send Help',
      type: 'movie',
      year: undefined,
    });
  });

  it('extracts a quoted command and trailing year', () => {
    expect(extractDirectTitleLookup('find me "solo mio" 2026')).toEqual({
      title: 'Solo Mio',
      type: 'movie',
      year: 2026,
    });
  });

  it('extracts a single quoted title embedded in a longer sentence', () => {
    expect(extractDirectTitleLookup('can you find "send help" for me')).toEqual({
      title: 'Send Help',
      type: 'movie',
      year: undefined,
    });
  });

  it('extracts a single quoted title with a trailing year', () => {
    expect(extractDirectTitleLookup('please search for "alien" 1979')).toEqual({
      title: 'Alien',
      type: 'movie',
      year: 1979,
    });
  });

  it('infers tv when the declaration says show', () => {
    expect(extractDirectTitleLookup('the show is called severance')).toEqual({
      title: 'Severance',
      type: 'tv',
      year: undefined,
    });
  });

  it('infers tv from "tv show" suffix after quoted title', () => {
    expect(extractDirectTitleLookup('"Mad Men" tv show')).toEqual({
      title: 'Mad Men',
      type: 'tv',
      year: undefined,
    });
  });

  it('infers tv from "tv show" prefix before quoted title', () => {
    const result = extractDirectTitleLookup('A tv show "mad men"');
    expect(result).toEqual({
      title: 'Mad Men',
      type: 'tv',
      year: undefined,
    });
  });

  it('infers tv from "series" keyword around quoted title', () => {
    expect(extractDirectTitleLookup('"The Bear" series')).toEqual({
      title: 'The Bear',
      type: 'tv',
      year: undefined,
    });
  });

  it('keeps movie type when no tv hint is present in quoted segment', () => {
    expect(extractDirectTitleLookup('"Alien" 1979')).toEqual({
      title: 'Alien',
      type: 'movie',
      year: 1979,
    });
  });

  it('ignores generic recommendation requests', () => {
    expect(extractDirectTitleLookup('find me something funny')).toBeNull();
    expect(extractDirectTitleLookup('what should i watch tonight?')).toBeNull();
  });

  it('does not short-circuit when multiple quoted titles are present', () => {
    expect(extractDirectTitleLookup('between "alien" and "aliens", which should i watch?')).toBeNull();
  });

  it('accepts a fully quoted title ending in a question mark', () => {
    expect(extractDirectTitleLookup('"What\'s Up, Doc?"')).toEqual({
      title: "What's Up, Doc?",
      type: 'movie',
      year: undefined,
    });
  });

  it('accepts a quoted title with question mark embedded in a command', () => {
    expect(extractDirectTitleLookup('find me "Who Framed Roger Rabbit?"')).toEqual({
      title: 'Who Framed Roger Rabbit?',
      type: 'movie',
      year: undefined,
    });
  });

  it('still rejects unquoted question-shaped input', () => {
    expect(extractDirectTitleLookup('what is the best horror movie?')).toBeNull();
  });
});

describe('recommendationTag', () => {
  it('serializes the recommendation in app tag format', () => {
    expect(recommendationTag({ title: 'Send Help', type: 'movie' })).toBe(
      '<recommendation>{"title":"Send Help","type":"movie"}</recommendation>'
    );
  });
});
