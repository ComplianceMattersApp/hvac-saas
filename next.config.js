const nextPWA = require("next-pwa")({
  dest: "public",
  sw: "sw.js",          // <-- force the filename
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = nextPWA(nextConfig);