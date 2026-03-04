import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Movie Chat',
    short_name: 'Movie Chat',
    description: 'AI-powered movie recommendations with Plex integration',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1a1a1a',
    theme_color: '#1a1a1a',
    icons: [
      {
        src: '/icon.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
