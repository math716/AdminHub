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
  // Erro de tipo volta a barrar o build.
  //
  // Enquanto isso ficou ligado, seis arquivos acumularam erro e ninguém mais
  // olhava a lista. Dois deles eram defeito de execução, não chatice de tipo:
  // um `await` esquecido numa migração para função assíncrona (todo relatório
  // eleitoral do DF respondia 500) e um campo fora do `select` que fazia a
  // chave de de-duplicação virar "numero_undefined". Os dois estavam à vista
  // em `npx tsc --noEmit` desde o dia em que entraram.
  //
  // Com a lista zerada, é melhor o build parar aqui do que o defeito chegar ao
  // gabinete. Se algum dia travar uma publicação urgente, ligue de volta,
  // publique e resolva depois — mas não deixe ligado.
  typescript: {
    ignoreBuildErrors: false,
  },
  images: { unoptimized: true },
  experimental: {
    serverComponentsExternalPackages: ['@react-pdf/renderer'],
    // NUNCA declare './public/data/tse/**/*' aqui. São 211 MB: copiá-los para
    // dentro de uma função estoura o teto de 250 MB da Vercel — foi o que
    // manteve api/agent/relatorio em 250,9 MB. Esses arquivos agora são
    // BUSCADOS POR HTTP do próprio deploy (ver lib/tse-static.ts), como o
    // public/geojson sempre foi.
    // O índice nacional (1 MB) fica em public/data/tse-index/, fora da base do
    // TSE, e é pequeno o bastante para viajar junto da rota que o usa.
    outputFileTracingIncludes: {
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
