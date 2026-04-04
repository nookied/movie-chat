export type ServiceStatus = 'idle' | 'checking' | 'ok' | 'error';

export default function StatusIcon({ status }: { status: ServiceStatus }) {
  if (status === 'checking') {
    return <span className="w-2 h-2 rounded-full bg-gray-500 animate-pulse block" />;
  }
  if (status === 'ok') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-green-500">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5l-4.5-4.5 1.41-1.41L10 13.67l7.09-7.09 1.41 1.41L10 16.5z" />
      </svg>
    );
  }
  if (status === 'error') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-red-500">
        <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" />
      </svg>
    );
  }
  return <span className="w-4 h-4 block" />;
}
