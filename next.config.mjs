/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output — produces a self-contained server in .next/standalone/
  // that doesn't need node_modules at runtime. Useful for pm2 deployments.
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'image.tmdb.org' },
    ],
  },
};

export default nextConfig;
