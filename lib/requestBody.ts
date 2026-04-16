export const MAX_JSON_BODY_BYTES = 64 * 1024;

export class RequestBodyError extends Error {
  constructor(message: string, readonly status: 400 | 413 = 400) {
    super(message);
    this.name = 'RequestBodyError';
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readJsonBody<T>(req: Request, maxBytes = MAX_JSON_BODY_BYTES): Promise<T> {
  const contentLength = req.headers.get('content-length');
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      throw new RequestBodyError(`Request body too large (max ${maxBytes} bytes)`, 413);
    }
  }

  let text: string;
  try {
    text = await req.text();
  } catch {
    throw new RequestBodyError('Invalid request body');
  }

  if (!text) {
    throw new RequestBodyError('JSON body required');
  }

  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new RequestBodyError(`Request body too large (max ${maxBytes} bytes)`, 413);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new RequestBodyError('Malformed JSON body');
  }
}
