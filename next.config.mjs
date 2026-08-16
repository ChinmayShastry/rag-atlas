/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // The API routes read public/corpus/*.txt at runtime to verify that
    // submitted passages really came from our documents. Next cannot infer
    // that from a path built at runtime, so include the files explicitly or
    // they will be missing from the serverless bundle on Vercel.
    outputFileTracingIncludes: {
      "/api/**/*": ["./public/corpus/**"],
    },
  },
};

export default nextConfig;
