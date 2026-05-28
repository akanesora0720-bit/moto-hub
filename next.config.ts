import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF API routes read logo from lib/assets on Vercel (public/ is not always on disk).
  outputFileTracingIncludes: {
    "/api/invoices/**/*": ["./lib/assets/**/*", "./public/logo.jpg"],
    "/api/transaction-records/**/*": ["./lib/assets/**/*", "./public/logo.jpg"],
  },
};

export default nextConfig;
