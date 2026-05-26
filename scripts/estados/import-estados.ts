/**
 * Orquestrador de importação de emendas estaduais.
 *
 * Detecta automaticamente os arquivos em data/estados/ e importa cada um.
 *
 * Convenção de nomes:
 *   {uf}-{ano}.csv   → ex: mg-2024.csv, sp-2025.csv
 *   {uf}-{ano}.xlsx  → ex: rs-2022.xlsx
 *
 * Fluxo de uso:
 *   1. Baixe os arquivos dos portais (links abaixo)
 *   2. Salve em data/estados/ com o nome no padrão acima
 *   3. npx tsx --require dotenv/config scripts/estados/import-estados.ts
 *   4. Arquivos importados são movidos para data/estados/processados/
 *
 * Portais por estado:
 *   RS → https://planejamento.rs.gov.br/emendas-parlamentares-estaduais
 *   SP → https://dadosabertos.sp.gov.br/dataset/emendas-impositivas-2025
 *   MG → https://www.emendas.mg.gov.br/transparencia/
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-estados.ts
 *   npx tsx --require dotenv/config scripts/estados/import-estados.ts --dry-run
 *   npx tsx --require dotenv/config scripts/estados/import-estados.ts --estado rs
 */
import { readdirSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { execSync } from 'node:child_process';

const DROP_ZONE  = join(process.cwd(), 'data', 'estados');
const PROCESSADO = join(DROP_ZONE, 'processados');

const DRY_RUN = process.argv.includes('--dry-run');
const FILTRO_UF = process.argv.find((a, i) => process.argv[i - 1] === '--estado')?.toLowerCase();

const ESTADOS_SUPORTADOS = ['rs', 'sp', 'mg'];

// Garante que as pastas existem
if (!existsSync(DROP_ZONE))  mkdirSync(DROP_ZONE,  { recursive: true });
if (!existsSync(PROCESSADO)) mkdirSync(PROCESSADO, { recursive: true });

interface Arquivo {
  uf: string;
  ano: number;
  caminho: string;
  ext: string;
}

function detectarArquivos(): Arquivo[] {
  const arquivos: Arquivo[] = [];
  const entries = readdirSync(DROP_ZONE);

  for (const entry of entries) {
    const ext = extname(entry).toLowerCase();
    if (!['.csv', '.xlsx', '.xls'].includes(ext)) continue;

    // Padrão esperado: {uf}-{ano}.{ext}  ex: rs-2022.xlsx
    const match = basename(entry, ext).match(/^([a-z]{2})-(\d{4})$/i);
    if (!match) {
      console.warn(`  [aviso] Arquivo ignorado (nome fora do padrão): ${entry}`);
      console.warn(`          Esperado: {uf}-{ano}.csv|xlsx — ex: rs-2022.xlsx\n`);
      continue;
    }

    const uf = match[1].toLowerCase();
    const ano = parseInt(match[2], 10);

    if (!ESTADOS_SUPORTADOS.includes(uf)) {
      console.warn(`  [aviso] Estado "${uf}" não suportado ainda. Suportados: ${ESTADOS_SUPORTADOS.join(', ')}\n`);
      continue;
    }

    if (FILTRO_UF && uf !== FILTRO_UF) continue;

    arquivos.push({ uf, ano, caminho: join(DROP_ZONE, entry), ext });
  }

  return arquivos.sort((a, b) => a.uf.localeCompare(b.uf) || a.ano - b.ano);
}

function importarArquivo(arq: Arquivo): boolean {
  const script = join(process.cwd(), 'scripts', 'estados', `import-${arq.uf}.ts`);
  const cmd = [
    'npx tsx --require dotenv/config',
    script,
    `--file "${arq.caminho}"`,
    `--ano ${arq.ano}`,
    DRY_RUN ? '--dry-run' : '',
  ].filter(Boolean).join(' ');

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📦 Importando: ${arq.uf.toUpperCase()} / ${arq.ano}`);
  console.log(`   Arquivo: ${basename(arq.caminho)}`);
  console.log(`${'─'.repeat(60)}`);

  try {
    execSync(cmd, { stdio: 'inherit', env: process.env });
    return true;
  } catch {
    console.error(`\n❌ Erro ao importar ${arq.uf.toUpperCase()} ${arq.ano}`);
    return false;
  }
}

function moverParaProcessado(arq: Arquivo) {
  if (DRY_RUN) return;
  const destino = join(PROCESSADO, basename(arq.caminho));
  renameSync(arq.caminho, destino);
  console.log(`  ✔ Movido para processados/`);
}

async function main() {
  console.log(`\n🗂️  Import Estadual — Drop Zone: data/estados/`);
  console.log(`   Modo: ${DRY_RUN ? 'DRY RUN (sem escrita)' : 'PRODUÇÃO'}`);
  if (FILTRO_UF) console.log(`   Filtro: apenas ${FILTRO_UF.toUpperCase()}`);
  console.log();

  const arquivos = detectarArquivos();

  if (arquivos.length === 0) {
    console.log('Nenhum arquivo encontrado em data/estados/');
    console.log();
    console.log('Como usar:');
    console.log('  1. Baixe os arquivos dos portais estaduais:');
    console.log('     RS → https://planejamento.rs.gov.br/emendas-parlamentares-estaduais');
    console.log('     SP → https://dadosabertos.sp.gov.br/dataset/emendas-impositivas-2025');
    console.log('     MG → https://www.emendas.mg.gov.br/transparencia/');
    console.log();
    console.log('  2. Salve com o nome no padrão:');
    console.log('     data/estados/rs-2022.xlsx');
    console.log('     data/estados/sp-2025.csv');
    console.log('     data/estados/mg-2024.csv');
    console.log();
    console.log('  3. Rode novamente este script.');
    return;
  }

  console.log(`${arquivos.length} arquivo(s) encontrado(s):`);
  arquivos.forEach((a) => console.log(`   • ${a.uf.toUpperCase()} ${a.ano} — ${basename(a.caminho)}`));

  let sucesso = 0;
  let falha = 0;

  for (const arq of arquivos) {
    const ok = importarArquivo(arq);
    if (ok) {
      sucesso++;
      moverParaProcessado(arq);
    } else {
      falha++;
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ Concluído: ${sucesso} importado(s) | ❌ ${falha} com erro`);
  if (DRY_RUN) console.log('   [dry-run] nenhuma escrita realizada, arquivos não movidos.');
  console.log(`${'═'.repeat(60)}\n`);
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
