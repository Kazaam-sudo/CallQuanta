/** @type {import("next").NextConfig} */
const INTERNAL_API_URL = process.env.API_INTERNAL_BASE_URL || process.env.INTERNAL_API_URL || "http://api:8000";

const nextConfig = {
  env: {
    NEXT_PUBLIC_PUBLIC_APP_URL: process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_PUBLIC_APP_URL || "",
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${INTERNAL_API_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
