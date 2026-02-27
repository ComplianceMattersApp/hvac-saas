import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Compliance Matters',
    short_name: 'CM Software',
    description: 'ECC Rater Field Software',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f1f35',
    theme_color: '#0f1f35',
    icons: [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icon.png", sizes: "512x512", type: "image/png" },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  }
}