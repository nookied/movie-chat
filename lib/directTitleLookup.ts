import { Recommendation } from '@/types';

const MINOR_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'via',
]);

const ROMAN_NUMERALS = /^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i;
const QUOTED_SEGMENT = /"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’/g;

function inferType(kind?: string): 'movie' | 'tv' {
  if (!kind) return 'movie';
  return /show|series|tv/i.test(kind) ? 'tv' : 'movie';
}

function inferTypeFromContext(text: string): 'movie' | 'tv' {
  return /\b(?:tv|show|series|episode)\b/i.test(text) ? 'tv' : 'movie';
}

function stripOuterQuotes(text: string): string {
  let value = text.trim();
  const pairs: Array<[string, string]> = [['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’']];

  while (value.length >= 2) {
    const match = pairs.find(([open, close]) => value.startsWith(open) && value.endsWith(close));
    if (!match) break;
    value = value.slice(match[0].length, value.length - match[1].length).trim();
  }

  return value;
}

function capitalizeWord(word: string): string {
  if (ROMAN_NUMERALS.test(word)) return word.toUpperCase();

  // Use Unicode property escapes so titles like "über" and "élite" capitalise properly,
  // instead of being skipped by the ASCII-only /[a-z]/ match.
  return word
    .replace(/^([("'`[]*)(\p{Ll})/u, (_m, prefix: string, char: string) => `${prefix}${char.toUpperCase()}`)
    .replace(/-(\p{Ll})/gu, (_m, char: string) => `-${char.toUpperCase()}`);
}

function maybeTitleCase(title: string): string {
  if (title !== title.toLowerCase() || !/\p{Ll}/u.test(title)) return title;

  const words = title.split(' ');
  return words
    .map((word, index) => {
      const normalized = word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '').toLowerCase();
      if (index > 0 && index < words.length - 1 && MINOR_WORDS.has(normalized)) {
        return word.toLowerCase();
      }
      return capitalizeWord(word);
    })
    .join(' ');
}

function extractYearSuffix(title: string): { title: string; year?: number } {
  const match = title.match(/^(.*\S)\s+\(?((?:18|19|20)\d{2})\)?$/);
  if (!match) return { title };

  const year = Number(match[2]);
  const currentYear = new Date().getFullYear();
  if (year < 1888 || year > currentYear + 2) return { title };

  return { title: match[1].trim(), year };
}

function buildRecommendation(
  rawTitle: string,
  type: 'movie' | 'tv' = 'movie',
  forcedYear?: number
): Recommendation | null {
  const trimmed = stripOuterQuotes(rawTitle).replace(/[.!]+$/, '').replace(/\s+/g, ' ').trim();
  if (!trimmed || trimmed.endsWith('?')) return null;

  const cased = maybeTitleCase(trimmed);
  const { title, year } = forcedYear !== undefined
    ? { title: cased, year: forcedYear }
    : extractYearSuffix(cased);

  if (!title) return null;

  return {
    title,
    year,
    type,
  };
}

export function extractDirectTitleLookup(text: string): Recommendation | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const quotedOnly = trimmed.match(/^(?:"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’)(?:\s+\(?((?:18|19|20)\d{2})\)?)?$/);
  if (quotedOnly) {
    const title = quotedOnly[1] ?? quotedOnly[2] ?? quotedOnly[3] ?? quotedOnly[4];
    const year = quotedOnly[5] ? Number(quotedOnly[5]) : undefined;
    return buildRecommendation(title, 'movie', year);
  }

  const quotedSegments = Array.from(trimmed.matchAll(QUOTED_SEGMENT));
  if (quotedSegments.length === 1) {
    const match = quotedSegments[0];
    const title = match[1] ?? match[2] ?? match[3] ?? match[4];
    const afterQuote = trimmed.slice(match.index! + match[0].length);
    const trailingYear = afterQuote.match(/^\s+\(?((?:18|19|20)\d{2})\)?(?:[.!])?\s*$/);
    const year = trailingYear?.[1] ? Number(trailingYear[1]) : undefined;
    return buildRecommendation(title, inferTypeFromContext(trimmed), year);
  }

  const explicitPatterns = [
    /^(?:the\s+)?(?<kind>movie|film|show|series|tv show)\s+(?:is|was)\s+(?:called|titled)\s+(?<title>.+)$/i,
    /^(?:the\s+)?title\s+(?:is|was)\s+(?<title>.+)$/i,
    /^(?:it'?s|its)\s+(?:called|titled)\s+(?<title>.+)$/i,
  ];

  for (const pattern of explicitPatterns) {
    const match = trimmed.match(pattern);
    if (match?.groups?.title) {
      return buildRecommendation(match.groups.title, inferType(match.groups.kind));
    }
  }

  const quotedCommand = trimmed.match(
    /^(?:find|search(?:\s+for)?|look\s+up|check|watch|download)\s+(?:me\s+)?(?<title>(?:"[^"]+"|'[^']+'|“[^”]+”|‘[^’]+’))(?:\s+\(?(?<year>(?:18|19|20)\d{2})\)?)?$/i
  );
  if (quotedCommand?.groups?.title) {
    return buildRecommendation(
      quotedCommand.groups.title,
      inferTypeFromContext(trimmed),
      quotedCommand.groups.year ? Number(quotedCommand.groups.year) : undefined
    );
  }

  return null;
}
