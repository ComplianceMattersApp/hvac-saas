/** @type {import('next').NextConfig} */
const nextConfig = {
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