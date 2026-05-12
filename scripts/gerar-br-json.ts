/**
 * Gera BR.json.gz para cada ano lendo os arquivos _BR.csv do TSE.
 * Esses arquivos contêm candidatos a PRESIDENTE (cargo nacional).
 *
 * USO (na raiz do projeto):
 *   npx tsx scripts/gerar-br-json.ts --dir "C:\caminho\para\tse-downloads"
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const ANOS = [2018, 2020, 2022, 2024];

function getArg(flag: string, def = ''): string {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const downloadDir = getArg('--dir', path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', 'Downloads', 'tse-downloads'));

// ---------------------------------------------------------------------------
// CSV streaming (igual ao tse-to-json.ts)
// ---------------------------------------------------------------------------
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

function streamCsv(buf: Buffer, onRow: (row: Record<string, string>) => void) {
  const CHUNK = 32 * 1024 * 1024;
  let headers: string[] = [];
  let leftover = '';

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
    onRow(row);
  };

  for (let offset = 0; offset < buf.length; offset += CHUNK) {
    const chunk = buf.subarray(offset, offset + CHUNK).toString('latin1');
    const text = leftover + chunk;
    const lines = text.split('\n');
    leftover = lines.pop() ?? '';
    for (const line of lines) processLine(line);
  }
  if (leftover.trim()) processLine(leftover);
}

function parseVotos(row: Record<string, string>): number {
  const raw = row['QT_VOTOS_NOMINAIS_VALIDOS'] ?? row['QT_VOTOS_NOMINAIS'] ?? row['QT_VOTOS'] ?? '0';
  if (!raw || raw === '#NULO#' || raw === '#NULO') return 0;
  const v = parseInt(raw.replace(/\./g, ''), 10);
  return isNaN(v) || v < 0 ? 0 : v;
}

function getTurno(row: Record<string, string>): string {
  return (row['NR_TURNO'] ?? row['CD_TURNO'] ?? '1').replace(/^0+/, '') || '1';
}

// ---------------------------------------------------------------------------
// Processar um arquivo _BR.csv
// ---------------------------------------------------------------------------
interface CandidatoBR {
  id: string;
  nome: string;
  nomeUrna: string;
  numero: number | null;
  partido: string;
  cargo: string;
  situacao: string;
  totalVotos: number;
  votosPorEstado: Record<string, number>;
  votos: Record<string, number>;
  zonas: Array<{ municipio: string; zona: number; votos: number }>;
}

function processBrCsv(csvPath: string, ano: number): CandidatoBR[] {
  const buf = fs.readFileSync(csvPath);
  const byCand = new Map<string, { first: Record<string, string>; totalVotos: number; votosPorEstado: Record<string, number> }>();
  let rows = 0;

  streamCsv(buf, (row) => {
    if (getTurno(row) !== '1') return;
    // Apenas cargos de abrangência federal (F = Federal)
    const abrangencia = row['TP_ABRANGENCIA']?.trim();
    if (abrangencia && abrangencia !== 'F') return;
    rows++;

    const sq = row['SQ_CANDIDATO'] || `${row['NM_URNA_CANDIDATO']}|${row['DS_CARGO']}|${row['SG_PARTIDO']}`;
    const v = parseVotos(row);
    const uf = row['SG_UF']?.trim();

    if (!byCand.has(sq)) {
      byCand.set(sq, { first: row, totalVotos: 0, votosPorEstado: {} });
    }
    const acc = byCand.get(sq)!;
    acc.totalVotos += v;
    if (uf && uf !== 'BR') {
      acc.votosPorEstado[uf] = (acc.votosPorEstado[uf] ?? 0) + v;
    }
  });

  console.log(`  ${path.basename(csvPath)}: ${rows} linhas, ${byCand.size} candidatos`);

  const result: CandidatoBR[] = [];
  for (const [sq, acc] of byCand) {
    if (acc.totalVotos === 0) continue;
    const f = acc.first;
    result.push({
      id: `BR-${ano}-${sq}`,
      nome: f['NM_CANDIDATO'] || f['NM_URNA_CANDIDATO'] || '',
      nomeUrna: f['NM_URNA_CANDIDATO'] || f['NM_CANDIDATO'] || '',
      numero: parseInt(f['NR_CANDIDATO'] || '0', 10) || null,
      partido: f['SG_PARTIDO'] || f['NM_PARTIDO'] || '',
      cargo: f['DS_CARGO'] || '',
      situacao: f['DS_SIT_TOT_TURNO'] || f['DS_SITUACAO_CANDIDATURA'] || '',
      totalVotos: acc.totalVotos,
      votosPorEstado: acc.votosPorEstado,
      votos: {},
      zonas: [],
    });
  }

  return result.sort((a, b) => b.totalVotos - a.totalVotos);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
for (const ano of ANOS) {
  const outDir = path.join(process.cwd(), 'public', 'data', 'tse', String(ano));
  if (!fs.existsSync(outDir)) { console.log(`[${ano}] Pasta de saída não encontrada, pulando.`); continue; }

  const srcDir = path.join(downloadDir, `votacao_candidato_munzona_${ano}`);
  if (!fs.existsSync(srcDir)) { console.log(`[${ano}] Download não encontrado em ${srcDir}, pulando.`); continue; }

  // Procurar arquivo _BR.csv (pode ser _BR.csv ou _BRASIL.csv)
  const brFile = fs.readdirSync(srcDir).find(f => /_(BR|BRASIL)\.csv$/i.test(f));
  if (!brFile) { console.log(`[${ano}] Arquivo _BR.csv não encontrado em ${srcDir}, pulando.`); continue; }

  const outPath = path.join(outDir, 'BR.json.gz');

  console.log(`[${ano}] Processando ${brFile}...`);
  const candidatos = processBrCsv(path.join(srcDir, brFile), ano);

  if (candidatos.length === 0) {
    console.log(`[${ano}] Nenhum candidato encontrado no turno 1.\n`);
    continue;
  }

  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(candidatos), 'utf8') as any);
  fs.writeFileSync(outPath, gz);
  console.log(`[${ano}] BR.json.gz gerado: ${candidatos.length} candidatos, ${(gz.length / 1024).toFixed(0)} KB`);
  console.log(`  Cargos: ${[...new Set(candidatos.map(c => c.cargo))].join(', ')}`);
  const bols = candidatos.find(c => c.nomeUrna.toUpperCase().includes('BOLSONARO') || c.nomeUrna.toUpperCase().includes('LULA'));
  if (bols) console.log(`  Exemplo: ${bols.nomeUrna} / ${bols.cargo} / ${bols.totalVotos.toLocaleString()} votos`);
  console.log();
}

console.log('Concluído!');
