// crypto.randomUUID() is only available in secure contexts (HTTPS / localhost).
// When accessed over plain HTTP via a local IP (e.g. from a phone), it's undefined.
// This helper falls back to a Math.random-based v4 UUID in that case.
export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
