import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prefer admin/ as Turbopack root when both repo-root and admin lockfiles exist.
  turbopack: {
    root: process.cwd(),
  },
  allowedDevOrigins: ['192.168.31.94', '192.168.1.8'],
  async redirects() {
    return [
      { source: '/superadmin/:path*', destination: '/dashboard', permanent: true },
      { source: '/dashboard/growth', destination: '/dashboard/analytics', permanent: true },
      { source: '/dashboard/city-analytics', destination: '/dashboard/analytics', permanent: true },
      { source: '/dashboard/revenue', destination: '/dashboard/monetization/revenue', permanent: true },
      { source: '/dashboard/leaderboard', destination: '/dashboard', permanent: true },
      { source: '/dashboard/place-images', destination: '/dashboard/moderation', permanent: true },
      { source: '/dashboard/moderate', destination: '/dashboard/moderation', permanent: true },
      { source: '/dashboard/monetization/pal-points-partner', destination: '/dashboard/palpoints', permanent: true },
    ];
  },
};

export default nextConfig;
