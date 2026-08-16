/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    // Keep dependency resolution inside this app when a parent directory also
    // contains a lockfile (common in local multi-project workspaces).
    root: __dirname,
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // Supabase Storage — business logos and uploaded photos.
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  async redirects() {
    return [
      // Redirect legacy Vercel app URL to canonical production domain.
      // This catches any user-facing links that still reference the old hostname.
      // Preserves path and query string. Does not affect localhost or preview deployments.
      {
        source: "/:path*",
        has: [{ type: "host", value: "hvac-saas-xi.vercel.app" }],
        destination: "https://app.compliancemattersca.com/:path*",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
