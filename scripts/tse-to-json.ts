/**
 * TSE → JSON Estático (streaming — sem acumular linhas em memória)
 * ================================================================
 * USO:
 *   npx tsx scripts/tse-to-json.ts --dir "C:\caminho\para\tse-downloads"
 *
 * Estrutura esperada na pasta:
 *   votacao_candidato_munzona_2018\
 *   votacao_candidato_munzona_2020\
 *   votacao_candidato_munzona_2022\
 *   votacao_candidato_munzona_2024\
 *   eleitorado_local_votacao_2024\  (ou .zip)
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ANOS = [2018, 2020, 2022, 2024];
const UFS  = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
               'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
               'RS','RO','RR','SC','SP','SE','TO'];

function getArg(flag: string, def = ''): string {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const INPUT_DIR  = path.resolve(getArg('--dir', './tse-downloads'));
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'data', 'tse');

// ---------------------------------------------------------------------------
// ZIP parser
// ---------------------------------------------------------------------------
interface ZipEntry { filename: string; data: Buffer; }

function parseZip(buf: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let off = 0;
  while (off < buf.length - 4) {
    if (buf[off]===0x50&&buf[off+1]===0x4b&&buf[off+2]===0x03&&buf[off+3]===0x04) {
      const comp=buf.readUInt16LE(off+8), cSize=buf.readUInt32LE(off+18);
      const fnLen=buf.readUInt16LE(off+26), exLen=buf.readUInt16LE(off+28);
      const fnStart=off+30;
      const fn=buf.subarray(fnStart,fnStart+fnLen).toString('utf8');
      const dStart=fnStart+fnLen+exLen;
      const cData=buf.subarray(dStart,dStart+cSize);
      let data: Buffer;
      if(comp===0) data=cData;
      else if(comp===8) data=zlib.inflateRawSync(cData as any) as Buffer;
      else { off=dStart+cSize; continue; }
      entries.push({filename:fn,data});
      off=dStart+cSize;
    } else off++;
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ensureDir(d: string) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function writeJson(filePath: string, data: unknown) {
  ensureDir(path.dirname(filePath));
  const gzPath = filePath + '.gz';
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(data), 'utf8') as any, { level: 9 });
  fs.writeFileSync(gzPath, gz as any);
  const kb = (gz.length / 1024).toFixed(0);
  console.log(`  ✓ ${path.relative(process.cwd(), gzPath)} (${kb} KB)`);
}

function normText(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[''`´]/g,' ').replace(/\s+/g,' ').trim();
}

function parseCoord(v: string): number | null {
  if (!v?.trim()) return null;
  const n = parseFloat(v.replace(',','.'));
  return isNaN(n) ? null : n;
}

function parseVotos(row: Record<string, string>): number {
  const raw = row['QT_VOTOS_NOMINAIS_VALIDOS']
           ?? row['QT_VOTOS_VALIDOS']
           ?? row['QT_VOTOS_NOMINAIS']
           ?? row['QT_VOTOS']
           ?? '0';
  if (!raw || raw === '#NULO#' || raw === '#NULO') return 0;
  const v = parseInt(raw.replace(/\./g,''), 10);
  return isNaN(v) || v < 0 ? 0 : v;
}

function getTurno(row: Record<string, string>): string {
  return (row['NR_TURNO'] ?? row['CD_TURNO'] ?? '1').replace(/^0+/, '') || '1';
}

function splitLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ';' && !inQ) { cols.push(cur.trim()); cur = ''; }
    else { cur += c; }
  }
  cols.push(cur.trim());
  return cols;
}

// ---------------------------------------------------------------------------
// CSV streaming — processa linha a linha via callback, nunca acumula em array
// ---------------------------------------------------------------------------
function streamCsv(buf: Buffer, onRow: (row: Record<string, string>, headers: string[]) => void): { headers: string[]; rowCount: number } {
  const CHUNK = 32 * 1024 * 1024; // 32 MB
  let headers: string[] = [];
  let leftover = '';
  let rowCount = 0;

  const processLine = (raw: string) => {
    const line = raw.replace(/\r$/, '');
    if (!line) return;

    const cols = splitLine(line);

    if (headers.length === 0) {
      if (cols.some(c => c.startsWith('NM_') || c.startsWith('SG_') || c.startsWith('QT_') || c.startsWith('NR_') || c.startsWith('DS_'))) {
        headers = cols;
      }
      return;
    }

    if (cols.length < 5) return;
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (cols[i] ?? '').trim(); });
    rowCount++;
    onRow(row, headers);
  };

  for (let pos = 0; pos < buf.length; pos += CHUNK) {
    const end  = Math.min(pos + CHUNK, buf.length);
    const text = leftover + buf.subarray(pos, end).toString('latin1');
    const lines = text.split('\n');
    leftover = lines.pop() ?? '';
    for (const raw of lines) processLine(raw);
  }

  if (leftover.trim()) processLine(leftover);

  return { headers, rowCount };
}

// ---------------------------------------------------------------------------
// Localizar buffer do CSV
// ---------------------------------------------------------------------------
function findCsvBuffer(tipo: 'votos', ano: number, uf: string): Buffer | null;
function findCsvBuffer(tipo: 'locais', ano: number): Buffer | null;
function findCsvBuffer(tipo: 'votos'|'locais', ano: number, uf?: string): Buffer | null {
  if (tipo === 'votos' && uf) {
    const subfolders = [
      path.join(INPUT_DIR, `votacao_candidato_munzona_${ano}`),
      path.join(INPUT_DIR, String(ano)),
      INPUT_DIR,
    ];
    for (const dir of subfolders) {
      if (!fs.existsSync(dir)) continue;
      const zipFile = path.join(dir, `votacao_candidato_munzona_${ano}.zip`);
      if (fs.existsSync(zipFile)) {
        const entries = parseZip(fs.readFileSync(zipFile));
        const e = entries.find(x => x.filename.toLowerCase().includes(`_${uf.toLowerCase()}.csv`))
               ?? entries.find(x => x.filename.toLowerCase().endsWith('.csv'));
        if (e) { console.log(`  ZIP: ${path.basename(zipFile)} → ${e.filename}`); return e.data; }
      }
      const files = fs.readdirSync(dir).filter(f =>
        f.toLowerCase().endsWith('.csv') &&
        f.toLowerCase().includes(String(ano)) &&
        f.toLowerCase().includes(`_${uf.toLowerCase()}.`)
      );
      if (files.length > 0) {
        const p = path.join(dir, files[0]);
        console.log(`  CSV: ${files[0]}`);
        return fs.readFileSync(p);
      }
    }
    return null;
  }

  if (tipo === 'locais') {
    const anosLocais = [2024, 2022, 2020, 2018];
    const nomePadroes = [
      (a: number) => `eleitorado_local_votacao_${a}`,
      (a: number) => `eleitorado_locais_votacao_${a}`,
      (a: number) => `perfil_eleitorado_local_votacao_${a}`,
    ];
    const csvPadroes = [
      (a: number) => `eleitorado_local_votacao_${a}.csv`,
      (a: number) => `eleitorado_locais_votacao_${a}.csv`,
      (a: number) => `perfil_eleitorado_local_votacao_${a}.csv`,
      (a: number) => `perfil_eleitorado_${a}.csv`,
    ];

    for (const a of anosLocais) {
      for (const np of nomePadroes) {
        const zp = path.join(INPUT_DIR, `${np(a)}.zip`);
        if (fs.existsSync(zp)) {
          const entries = parseZip(fs.readFileSync(zp));
          const e = entries.find(x => x.filename.toLowerCase().endsWith('.csv'));
          if (e) { console.log(`  ZIP locais: ${path.basename(zp)} → ${e.filename}`); return e.data; }
        }
      }
      for (const np of nomePadroes) {
        const dir = path.join(INPUT_DIR, np(a));
        if (!fs.existsSync(dir)) continue;
        for (const cp of csvPadroes) {
          const p = path.join(dir, cp(a));
          if (fs.existsSync(p)) { console.log(`  CSV locais: ${path.basename(p)}`); return fs.readFileSync(p); }
        }
        const any = fs.readdirSync(dir).find(f => f.toLowerCase().endsWith('.csv'));
        if (any) { const p = path.join(dir, any); console.log(`  CSV locais (auto): ${any}`); return fs.readFileSync(p); }
      }
      for (const cp of csvPadroes) {
        const p = path.join(INPUT_DIR, cp(a));
        if (fs.existsSync(p)) { console.log(`  CSV locais: ${path.basename(p)}`); return fs.readFileSync(p); }
      }
    }
    return null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Interfaces de saída
// ---------------------------------------------------------------------------
interface CandAcc {
  first: Record<string, string>;
  totalVotos: number;
  votosMap: Record<string, number>;
  zonas: Array<{ municipio: string; zona: number; votos: number }>;
}
interface CandidatoJson {
  id: string; nome: string; nomeUrna: string; numero: number | null;
  partido: string; cargo: string; situacao: string; totalVotos: number;
  votos: Record<string, number>;
  zonas: Array<{ municipio: string; zona: number; votos: number }>;
}
interface LocalJson {
  municipio: string; zona: number; codLocal: string;
  nome: string; endereco: string; bairro: string;
  lat: number | null; lng: number | null;
}

// ---------------------------------------------------------------------------
// Processar votos por UF/ano — streaming, sem acumular linhas brutas
// ---------------------------------------------------------------------------
function processUfAno(uf: string, ano: number): boolean {
  const outPath = path.join(OUTPUT_DIR, String(ano), `${uf}.json`);
  if (fs.existsSync(outPath + '.gz') || fs.existsSync(outPath)) { console.log(`  [SKIP] ${uf} ${ano} — já gerado`); return true; }

  const buf = findCsvBuffer('votos', ano, uf);
  if (!buf) { console.log(`  [SKIP] ${uf} ${ano} — CSV não encontrado`); return false; }

  // Primeira passagem: agregar com filtro turno=1 + UF
  const byCand = new Map<string, CandAcc>();
  let sampleRow: Record<string, string> | null = null;
  let totalRows = 0;

  const { headers } = streamCsv(buf, (row) => {
    totalRows++;
    if (!sampleRow) sampleRow = row;

    const turno = getTurno(row);
    const rowUf  = row['SG_UF'] ?? '';

    // Filtro principal: turno 1 do estado
    if (turno !== '1') return;
    if (rowUf && rowUf !== uf) return;

    const sq  = row['SQ_CANDIDATO'] || row['NR_CPF_CANDIDATO'] || `${row['NM_URNA_CANDIDATO']}|${row['DS_CARGO']}|${row['SG_PARTIDO']}`;
    const v   = parseVotos(row);
    const mun = normText(row['NM_MUNICIPIO'] || row['NM_UE'] || '');
    const zona = parseInt(row['NR_ZONA'] || '0', 10);

    if (!byCand.has(sq)) byCand.set(sq, { first: row, totalVotos: 0, votosMap: {}, zonas: [] });
    const acc = byCand.get(sq)!;
    acc.totalVotos += v;
    if (mun) acc.votosMap[mun] = (acc.votosMap[mun] ?? 0) + v;
    if (zona && mun) acc.zonas.push({ municipio: mun, zona, votos: v });
  });

  // Se nenhum candidato — tentar sem filtro de UF (arquivo pode ter coluna diferente)
  if (byCand.size === 0 && totalRows > 0) {
    console.log(`  [RETRY] ${uf} ${ano} — sem filtro UF (total linhas: ${totalRows})`);
    streamCsv(buf, (row) => {
      if (getTurno(row) !== '1') return;
      const sq  = row['SQ_CANDIDATO'] || row['NR_CPF_CANDIDATO'] || `${row['NM_URNA_CANDIDATO']}|${row['DS_CARGO']}|${row['SG_PARTIDO']}`;
      const v   = parseVotos(row);
      const mun = normText(row['NM_MUNICIPIO'] || row['NM_UE'] || '');
      const zona = parseInt(row['NR_ZONA'] || '0', 10);
      if (!byCand.has(sq)) byCand.set(sq, { first: row, totalVotos: 0, votosMap: {}, zonas: [] });
      const acc = byCand.get(sq)!;
      acc.totalVotos += v;
      if (mun) acc.votosMap[mun] = (acc.votosMap[mun] ?? 0) + v;
      if (zona && mun) acc.zonas.push({ municipio: mun, zona, votos: v });
    });
  }

  if (byCand.size === 0) {
    if (sampleRow) {
      const qtCols = headers.filter(k => k.startsWith('QT'));
      console.log(`  [WARN] ${uf} ${ano} — 0 candidatos. Colunas QT: ${qtCols.join(',') || 'nenhuma'}. Amostra UF=${sampleRow['SG_UF']} turno=${getTurno(sampleRow)}`);
    } else {
      console.log(`  [WARN] ${uf} ${ano} — CSV vazio`);
    }
    return false;
  }

  const candidatos: CandidatoJson[] = [];
  for (const [sq, acc] of byCand) {
    if (acc.totalVotos === 0) continue;
    const f = acc.first;
    candidatos.push({
      id: `${uf}-${ano}-${sq}`,
      nome: f['NM_CANDIDATO'] || f['NM_URNA_CANDIDATO'] || '',
      nomeUrna: f['NM_URNA_CANDIDATO'] || f['NM_CANDIDATO'] || '',
      numero: parseInt(f['NR_CANDIDATO'] || '0', 10) || null,
      partido: f['SG_PARTIDO'] || f['NM_PARTIDO'] || '',
      cargo: f['DS_CARGO'] || f['DS_CARGO_PLEITO'] || '',
      situacao: f['DS_SIT_TOT_TURNO'] || f['DS_SITUACAO_CANDIDATURA'] || '',
      totalVotos: acc.totalVotos,
      votos: acc.votosMap,
      zonas: acc.zonas,
    });
  }

  if (candidatos.length === 0) {
    console.log(`  [WARN] ${uf} ${ano} — todos candidatos com 0 votos`);
    return false;
  }

  writeJson(outPath, candidatos);
  console.log(`  → ${uf} ${ano}: ${candidatos.length} candidatos`);
  return true;
}

// ---------------------------------------------------------------------------
// Processar locais de votação — streaming
// ---------------------------------------------------------------------------
function processLocais() {
  console.log('\n--- Locais de votação ---');
  const buf = findCsvBuffer('locais', 0);
  if (!buf) {
    console.warn('  [AVISO] Nenhum arquivo de locais encontrado.');
    console.warn('  Baixe: eleitorado_local_votacao_2024.zip no Portal TSE');
    return;
  }

  const byUf = new Map<string, LocalJson[]>();
  let rowCount = 0;
  let temCoord = false;

  streamCsv(buf, (row) => {
    rowCount++;
    if (rowCount === 1) {
      temCoord = Object.keys(row).some(c => c.includes('LATITUDE') || c.includes('LAT'));
      if (!temCoord) {
        console.warn('  [AVISO] Este CSV não tem coordenadas — baixe eleitorado_local_votacao_XXXX.zip');
      }
    }
    const uf = (row['SG_UF'] || '').toUpperCase();
    if (!UFS.includes(uf)) return;
    if (!byUf.has(uf)) byUf.set(uf, []);
    byUf.get(uf)!.push({
      municipio: normText(row['NM_MUNICIPIO'] || row['NM_UE'] || ''),
      zona: parseInt(row['NR_ZONA'] || '0', 10),
      codLocal: row['NR_LOCAL_VOTACAO'] || row['CD_LOCAL'] || '',
      nome: row['NM_LOCAL_VOTACAO'] || row['NM_LOCAL'] || '',
      endereco: row['DS_ENDERECO'] || '',
      bairro: normText(row['NM_BAIRRO'] || ''),
      lat: parseCoord(row['NR_LATITUDE'] || row['LATITUDE'] || ''),
      lng: parseCoord(row['NR_LONGITUDE'] || row['LONGITUDE'] || ''),
    });
  });

  console.log(`  ${rowCount} linhas processadas`);

  for (const [uf, locais] of byUf) {
    writeJson(path.join(OUTPUT_DIR, 'locais', `${uf}.json`), locais);
    console.log(`  → ${uf}: ${locais.length} locais`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log('=======================================================');
  console.log('  TSE → JSON Estático (modo streaming)');
  console.log(`  Entrada : ${INPUT_DIR}`);
  console.log(`  Saída   : ${OUTPUT_DIR}`);
  console.log('=======================================================\n');

  if (!fs.existsSync(INPUT_DIR)) {
    console.error(`ERRO: pasta não encontrada: ${INPUT_DIR}`); process.exit(1);
  }

  ensureDir(OUTPUT_DIR);

  const items = fs.readdirSync(INPUT_DIR);
  console.log(`Itens na pasta (${items.length}): ${items.join(', ')}\n`);

  let total = 0;
  for (const ano of ANOS) {
    console.log(`\n--- Ano ${ano} ---`);
    for (const uf of UFS) {
      if (processUfAno(uf, ano)) total++;
    }
  }

  processLocais();

  console.log('\n=======================================================');
  console.log(`  Concluído! ${total} arquivo(s) gerados em public/data/tse/`);
  if (total > 0) {
    console.log('\n  Próximo passo — commit e push:');
    console.log('    git add public/data/tse/');
    console.log('    git commit -m "dados: TSE 2018-2024"');
    console.log('    git push origin HEAD:main');
  }
  console.log('=======================================================\n');
}

main();
