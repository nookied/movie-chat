/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Required in Next.js 14 to enable the instrumentation.ts hook,
    // which starts the background auto-move poller at server startup.
    instrumentationHook: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'image.tmdb.org' },
    ],
  },
};

export default nextConfig;
