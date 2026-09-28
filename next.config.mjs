/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Limit parallelism so the production build stays within the memory budget
  // of small CI machines (e.g. Vercel's 2-core builders). Prevents worker
  // crashes during the "Collecting page data" / prerender phase.
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
};

export default nextConfig;
