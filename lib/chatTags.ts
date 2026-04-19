import { Recommendation } from '@/types';

export interface DownloadAction {
  title: string;
  year?: number;
}

const CHAT_TAGS = ['recommendation', 'download'] as const;

function parseOptionalYear(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const year = Number(value);
  return Number.isFinite(year) ? year : undefined;
}

function extractTagPayloads(text: string, tagName: typeof CHAT_TAGS[number]): string[] {
  const payloads: string[] = [];
  let match: RegExpExecArray | null;

  const canonical = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'g');
  while ((match = canonical.exec(text)) !== null) payloads.push(match[1]);

  const malformed = new RegExp(`<${tagName}(\\{[\\s\\S]*?\\})>`, 'g');
  while ((match = malformed.exec(text)) !== null) payloads.push(match[1]);

  return payloads;
}

export function extractRecommendations(text: string): Recommendation[] {
  const results: Recommendation[] = [];
  const seen = new Set<string>();

  for (const payload of extractTagPayloads(text, 'recommendation')) {
    try {
      const parsed = JSON.parse(payload);
      if (!parsed.title) continue;

      const title = String(parsed.title);
      const year = parseOptionalYear(parsed.year);
      const key = `${title}-${year ?? 'unknown'}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        title,
        year,
        type: parsed.type === 'tv' ? 'tv' : 'movie',
        ...(parsed.strictYear === true ? { strictYear: true } : {}),
      });
    } catch { /* skip malformed */ }
  }

  return results;
}

export function extractDownloadActions(text: string): DownloadAction[] {
  const results: DownloadAction[] = [];
  const seen = new Set<string>();

  for (const payload of extractTagPayloads(text, 'download')) {
    try {
      const parsed = JSON.parse(payload);
      if (!parsed.title) continue;

      const title = String(parsed.title);
      const year = parseOptionalYear(parsed.year);
      const key = `${title}-${year ?? 'unknown'}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({ title, year });
    } catch { /* skip malformed */ }
  }

  return results;
}

export function stripChatActionTags(content: string): string {
  return content
    .replace(/<recommendation>[\s\S]*?<\/recommendation>/g, '')
    .replace(/<download>[\s\S]*?<\/download>/g, '')
    // Lazy `[\s\S]*?` (not `[^>]*`) so payloads like {"title":"Foo -> Bar"}
    // containing `>` inside the JSON don't break the match.
    .replace(/<recommendation\s*\{[\s\S]*?\}>/g, '')
    .replace(/<download\s*\{[\s\S]*?\}>/g, '')
    .replace(/<\/?recommendation>/g, '')
    .replace(/<\/?download>/g, '')
    .replace(/<(recommendation|download)[^>]*$/g, '')
    .trim();
}

export function recommendationTag(rec: Recommendation): string {
  const payload = {
    title: rec.title,
    ...(rec.year !== undefined ? { year: rec.year } : {}),
    type: rec.type,
    ...(rec.strictYear ? { strictYear: true } : {}),
  };
  return `<recommendation>${JSON.stringify(payload)}</recommendation>`;
}
