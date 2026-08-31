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
      // blob: é necessário para o three.js carregar as texturas embutidas do
      // GLB da Gabi (ImageBitmapLoader usa fetch em blob: URLs)
      "connect-src 'self' blob: ws: wss: https://nominatim.openstreetmap.org https://*.nominatim.openstreetmap.org https://servicodados.ibge.gov.br https://*.servicodados.ibge.gov.br https://*.basemaps.cartocdn.com https://overpass-api.de https://models.readyplayer.me https://*.readyplayer.me",
      "worker-src blob:",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig = {
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: { unoptimized: true },
  experimental: {
    serverComponentsExternalPackages: ['@react-pdf/renderer'],
    // NÃO declare './public/data/tse/**/*' aqui para as rotas do agente: são
    // 230 MB, e copiá-los para dentro da função estoura o limite de 250 MB da
    // Vercel (api/agent/chat foi a 263 MB e o build falhou). Esses arquivos já
    // chegam à função pelo diretório public/ do deploy — o include só duplica.
    // O índice nacional vive em public/data/tse-index/ (fora da base do TSE)
    // justamente para NÃO ser arrastado ao bundle do relatório, que não o usa.
    // Aqui ele é garantido na rota que o consome — 1 MB, seguro.
    outputFileTracingIncludes: {
      '/api/tse/zonas': ['./public/data/tse/**/*'],
      '/api/agent/chat': ['./public/data/tse-index/**/*'],
    },
  },
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
