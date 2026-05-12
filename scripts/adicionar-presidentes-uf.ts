/**
 * Adiciona candidatos presidenciais aos arquivos UF existentes.
 * Lê os _BR.csv do TSE e injeta os presidenciais em cada {UF}.json.gz
 * com votos e zonas por município daquele estado.
 *
 * USO (na raiz do projeto):
 *   npx tsx scripts/adicionar-presidentes-uf.ts --dir "C:\caminho\para\tse-downloads"
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const ANOS = [2018, 2022]; // anos com eleição presidencial
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
             'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
             'RS','RO','RR','SC','SP','SE','TO'];

function getArg(flag: string, def = ''): string {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const downloadDir = getArg('--dir', path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', 'Downloads', 'tse-downloads'));

// ---------------------------------------------------------------------------
// CSV streaming
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

function normText(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`´]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Estrutura de candidato (igual ao existente)
// ---------------------------------------------------------------------------
interface CandidatoJson {
  id: string;
  nome: string;
  nomeUrna: string;
  numero: number | null;
  partido: string;
  cargo: string;
  situacao: string;
  totalVotos: number;
  votos: Record<string, number>;
  zonas: Array<{ municipio: string; zona: number; votos: number }>;
  votosPorEstado?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
for (const ano of ANOS) {
  const srcDir = path.join(downloadDir, `votacao_candidato_munzona_${ano}`);
  if (!fs.existsSync(srcDir)) { console.log(`[${ano}] Download não encontrado, pulando.`); continue; }

  const brFile = fs.readdirSync(srcDir).find(f => /_(BR|BRASIL)\.csv$/i.test(f));
  if (!brFile) { console.log(`[${ano}] Arquivo _BR.csv não encontrado, pulando.`); continue; }

  console.log(`\n[${ano}] Lendo ${brFile}...`);

  // Estrutura: sq → uf → { first, votos, zonas }
  type UfAcc = { first: Record<string, string>; totalVotos: number; votos: Record<string, number>; zonas: Array<{ municipio: string; zona: number; votos: number }> };
  const bySqUf = new Map<string, Map<string, UfAcc>>();

  const buf = fs.readFileSync(path.join(srcDir, brFile));
  let rows = 0;

  streamCsv(buf, (row) => {
    const turno = (row['NR_TURNO'] ?? '1').replace(/^0+/, '') || '1';
    if (turno !== '1') return;
    const abrangencia = row['TP_ABRANGENCIA']?.trim();
    if (abrangencia && abrangencia !== 'F') return;

    rows++;
    const sq = row['SQ_CANDIDATO'] || `${row['NM_URNA_CANDIDATO']}|${row['SG_PARTIDO']}`;
    const uf = row['SG_UF']?.trim();
    if (!uf || uf === 'BR') return;

    const v = parseVotos(row);
    const mun = normText(row['NM_MUNICIPIO'] || row['NM_UE'] || '');
    const zona = parseInt(row['NR_ZONA'] || '0', 10);

    if (!bySqUf.has(sq)) bySqUf.set(sq, new Map());
    const byUf = bySqUf.get(sq)!;
    if (!byUf.has(uf)) byUf.set(uf, { first: row, totalVotos: 0, votos: {}, zonas: [] });
    const acc = byUf.get(uf)!;
    acc.totalVotos += v;
    if (mun) acc.votos[mun] = (acc.votos[mun] ?? 0) + v;
    if (zona && mun) acc.zonas.push({ municipio: mun, zona, votos: v });
  });

  console.log(`  ${rows} linhas, ${bySqUf.size} candidatos presidenciais`);

  // Para cada UF, adicionar os presidenciais ao arquivo existente
  for (const uf of UFS) {
    const ufPath = path.join(process.cwd(), 'public', 'data', 'tse', String(ano), uf);
    const gzPath = ufPath + '.json.gz';
    const jsonPath = ufPath + '.json';

    let existing: CandidatoJson[] = [];
    try {
      if (fs.existsSync(gzPath)) {
        existing = JSON.parse(zlib.gunzipSync(fs.readFileSync(gzPath) as any).toString('utf8'));
      } else if (fs.existsSync(jsonPath)) {
        existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      } else {
        continue;
      }
    } catch { continue; }

    const toAdd: CandidatoJson[] = [];

    for (const [sq, byUf] of bySqUf) {
      const acc = byUf.get(uf);
      if (!acc) continue;

      const id = `BR-${ano}-${sq}`;
      // Não duplicar se já existir
      if (existing.some(c => c.id === id)) continue;

      const f = acc.first;
      toAdd.push({
        id,
        nome: f['NM_CANDIDATO'] || f['NM_URNA_CANDIDATO'] || '',
        nomeUrna: f['NM_URNA_CANDIDATO'] || f['NM_CANDIDATO'] || '',
        numero: parseInt(f['NR_CANDIDATO'] || '0', 10) || null,
        partido: f['SG_PARTIDO'] || '',
        cargo: f['DS_CARGO'] || '',
        situacao: f['DS_SIT_TOT_TURNO'] || '',
        totalVotos: acc.totalVotos,
        votos: acc.votos,
        zonas: acc.zonas,
      });
    }

    if (toAdd.length === 0) continue;

    const updated = [...existing, ...toAdd];
    const gz = zlib.gzipSync(Buffer.from(JSON.stringify(updated), 'utf8') as any, { level: 9 });
    fs.writeFileSync(gzPath, gz);
    console.log(`  ${uf}: +${toAdd.length} presidenciais → ${updated.length} total (${(gz.length / 1024).toFixed(0)} KB)`);
  }
}

console.log('\nConcluído!');
