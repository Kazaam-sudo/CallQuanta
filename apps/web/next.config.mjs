/** @type {import("next").NextConfig} */
const INTERNAL_API_URL = process.env.INTERNAL_API_URL || "http://api:8000";

const nextConfig = {
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
