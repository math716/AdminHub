/**
 * Divide os arquivos {UF}_bairros_CD2022.json por município,
 * gerando public/geojson/municipios/{UF}/{NM_MUN_NORM}.json
 *
 * Executar: node scripts/split-bairros-geojson.mjs
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const GEOJSON_DIR = path.join(ROOT, 'public', 'geojson');
const OUT_DIR = path.join(GEOJSON_DIR, 'municipios');

function norm(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '_')
    .replace(/\s+/g, '_')
    .trim();
}

// UFs com arquivo _bairros_CD2022.json disponível
const UFS = [
  'AC','AL','AM','AP','BA','CE','ES','GO','MA','MG',
  'MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO',
  'RR','RS','SC','SE','SP',
];

let totalFiles = 0;
let totalUfs = 0;

for (const uf of UFS) {
  const srcPath = path.join(GEOJSON_DIR, `${uf}_bairros_CD2022.json`);
  if (!existsSync(srcPath)) {
    console.log(`  [skip] ${uf} — arquivo não encontrado`);
    continue;
  }

  process.stdout.write(`Processando ${uf}... `);
  const raw = await readFile(srcPath, 'utf-8');
  const geojson = JSON.parse(raw);

  // Agrupar features por município
  const byMun = new Map();
  for (const f of (geojson.features ?? [])) {
    const nmMun = norm(f.properties?.NM_MUN ?? 'DESCONHECIDO');
    if (!byMun.has(nmMun)) byMun.set(nmMun, []);
    byMun.get(nmMun).push(f);
  }

  // Criar diretório de saída para a UF
  const ufDir = path.join(OUT_DIR, uf);
  await mkdir(ufDir, { recursive: true });

  // Escrever um arquivo por município
  let count = 0;
  for (const [nmMun, features] of byMun) {
    const outPath = path.join(ufDir, `${nmMun}.json`);
    const fc = JSON.stringify({ type: 'FeatureCollection', features });
    await writeFile(outPath, fc, 'utf-8');
    count++;
  }

  console.log(`${count} municípios`);
  totalFiles += count;
  totalUfs++;
}

console.log(`\nConcluído: ${totalFiles} arquivos em ${totalUfs} UFs → public/geojson/municipios/`);
