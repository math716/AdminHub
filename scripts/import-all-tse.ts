/**
 * Importa todos os estados e anos do TSE de uma vez.
 * Baixa o ZIP uma única vez por ano e processa todos os estados.
 *
 * Uso:
 *   npx tsx scripts/import-all-tse.ts
 *   npx tsx scripts/import-all-tse.ts --anos 2024          (só um ano)
 *   npx tsx scripts/import-all-tse.ts --anos 2022,2024     (múltiplos anos)
 *   npx tsx scripts/import-all-tse.ts --ufs SP,RJ          (só alguns estados)
 *   npx tsx scripts/import-all-tse.ts --skip-existentes    (pula UF/ano já importados)
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import zlib from 'zlib';
import { parse } from 'csv/sync';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------
function getArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

const ANOS_ARG = getArg('--anos');
const UFS_ARG = getArg('--ufs');
const SKIP_EXISTENTES = process.argv.includes('--skip-existentes');

const ANOS = ANOS_ARG
  ? ANOS_ARG.split(',').map(a => parseInt(a.trim()))
  : [2018, 2020, 2022, 2024];

const TODOS_UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
                   'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
                   'SP','SE','TO'];

const UFS = UFS_ARG ? UFS_ARG.split(',').map(u => u.trim().toUpperCase()) : TODOS_UFS;

// ---------------------------------------------------------------------------
// ZIP parser
// ---------------------------------------------------------------------------
interface ZipEntry { filename: string; data: Buffer; }

function parseZip(buffer: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;
  while (offset < buffer.length - 4) {
    if (buffer[offset] === 0x50 && buffer[offset+1] === 0x4b &&
        buffer[offset+2] === 0x03 && buffer[offset+3] === 0x04) {
      const compression    = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const fnLen          = buffer.readUInt16LE(offset + 26);
      const extraLen       = buffer.readUInt16LE(offset + 28);
      const filename       = buffer.subarray(offset + 30, offset + 30 + fnLen).toString('utf8');
      const dataStart      = offset + 30 + fnLen + extraLen;
      const compressed     = buffer.subarray(dataStart, dataStart + compressedSize);
      if (filename.toLowerCase().endsWith('.csv') && !filename.toLowerCase().includes('brasil')) {
        try {
          const data = compression === 0
            ? (compressed as Buffer)
            : zlib.inflateRawSync(compressed as any) as Buffer;
          entries.push({ filename, data });
        } catch {}
      }
      offset = dataStart + compressedSize;
    } else { offset++; }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Importar candidatos de um CSV já descomprimido
// ---------------------------------------------------------------------------
async function importarCSV(csvBuffer: Buffer, uf: string, ano: number): Promise<number> {
  const csvText = csvBuffer.toString('latin1');

  const rows: any[] = parse(csvText, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  const firstRound = rows.filter((r: any) => r.NR_TURNO === '1' && r.SG_UF === uf);
  if (firstRound.length === 0) {
    console.log(`  [${uf}] Nenhuma linha de 1º turno encontrada.`);
    return 0;
  }

  // Agrupar por candidato
  const byCandidate = new Map<string, any[]>();
  for (const row of firstRound) {
    if (!byCandidate.has(row.SQ_CANDIDATO)) byCandidate.set(row.SQ_CANDIDATO, []);
    byCandidate.get(row.SQ_CANDIDATO)!.push(row);
  }

  // Limpar dados anteriores desta UF/ano
  await prisma.candidato.deleteMany({ where: { uf, ano } });

  // Construir todos os dados em memória com IDs pré-gerados
  const candidatosData: any[] = [];
  const vmData: any[] = [];
  const vzData: any[] = [];

  for (const [, cRows] of byCandidate.entries()) {
    const first = cRows[0];
    const id = randomUUID();
    const totalVotos = cRows.reduce((sum: number, r: any) => {
      const v = parseInt(r.QT_VOTOS_NOMINAIS_VALIDOS, 10);
      return sum + (isNaN(v) || v < 0 ? 0 : v);
    }, 0);

    candidatosData.push({
      id,
      nome: first.NM_CANDIDATO,
      nomeUrna: first.NM_URNA_CANDIDATO,
      numero: parseInt(first.NR_CANDIDATO, 10) || null,
      ano, uf,
      cargo: first.DS_CARGO,
      partido: first.SG_PARTIDO || first.NM_PARTIDO,
      situacao: first.DS_SIT_TOT_TURNO || null,
      totalVotos,
    });

    const municipiosMap = new Map<string, number>();
    for (const r of cRows) {
      const v = parseInt(r.QT_VOTOS_NOMINAIS_VALIDOS, 10);
      const votos = isNaN(v) || v < 0 ? 0 : v;
      municipiosMap.set(r.NM_MUNICIPIO, (municipiosMap.get(r.NM_MUNICIPIO) ?? 0) + votos);
    }
    for (const [municipio, votos] of municipiosMap.entries()) {
      vmData.push({ candidatoId: id, municipio, votos });
    }
    for (const r of cRows) {
      const v = parseInt(r.QT_VOTOS_NOMINAIS_VALIDOS, 10);
      vzData.push({ candidatoId: id, municipio: r.NM_MUNICIPIO, zona: parseInt(r.NR_ZONA, 10) || 0, votos: isNaN(v) || v < 0 ? 0 : v });
    }
  }

  // Inserir candidatos em lote
  const CAND_BATCH = 1000;
  for (let i = 0; i < candidatosData.length; i += CAND_BATCH) {
    await prisma.candidato.createMany({ data: candidatosData.slice(i, i + CAND_BATCH) });
  }

  // Inserir votos por município em lote
  const VM_BATCH = 5000;
  for (let i = 0; i < vmData.length; i += VM_BATCH) {
    await prisma.votoMunicipio.createMany({ data: vmData.slice(i, i + VM_BATCH), skipDuplicates: true });
  }

  // Inserir votos por zona em lote
  const VZ_BATCH = 5000;
  for (let i = 0; i < vzData.length; i += VZ_BATCH) {
    await prisma.votoZona.createMany({ data: vzData.slice(i, i + VZ_BATCH), skipDuplicates: true });
  }

  return candidatosData.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('='.repeat(60));
  console.log('Importação completa TSE');
  console.log(`Anos: ${ANOS.join(', ')}`);
  console.log(`Estados: ${UFS.join(', ')}`);
  console.log(`Pular existentes: ${SKIP_EXISTENTES}`);
  console.log('='.repeat(60));

  const inicio = Date.now();
  let totalCandidatos = 0;
  const erros: string[] = [];

  for (const ano of ANOS) {
    const url = `https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_${ano}.zip`;

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📥 Baixando ZIP de ${ano}...`);

    let zipBuffer: Buffer;
    try {
      const headRes = await fetch(url, { method: 'HEAD' });
      if (!headRes.ok) {
        console.error(`  ❌ Arquivo ${ano} não disponível (HTTP ${headRes.status})`);
        erros.push(`${ano}: arquivo não disponível`);
        continue;
      }
      const sizeMB = (parseInt(headRes.headers.get('content-length') || '0') / 1024 / 1024).toFixed(0);
      console.log(`  Tamanho: ${sizeMB} MB`);

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      zipBuffer = Buffer.from(await res.arrayBuffer());
      console.log(`  ✅ ZIP baixado: ${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB`);
    } catch (err: any) {
      console.error(`  ❌ Erro ao baixar ${ano}: ${err.message}`);
      erros.push(`${ano}: ${err.message}`);
      continue;
    }

    console.log(`  Extraindo CSVs do ZIP...`);
    const entries = parseZip(zipBuffer);
    const csvPorUF = new Map<string, Buffer>();
    for (const entry of entries) {
      const match = entry.filename.match(/_([A-Z]{2})\.csv$/i);
      if (match) csvPorUF.set(match[1].toUpperCase(), entry.data);
    }
    console.log(`  CSVs encontrados: ${Array.from(csvPorUF.keys()).join(', ')}`);

    for (const uf of UFS) {
      // Verificar se já existe e pular se --skip-existentes
      if (SKIP_EXISTENTES) {
        const existente = await prisma.candidato.count({ where: { uf, ano } });
        if (existente > 0) {
          console.log(`  [${uf}/${ano}] ⏭️  Já importado (${existente} candidatos). Pulando.`);
          continue;
        }
      }

      const csvBuffer = csvPorUF.get(uf);
      if (!csvBuffer) {
        console.log(`  [${uf}/${ano}] ⚠️  CSV não encontrado no ZIP.`);
        continue;
      }

      process.stdout.write(`  [${uf}/${ano}] Importando... `);
      try {
        const count = await importarCSV(csvBuffer, uf, ano);
        totalCandidatos += count;
        console.log(`✅ ${count} candidatos`);
      } catch (err: any) {
        console.log(`❌ Erro: ${err.message}`);
        erros.push(`${uf}/${ano}: ${err.message}`);
      }
    }
  }

  const duracao = ((Date.now() - inicio) / 1000 / 60).toFixed(1);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Concluído em ${duracao} minutos`);
  console.log(`Total de candidatos importados: ${totalCandidatos}`);
  if (erros.length > 0) {
    console.log(`\n⚠️  Erros encontrados:`);
    erros.forEach(e => console.log(`  - ${e}`));
  }
  console.log('='.repeat(60));
}

main()
  .catch(err => { console.error('Erro fatal:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
