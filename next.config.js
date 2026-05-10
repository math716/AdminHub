/** @type {import('next').NextConfig} */

const isProd = process.env.NODE_ENV === 'production';

// 'unsafe-eval' é necessário para o webpack em dev; em produção o bundle compilado não precisa
const scriptSrc = isProd
  ? "script-src 'self' 'unsafe-inline' https://unpkg.com https://apps.abacus.ai"
  : "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://unpkg.com https://apps.abacus.ai";

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',   value: 'on' },
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  { key: 'X-Frame-Options',          value: 'SAMEORIGIN' },
  { key: 'X-XSS-Protection',         value: '1; mode=block' },
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline' https://unpkg.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss: https://nominatim.openstreetmap.org https://*.nominatim.openstreetmap.org https://servicodados.ibge.gov.br https://*.servicodados.ibge.gov.br https://*.basemaps.cartocdn.com https://overpass-api.de",
      "worker-src blob:",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
