import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Movie Chat — Plex Assistant',
  description: 'AI-powered movie recommendations with Plex integration',
  // iOS "Add to Home Screen" — makes it launch as a full-screen app, not a browser tab
  appleWebApp: {
    capable: true,
    title: 'Movie Chat',
    // black-translucent: status bar overlay is transparent; app content extends behind it.
    // The header in page.tsx uses env(safe-area-inset-top) to push content below the bar.
    statusBarStyle: 'black-translucent',
  },
};

// viewport-fit=cover is required for env(safe-area-inset-*) to work on iPhone.
// themeColor tints the browser chrome on Android / Chrome for iOS.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1a1a1a',
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
