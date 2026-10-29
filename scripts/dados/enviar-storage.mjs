// Envia a base do TSE e os mapas (public/data/tse, public/geojson) para o
// Storage do Supabase, no bucket público "dados", com a mesma estrutura de
// pastas — de onde o sistema passa a buscá-los (lib/dados-url.ts).
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=… \
//     node scripts/dados/enviar-storage.mjs [--pastas data/tse,geojson] [--verificar]
//
// --pastas      subpastas de public/ a enviar (padrão: data/tse,geojson). Para
//               uma atualização da base: --pastas data/tse/2026
// --verificar   não envia: confere, arquivo por arquivo, que o Storage serve
//               o mesmo tamanho que está no disco.
//
// Sem dependências: só fetch. Repete com espera crescente em 429/5xx.

import fs from 'fs';
import path from 'path';

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BUCKET = 'dados';
const arg = (nome) => { const i = process.argv.indexOf(nome); return i === -1 ? null : process.argv[i + 1]; };
const PASTAS = (arg('--pastas') ?? 'data/tse,geojson').split(',').map(s => s.trim()).filter(Boolean);
const VERIFICAR = process.argv.includes('--verificar');
const PUBLICO = path.join(process.cwd(), 'public');
const PARALELO = 12;

if (!SUPABASE_URL || !CHAVE) { console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
// O índice da Gabi é lido do disco do servidor e não sai do repositório.
if (PASTAS.some(p => p.startsWith('data/tse-index'))) { console.error('data/tse-index fica no repositório.'); process.exit(1); }

const auth = { Authorization: `Bearer ${CHAVE}`, apikey: CHAVE };
const espera = (ms) => new Promise(r => setTimeout(r, ms));

async function comRepeticao(fn, rotulo) {
  for (let t = 1; ; t++) {
    try {
      const r = await fn();
      if (r.ok || (r.status < 500 && r.status !== 429)) return r;
      if (t >= 6) return r;
    } catch (e) {
      if (t >= 6) throw new Error(`${rotulo}: ${e.message}`);
    }
    await espera(1000 * 2 ** t);
  }
}

function arquivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? arquivos(p) : [p];
  });
}

const tipo = (f) => f.endsWith('.gz') ? 'application/gzip'
  : f.endsWith('.json') || f.endsWith('.geojson') ? 'application/json' : 'application/octet-stream';
const chaveDe = (f) => path.relative(PUBLICO, f).split(path.sep).join('/');
const codificar = (k) => k.split('/').map(encodeURIComponent).join('/');

async function garantirBucket() {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, { headers: auth });
  if (r.ok) {
    const b = await r.json();
    if (!b.public) throw new Error(`O bucket "${BUCKET}" existe mas não é público.`);
    return;
  }
  const c = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  });
  if (!c.ok) throw new Error(`Não consegui criar o bucket: ${c.status} ${await c.text()}`);
  console.log(`bucket "${BUCKET}" criado (público).`);
}

async function enviar(f) {
  const k = chaveDe(f);
  const r = await comRepeticao(() => fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${codificar(k)}`, {
    method: 'POST',
    headers: { ...auth, 'content-type': tipo(f), 'cache-control': 'max-age=3600', 'x-upsert': 'true' },
    body: fs.readFileSync(f),
  }), k);
  if (!r.ok) throw new Error(`${k}: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

async function conferir(f) {
  const k = chaveDe(f);
  const r = await comRepeticao(() => fetch(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${codificar(k)}`, {
    method: 'HEAD',
    // Sem isto, a CDN entrega JSON comprimido (br) e não informa o tamanho:
    // os 981 mapas apareciam com "0 bytes" embora estivessem certos.
    headers: { 'accept-encoding': 'identity' },
  }), k);
  const tam = Number(r.headers.get('content-length'));
  return r.ok && tam === fs.statSync(f).size ? null : `${k}: ${r.status}, ${tam} bytes no Storage × ${fs.statSync(f).size} no disco`;
}

async function main() {
  const lista = PASTAS.flatMap(p => arquivos(path.join(PUBLICO, p)));
  const total = lista.reduce((s, f) => s + fs.statSync(f).size, 0);
  console.log(`${VERIFICAR ? 'conferindo' : 'enviando'} ${lista.length} arquivos (${(total / 1e6).toFixed(0)} MB) de ${PASTAS.join(', ')}`);
  if (!VERIFICAR) await garantirBucket();

  const problemas = [];
  let feitos = 0, i = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: PARALELO }, async () => {
    while (i < lista.length) {
      const f = lista[i++];
      try {
        if (VERIFICAR) { const p = await conferir(f); if (p) problemas.push(p); }
        else await enviar(f);
      } catch (e) { problemas.push(e.message); }
      if (++feitos % 2000 === 0) console.log(`  ${feitos}/${lista.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
  }));

  console.log(`${feitos} arquivos em ${Math.round((Date.now() - t0) / 1000)} s; problemas: ${problemas.length}`);
  for (const p of problemas.slice(0, 30)) console.log('  !', p);
  if (problemas.length) process.exit(1);
}

main().catch(e => { console.error(e.message); process.exit(1); });
