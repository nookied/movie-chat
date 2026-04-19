/**
 * Unit tests for lib/recUrlParam.ts — the sanitising parser used when the
 * Popular-movies card injects a recommendation into the chat via ?rec=<json>.
 *
 * Only the shape { title: string, year?: number, type: 'movie' | 'tv' } is
 * accepted; everything else returns null so a malformed or hostile URL
 * cannot inject arbitrary data into the chat.
 */

import { describe, it, expect } from 'vitest';
import { parseRecFromUrl } from '@/lib/recUrlParam';

function makeSearch(recObj: unknown): string {
  return `?rec=${encodeURIComponent(JSON.stringify(recObj))}`;
}

describe('parseRecFromUrl() — happy path', () => {
  it('returns a recommendation for a valid movie payload', () => {
    const rec = parseRecFromUrl(makeSearch({ title: 'Inception', year: 2010, type: 'movie' }));
    expect(rec).toEqual({ title: 'Inception', year: 2010, type: 'movie' });
  });

  it('returns a recommendation for a valid tv payload', () => {
    const rec = parseRecFromUrl(makeSearch({ title: 'Succession', type: 'tv' }));
    expect(rec).toEqual({ title: 'Succession', type: 'tv' });
  });

  it('omits year when absent from payload', () => {
    const rec = parseRecFromUrl(makeSearch({ title: 'Nomadland', type: 'movie' }));
    expect(rec).toEqual({ title: 'Nomadland', type: 'movie' });
    expect(rec).not.toHaveProperty('year');
  });

  it('trims whitespace from title', () => {
    const rec = parseRecFromUrl(makeSearch({ title: '  Inception  ', type: 'movie' }));
    expect(rec?.title).toBe('Inception');
  });

  it('accepts search string without leading ?', () => {
    const raw = `rec=${encodeURIComponent(JSON.stringify({ title: 'X', type: 'movie' }))}`;
    expect(parseRecFromUrl(raw)).toEqual({ title: 'X', type: 'movie' });
  });
});

describe('parseRecFromUrl() — rejects malformed input', () => {
  it('returns null when rec param is missing', () => {
    expect(parseRecFromUrl('')).toBeNull();
    expect(parseRecFromUrl('?foo=bar')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseRecFromUrl('?rec=not-json')).toBeNull();
    expect(parseRecFromUrl('?rec=%7Bbroken')).toBeNull();
  });

  it('returns null for non-object JSON', () => {
    expect(parseRecFromUrl('?rec=null')).toBeNull();
    expect(parseRecFromUrl('?rec=42')).toBeNull();
    expect(parseRecFromUrl('?rec=%22string%22')).toBeNull();
    expect(parseRecFromUrl('?rec=%5B1%2C2%5D')).toBeNull();
  });

  it('returns null when title is missing', () => {
    expect(parseRecFromUrl(makeSearch({ type: 'movie' }))).toBeNull();
  });

  it('returns null when title is empty or whitespace', () => {
    expect(parseRecFromUrl(makeSearch({ title: '', type: 'movie' }))).toBeNull();
    expect(parseRecFromUrl(makeSearch({ title: '   ', type: 'movie' }))).toBeNull();
  });

  it('returns null when title is not a string', () => {
    expect(parseRecFromUrl(makeSearch({ title: 123, type: 'movie' }))).toBeNull();
  });

  it('returns null when type is invalid', () => {
    expect(parseRecFromUrl(makeSearch({ title: 'X' }))).toBeNull();
    expect(parseRecFromUrl(makeSearch({ title: 'X', type: 'music' }))).toBeNull();
    expect(parseRecFromUrl(makeSearch({ title: 'X', type: '' }))).toBeNull();
  });

  it('drops year when it is not a finite number', () => {
    const rec = parseRecFromUrl(makeSearch({ title: 'X', year: 'abc', type: 'movie' }));
    expect(rec).toEqual({ title: 'X', type: 'movie' });
  });

  it('drops wildly out-of-range year', () => {
    expect(
      parseRecFromUrl(makeSearch({ title: 'X', year: 10000, type: 'movie' })),
    ).toEqual({ title: 'X', type: 'movie' });
    expect(
      parseRecFromUrl(makeSearch({ title: 'X', year: 1200, type: 'movie' })),
    ).toEqual({ title: 'X', type: 'movie' });
  });

  it('does not pass through extra fields like strictYear', () => {
    const rec = parseRecFromUrl(
      makeSearch({ title: 'X', type: 'movie', strictYear: true, hostile: 'payload' }),
    );
    expect(rec).toEqual({ title: 'X', type: 'movie' });
  });
});
