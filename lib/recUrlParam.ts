import { Recommendation } from '@/types';

export function parseRecFromUrl(search: string): Recommendation | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return null;
  }

  const raw = params.get('rec');
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  if (!title) return null;

  if (obj.type !== 'movie' && obj.type !== 'tv') return null;

  const year =
    typeof obj.year === 'number' && Number.isFinite(obj.year) && obj.year > 1800 && obj.year < 3000
      ? obj.year
      : undefined;
  const strictYear = obj.strictYear === true && year !== undefined ? true : undefined;

  return {
    title,
    type: obj.type,
    ...(year !== undefined ? { year } : {}),
    ...(strictYear ? { strictYear: true } : {}),
  };
}
