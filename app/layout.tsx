import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Movie Chat — Plex Assistant',
  description: 'AI-powered movie recommendations with Plex integration',
};

// viewport-fit=cover is required for env(safe-area-inset-*) to work on iPhone
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-plex-bg text-gray-200 antialiased">
        {children}
      </body>
    </html>
  );
}
