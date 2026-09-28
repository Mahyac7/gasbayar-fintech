/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Reduce the work Next.js does tracing server files for the output bundle.
  // The default tracing step ("Collecting build traces") can be heavy on small
  // CI machines; our lib/ deps are tiny, so we don't need aggressive tracing.
  outputFileTracingIncludes: {},
};

export default nextConfig;
