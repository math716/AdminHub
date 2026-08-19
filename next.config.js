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
    // Estes arquivos são lidos do DISCO em runtime (fs.readFileSync com caminho
    // montado em tempo de execução). O tracing do Next não consegue detectá-los
    // sozinho, então cada rota que os usa precisa declará-los — sem isso eles
    // ficam fora do bundle da função e somem só em produção (foi o que deixou o
    // relatório da Gabi sem bandeira do estado).
    outputFileTracingIncludes: {
      '/api/tse/zonas': ['./public/data/tse/**/*'],
      // Gabi: base eleitoral + índice nacional de nomes
      '/api/agent/chat': ['./public/data/tse/**/*'],
      // Relatórios em PDF: base eleitoral, bandeiras dos estados e malha das RAs
      '/api/agent/relatorio': [
        './public/data/tse/**/*',
        './public/flags/**/*',
        './public/geojson/df-regioes-administrativas.geojson',
      ],
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
