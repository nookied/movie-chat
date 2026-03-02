import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Movie Chat — Plex Assistant',
  description: 'AI-powered movie recommendations with Plex integration',
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
