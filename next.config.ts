import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/legal/terms", destination: "/terms", permanent: true },
      { source: "/legal/privacy", destination: "/privacy", permanent: true },
      { source: "/legal/fees", destination: "/pricing", permanent: true },
      { source: "/legal/terms-updated", destination: "/terms/updated", permanent: false },
      { source: "/legal/privacy_policy.pdf", destination: "/privacy", permanent: true },
    ];
  },
  // PDF API routes read logo from lib/assets on Vercel (public/ is not always on disk).
  outputFileTracingIncludes: {
    "/api/invoices/**/*": ["./lib/assets/**/*", "./public/logo.jpg"],
    "/api/transaction-records/**/*": ["./lib/assets/**/*", "./public/logo.jpg"],
  },
};

export default nextConfig;
