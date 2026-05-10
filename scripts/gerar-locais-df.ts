/**
 * Gera public/data/tse/locais/DF.json.gz
 * =========================================
 * 1. Lê o CSV de locais de votação do TSE para o DF
 *    (eleitorado_local_votacao_XXXX.zip ou arquivo CSV separado)
 * 2. Geocodifica endereços sem lat/lng usando Nominatim (OpenStreetMap)
 * 3. Gera o arquivo comprimido no formato esperado pelo sistema
 *
 * USO:
 *   npx tsx scripts/gerar-locais-df.ts
 *   npx tsx scripts/gerar-locais-df.ts --csv "C:\caminho\para\locais_DF.csv"
 *   npx tsx scripts/gerar-locais-df.ts --skip-geocode   (usa só o que já tem coord)
 *
 * FONTE DO CSV:
 *   https://dadosabertos.tse.jus.br/dataset/eleitorado-locais-de-votacao
 *   Baixe o ZIP, extraia e passe o CSV via --csv
 *   OU coloque o arquivo na pasta tse-downloads/ com nome contendo "DF" ou "local_votacao"
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
function getArg(flag: string, def = ''): string {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const SKIP_GEOCODE  = process.argv.includes('--skip-geocode');
const CSV_PATH_ARG  = getArg('--csv');
const OUTPUT_PATH   = path.join(process.cwd(), 'public', 'data', 'tse', 'locais', 'DF.json');
const CACHE_PATH    = path.join(process.cwd(), 'scripts', '.geocode-cache-df.json');
const GEOCODE_DELAY = 1100; // ms — Nominatim: máx 1 req/s

interface LocalJson {
  municipio: string;
  zona: number;
  codLocal: string;
  nome: string;
  endereco: string;
  bairro: string;
  lat: number | null;
  lng: number | null;
}

// ---------------------------------------------------------------------------
// Geocode cache
// ---------------------------------------------------------------------------
let geocodeCache: Record<string, { lat: number | null; lng: number | null }> = {};

function loadCache() {
  try {
    if (fs.existsSync(CACHE_PATH))
      geocodeCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch { /* ignore */ }
}

