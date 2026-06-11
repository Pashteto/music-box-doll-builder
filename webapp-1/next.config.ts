import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Static export: the app has no server routes/SSR data, so it ships as plain
  // HTML/JS/CSS served by any static host (Caddy/nginx) — ideal for the small
  // oracle-2 box (no Node process needed).
  output: 'export',
  // Emit /editor/index.html etc. so static hosts resolve clean URLs without config.
  trailingSlash: true,
  // We use plain <img> (not next/image); disable the optimizer which needs a server.
  images: { unoptimized: true },
}

export default nextConfig
