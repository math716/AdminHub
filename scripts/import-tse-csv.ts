import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import zlib from 'zlib';
import { parse } from 'csv/sync';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
function getArg(flag: string, defaultValue: string): string {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : defaultValue;
}

const UF = getArg('--uf', 'SP').toUpperCase();
const ANO = parseInt(getArg('--ano', '2022'), 10);
const TYPE = getArg('--type', 'candidatos') as 'candidatos' | 'locais';

// ---------------------------------------------------------------------------
// ZIP parser (pure Node.js built-ins, no external library)
// ---------------------------------------------------------------------------

interface ZipEntry {
  filename: string;
  data: Buffer;
}

/**
 * Minimal ZIP local file header parser.
 * Signature: PK\x03\x04 (0x504b0304)
 * Compression: 0 = stored, 8 = deflate
 */
function parseZip(buffer: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;

  while (offset < buffer.length - 4) {
    // Find local file header signature
    if (
      buffer[offset] === 0x50 &&
      buffer[offset + 1] === 0x4b &&
      buffer[offset + 2] === 0x03 &&
      buffer[offset + 3] === 0x04
    ) {
      const compression = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const filenameLength = buffer.readUInt16LE(offset + 26);
      const extraLength = buffer.readUInt16LE(offset + 28);

      const filenameStart = offset + 30;
      const filename = buffer.subarray(filenameStart, filenameStart + filenameLength).toString('utf8');
      const dataStart = filenameStart + filenameLength + extraLength;
      const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);

      let data: Buffer;
      if (compression === 0) {
        data = compressedData;
      } else if (compression === 8) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data = zlib.inflateRawSync(compressedData as any) as Buffer;
      } else {
        // Unsupported compression — skip
        offset = dataStart + compressedSize;
        continue;
      }

      entries.push({ filename, data });
      offset = dataStart + compressedSize;
    } else {
      offset++;
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------
async function downloadBuffer(url: string): Promise<Buffer> {
  console.log(`Baixando: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ao baixar ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ---------------------------------------------------------------------------
// Text normalization
// ---------------------------------------------------------------------------
function normalizeText(str: string): string {
  return str
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// ---------------------------------------------------------------------------
// votacao_candidato_munzona import
// ---------------------------------------------------------------------------
interface VotacaoRow {
  DT_GERACAO: string;
  HH_GERACAO: string;
  ANO_ELEICAO: string;
  CD_TIPO_ELEICAO: string;
  NM_TIPO_ELEICAO: string;
  NR_TURNO: string;
  CD_ELEICAO: string;
  DS_ELEICAO: string;
  DT_ELEICAO: string;
  TP_ABRANGENCIA: string;
  SG_UF: string;
  SG_UE: string;
  NM_UE: string;
  CD_MUNICIPIO: string;
  NM_MUNICIPIO: string;
  NR_ZONA: string;
  CD_CARGO: string;
  DS_CARGO: string;
  SQ_CANDIDATO: string;
  NR_CANDIDATO: string;
  NM_CANDIDATO: string;
  NM_URNA_CANDIDATO: string;
  NM_PARTIDO: string;
  SG_PARTIDO: string;
  DT_NASCIMENTO: string;
  CD_GENERO: string;
  DS_GENERO: string;
  CD_GRAU_INSTRUCAO: string;
  DS_GRAU_INSTRUCAO: string;
  CD_ESTADO_CIVIL: string;
  DS_ESTADO_CIVIL: string;
  CD_OCUPACAO: string;
  DS_OCUPACAO: string;
  CD_SIT_TOT_TURNO: string;
  DS_SIT_TOT_TURNO: string;
  QT_VOTOS_NOMINAIS: string;
  NM_TIPO_DESTINACAO_VOTOS: string;
  QT_VOTOS_NOMINAIS_VALIDOS: string;
}

async function importCandidatos(uf: string, ano: number): Promise<void> {
  // ZIP nacional — sem sufixo de UF
  const url = `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_${ano}.zip`;

  const zipBuffer = await downloadBuffer(url);
  console.log(`ZIP baixado: ${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB`);

  const entries = parseZip(zipBuffer);
  console.log(`Entradas no ZIP: ${entries.map(e => e.filename).join(', ')}`);

  // Buscar CSV específico do estado (ex: votacao_candidato_munzona_2024_SP.csv)
  const csvEntry = entries.find(e => e.filename.toLowerCase().includes(`_${uf.toLowerCase()}.csv`))
    ?? entries.find(e => e.filename.toLowerCase().endsWith('.csv'));

  if (!csvEntry) {
    throw new Error('Nenhum arquivo CSV encontrado no ZIP');
  }

  console.log(`Processando: ${csvEntry.filename}`);
  const csvText = csvEntry.data.toString('latin1');

  const rows: VotacaoRow[] = parse(csvText, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  console.log(`Linhas no CSV: ${rows.length}`);

  // Filtrar por UF e 1º turno
  const firstRound = rows.filter(r => r.NR_TURNO === '1' && r.SG_UF === uf);
  console.log(`Linhas do 1º turno: ${firstRound.length}`);

  // Group by SQ_CANDIDATO
  const byCandidate = new Map<string, VotacaoRow[]>();
  for (const row of firstRound) {
    const key = row.SQ_CANDIDATO;
    if (!byCandidate.has(key)) byCandidate.set(key, []);
    byCandidate.get(key)!.push(row);
  }

  console.log(`Candidatos únicos: ${byCandidate.size}`);

  const BATCH = 500;
  let candidatosInseridos = 0;
  let votosMunicipioInseridos = 0;
  let votosZonaInseridos = 0;

  const candidateKeys = Array.from(byCandidate.keys());

  for (let i = 0; i < candidateKeys.length; i += BATCH) {
    const batchKeys = candidateKeys.slice(i, i + BATCH);

    // Build candidato records for this batch
    const candidatoData = batchKeys.map(sqCandidato => {
      const candidateRows = byCandidate.get(sqCandidato)!;
      const first = candidateRows[0];
      const totalVotos = candidateRows.reduce((sum, r) => {
        const v = parseInt(r.QT_VOTOS_NOMINAIS_VALIDOS, 10);
        return sum + (isNaN(v) || v < 0 ? 0 : v);
      }, 0);

      return {
        nome: first.NM_CANDIDATO,
        nomeUrna: first.NM_URNA_CANDIDATO,
        numero: parseInt(first.NR_CANDIDATO, 10) || null,
        ano,
        uf,
        cargo: first.DS_CARGO,
        partido: first.SG_PARTIDO || first.NM_PARTIDO,
        situacao: first.DS_SIT_TOT_TURNO || null,
        totalVotos,
      };
    });

    // Insert candidatos
    await prisma.candidato.createMany({
      data: candidatoData,
      skipDuplicates: true,
    });
    candidatosInseridos += candidatoData.length;

    // For VotoMunicipio and VotoZona we need the IDs just created.
    // Fetch them by (nome + ano + uf + nomeUrna) since there's no unique on SQ_CANDIDATO.
    for (const sqCandidato of batchKeys) {
      const candidateRows = byCandidate.get(sqCandidato)!;
      const first = candidateRows[0];

      let candidato: { id: string } | null = null;
      try {
        candidato = await prisma.candidato.findFirst({
          where: {
            nomeUrna: first.NM_URNA_CANDIDATO,
            ano,
            uf,
            cargo: first.DS_CARGO,
            partido: first.SG_PARTIDO || first.NM_PARTIDO,
          },
          select: { id: true },
        });
      } catch (err: any) {
        console.error(`Erro ao buscar candidato ${first.NM_URNA_CANDIDATO}:`, err.message);
        continue;
      }

      if (!candidato) continue;

      // Aggregate VotoMunicipio (sum across zones)
      const votosPorMunicipio = new Map<string, number>();
      for (const row of candidateRows) {
        const municipio = row.NM_MUNICIPIO;
        const v = parseInt(row.QT_VOTOS_NOMINAIS_VALIDOS, 10);
        const votos = isNaN(v) || v < 0 ? 0 : v;
        votosPorMunicipio.set(municipio, (votosPorMunicipio.get(municipio) ?? 0) + votos);
      }

      const votosMunicipioData = Array.from(votosPorMunicipio.entries())
        .filter(([, v]) => v >= 0)
        .map(([municipio, votos]) => ({
          candidatoId: candidato!.id,
          municipio,
          votos,
        }));

      if (votosMunicipioData.length > 0) {
        for (let j = 0; j < votosMunicipioData.length; j += BATCH) {
          await prisma.votoMunicipio.createMany({
            data: votosMunicipioData.slice(j, j + BATCH),
            skipDuplicates: true,
          });
        }
        votosMunicipioInseridos += votosMunicipioData.length;
      }

      // VotoZona (one per municipio + zona)
      const votosZonaData = candidateRows.map(row => {
        const v = parseInt(row.QT_VOTOS_NOMINAIS_VALIDOS, 10);
        return {
          candidatoId: candidato!.id,
          municipio: row.NM_MUNICIPIO,
          zona: parseInt(row.NR_ZONA, 10) || 0,
          votos: isNaN(v) || v < 0 ? 0 : v,
        };
      });

      if (votosZonaData.length > 0) {
        for (let j = 0; j < votosZonaData.length; j += BATCH) {
          try {
            await prisma.votoZona.createMany({
              data: votosZonaData.slice(j, j + BATCH),
              skipDuplicates: true,
            });
          } catch (err: any) {
            console.error(`Erro ao inserir votos zona:`, err.message);
          }
        }
        votosZonaInseridos += votosZonaData.length;
      }
    }

    const pct = Math.round(((i + batchKeys.length) / candidateKeys.length) * 100);
    console.log(`[${pct}%] Candidatos: ${candidatosInseridos} | VotosMunicipio: ${votosMunicipioInseridos} | VotosZona: ${votosZonaInseridos}`);
  }

  console.log('\n=== Importação de candidatos concluída ===');
  console.log(`Candidatos: ${candidatosInseridos}`);
  console.log(`Votos por município: ${votosMunicipioInseridos}`);
  console.log(`Votos por zona: ${votosZonaInseridos}`);
}

// ---------------------------------------------------------------------------
// locais_votacao import
// ---------------------------------------------------------------------------
interface LocaisRow {
  DT_GERACAO: string;
  HH_GERACAO: string;
  ANO_ELEICAO: string;
  CD_ELEICAO: string;
  DS_ELEICAO: string;
  DT_ELEICAO: string;
  SG_UF: string;
  CD_MUNICIPIO: string;
  NM_MUNICIPIO: string;
  NR_ZONA: string;
  NR_LOCAL_VOTACAO: string;
  NM_LOCAL_VOTACAO: string;
  DS_ENDERECO: string;
  NM_BAIRRO: string;
  NR_CEP: string;
  NR_LATITUDE: string;
  NR_LONGITUDE: string;
}

function parseCoord(val: string): number | null {
  if (!val || val.trim() === '') return null;
  const n = parseFloat(val.replace(',', '.'));
  return isNaN(n) ? null : n;
}

async function importLocais(uf: string, ano: number): Promise<void> {
  // URL correta: pasta e arquivo diferentes do esperado
  const url = `https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_${ano}.zip`;

  const zipBuffer = await downloadBuffer(url);
  console.log(`ZIP baixado: ${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB`);

  const entries = parseZip(zipBuffer);
  console.log(`Entradas no ZIP: ${entries.map(e => e.filename).join(', ')}`);

  // ZIP nacional — filtrar por UF depois
  const csvEntry = entries.find(e => e.filename.toLowerCase().endsWith('.csv'));

  if (!csvEntry) {
    throw new Error('Nenhum arquivo CSV encontrado no ZIP');
  }

  console.log(`Processando: ${csvEntry.filename}`);
  const csvText = csvEntry.data.toString('latin1');

  const allRows: LocaisRow[] = parse(csvText, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    from_line: 2,
    relax_column_count: true,
  });

  // Filtrar pelo estado solicitado
  const rows = allRows.filter(r => r.SG_UF === uf);
  console.log(`Linhas do CSV: ${allRows.length} total, ${rows.length} para ${uf}`);

  const BATCH = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);

    const data = batch.map(row => ({
      uf: row.SG_UF || uf,
      nomeMunicipio: normalizeText(row.NM_MUNICIPIO || ''),
      zona: parseInt(row.NR_ZONA, 10) || 0,
      // Coluna correta no arquivo TSE eleitorado_local_votacao
      codLocal: row.NR_LOCAL_VOTACAO || null,
      nomeLocal: row.NM_LOCAL_VOTACAO || '',
      endereco: row.DS_ENDERECO || null,
      bairro: row.NM_BAIRRO || null,
      latitude: parseCoord(row.NR_LATITUDE),
      longitude: parseCoord(row.NR_LONGITUDE),
    }));

    try {
      await prisma.localVotacao.createMany({
        data,
        skipDuplicates: true,
      });
      inserted += data.length;
    } catch (err: any) {
      console.error(`Erro ao inserir locais (batch ${i}):`, err.message);
    }

    const pct = Math.round(((i + batch.length) / rows.length) * 100);
    console.log(`[${pct}%] Locais inseridos: ${inserted}`);
  }

  console.log('\n=== Importação de locais de votação concluída ===');
  console.log(`Locais inseridos: ${inserted}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\nImportação TSE — UF: ${UF} | ANO: ${ANO} | TIPO: ${TYPE}\n`);

  if (TYPE === 'locais') {
    await importLocais(UF, ANO);
  } else {
    await importCandidatos(UF, ANO);
  }
}

main()
  .catch(err => {
    console.error('Erro fatal:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