function saveCache() {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(geocodeCache, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Nominatim geocoding
// ---------------------------------------------------------------------------
async function geocodeAddress(endereco: string, bairro: string): Promise<{ lat: number | null; lng: number | null }> {
  const key = `${endereco}|${bairro}`;
  if (geocodeCache[key] !== undefined) return geocodeCache[key];

  // Montar query para Brasília/DF
  const query = [endereco, bairro, 'Brasília', 'DF', 'Brasil']
    .filter(Boolean).join(', ');

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AdminHub-TSE-Geocoder/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as any[];
    if (data.length > 0) {
      const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      geocodeCache[key] = result;
      return result;
    }
  } catch (e) {
    console.warn(`    [GEO FAIL] ${query}: ${(e as Error).message}`);
  }

  geocodeCache[key] = { lat: null, lng: null };
  return { lat: null, lng: null };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------
function normText(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`´]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseCoord(v: string): number | null {
  if (!v?.trim() || v === '#NULO#' || v === '#NULO') return null;
  const n = parseFloat(v.replace(',', '.'));
  return isNaN(n) ? null : n;
}

function splitLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '', inQ = false;
  for (const c of line) {
    if (c === '"') inQ = !inQ;
    else if (c === ';' && !inQ) { cols.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  cols.push(cur.trim());
  return cols;
}

function parseCsv(buf: Buffer): LocalJson[] {
  const text = buf.toString('latin1');
  const lines = text.split(/\r?\n/);
  let headers: string[] = [];
  const locais: LocalJson[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const cols = splitLine(line);

    if (headers.length === 0) {
      if (cols.some(c => c.startsWith('NM_') || c.startsWith('SG_') || c.startsWith('NR_') || c.startsWith('DS_'))) {
        headers = cols;
      }
      continue;
    }

    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (cols[i] ?? '').trim(); });

    const uf = (row['SG_UF'] || '').toUpperCase();
    if (uf && uf !== 'DF') continue; // ignorar outras UFs se vier junto

    locais.push({
      municipio: normText(row['NM_MUNICIPIO'] || row['NM_UE'] || 'BRASILIA'),
      zona:      parseInt(row['NR_ZONA'] || '0', 10),
      codLocal:  row['NR_LOCAL_VOTACAO'] || row['CD_LOCAL'] || row['NR_LOCAL'] || '',
      nome:      row['NM_LOCAL_VOTACAO'] || row['NM_LOCAL'] || '',
      endereco:  row['DS_ENDERECO'] || '',
      bairro:    normText(row['NM_BAIRRO'] || ''),
      lat:       parseCoord(row['NR_LATITUDE'] || row['LATITUDE'] || row['LAT'] || ''),
      lng:       parseCoord(row['NR_LONGITUDE'] || row['LONGITUDE'] || row['LNG'] || row['LON'] || ''),
    });
  }

  return locais;
}

// ---------------------------------------------------------------------------
// Localizar CSV
// ---------------------------------------------------------------------------
function findCsvBuffer(): { buf: Buffer; source: string } | null {
  // 1. Argumento explícito
  if (CSV_PATH_ARG && fs.existsSync(CSV_PATH_ARG)) {
    return { buf: fs.readFileSync(CSV_PATH_ARG), source: CSV_PATH_ARG };
  }

  // 2. Procurar em tse-downloads/
  const downloadsDir = path.join(process.cwd(), 'tse-downloads');
  if (fs.existsSync(downloadsDir)) {
    const files = fs.readdirSync(downloadsDir);

    // CSV direto
    const csvFile = files.find(f =>
      f.toLowerCase().endsWith('.csv') &&
      (f.toLowerCase().includes('df') || f.toLowerCase().includes('local_votacao') || f.toLowerCase().includes('locais'))
    );
    if (csvFile) {
      const p = path.join(downloadsDir, csvFile);
      return { buf: fs.readFileSync(p), source: p };
    }

    // Dentro de ZIP
    const zipFile = files.find(f =>
      f.toLowerCase().endsWith('.zip') &&
      (f.toLowerCase().includes('local_votacao') || f.toLowerCase().includes('locais'))
    );
    if (zipFile) {
      const buf = fs.readFileSync(path.join(downloadsDir, zipFile));
      const csv = extractCsvFromZip(buf);
      if (csv) return { buf: csv, source: zipFile };
    }
  }

  return null;
}

function extractCsvFromZip(buf: Buffer): Buffer | null {
  let off = 0;
  while (off < buf.length - 4) {
    if (buf[off] === 0x50 && buf[off+1] === 0x4b && buf[off+2] === 0x03 && buf[off+3] === 0x04) {
      const comp  = buf.readUInt16LE(off + 8);
      const cSize = buf.readUInt32LE(off + 18);
      const fnLen = buf.readUInt16LE(off + 26);
      const exLen = buf.readUInt16LE(off + 28);
      const fn    = buf.subarray(off + 30, off + 30 + fnLen).toString('utf8');
      const dStart = off + 30 + fnLen + exLen;
      const cData  = buf.subarray(dStart, dStart + cSize);

      if (fn.toLowerCase().endsWith('.csv')) {
        try {
          const data = comp === 0 ? cData : (zlib.inflateRawSync(cData as any) as Buffer);
          return data;
        } catch { /* try next */ }
      }
      off = dStart + cSize;
    } else off++;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=======================================================');
  console.log('  Gerador de locais de votação do DF');
  console.log('=======================================================\n');

  loadCache();

  const found = findCsvBuffer();
  if (!found) {
    console.error('CSV não encontrado!\n');
    console.log('Baixe o arquivo em:');
    console.log('  https://dadosabertos.tse.jus.br/dataset/eleitorado-locais-de-votacao\n');
    console.log('Opções:');
    console.log('  1. Coloque o ZIP/CSV em tse-downloads/');
    console.log('  2. Use: npx tsx scripts/gerar-locais-df.ts --csv "caminho/para/arquivo.csv"');
    process.exit(1);
  }

  console.log(`CSV encontrado: ${found.source}`);
  const locais = parseCsv(found.buf);
  console.log(`Locais parseados: ${locais.length}`);

  if (locais.length === 0) {
    console.error('\nNenhum local do DF encontrado no CSV.');
    console.log('Verifique se o CSV tem coluna SG_UF=DF ou é específico do DF.');
    process.exit(1);
  }

  // Estatísticas
  const comCoord  = locais.filter(l => l.lat && l.lng).length;
  const semCoord  = locais.filter(l => !l.lat || !l.lng).length;
  console.log(`  Com coordenadas: ${comCoord}`);
  console.log(`  Sem coordenadas: ${semCoord}`);

  // Geocodificar entradas sem coordenadas
  if (!SKIP_GEOCODE && semCoord > 0) {
    console.log(`\nGeocodificando ${semCoord} locais via Nominatim...`);
    console.log('(~1 req/s — pode demorar alguns minutos)\n');

    let done = 0;
    for (const local of locais) {
      if (local.lat && local.lng) continue;
      const { lat, lng } = await geocodeAddress(local.endereco, local.bairro);
      local.lat = lat;
      local.lng = lng;
      done++;
      if (done % 10 === 0) {
        saveCache();
        const pct = ((done / semCoord) * 100).toFixed(0);
        console.log(`  ${done}/${semCoord} (${pct}%) — último: ${local.nome}`);
      }
      await sleep(GEOCODE_DELAY);
    }
    saveCache();
    console.log(`\nGeocodificação concluída.`);
  }

  // Resultado final
  const comCoordFinal = locais.filter(l => l.lat && l.lng).length;
  console.log(`\nLocais com coordenadas: ${comCoordFinal}/${locais.length} (${((comCoordFinal/locais.length)*100).toFixed(1)}%)`);

  // Salvar
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const json = JSON.stringify(locais);
  const gz   = zlib.gzipSync(Buffer.from(json, 'utf8') as any, { level: 9 });
  fs.writeFileSync(OUTPUT_PATH + '.gz', gz as any);
  console.log(`\n✓ Salvo: public/data/tse/locais/DF.json.gz (${(gz.length / 1024).toFixed(0)} KB)`);
  console.log('\nPróximo passo:');
  console.log('  git add public/data/tse/locais/DF.json.gz');
  console.log('  git commit -m "dados: locais de votação do DF geocodificados"');
  console.log('  git push origin main');
}

main().catch(e => { console.error(e); process.exit(1); });
