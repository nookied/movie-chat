/** @type {import('next').NextConfig} */
const nextConfig = {
  // instrumentation.ts is stable in Next.js 15 — no flag needed.
  // (In Next.js 14 this required experimental.instrumentationHook: true)
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'image.tmdb.org' },
    ],
  },
};

export default nextConfig;
