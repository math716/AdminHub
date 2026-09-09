/**
 * Importa as emendas estaduais de São Paulo da base aberta do portal da
 * transparência (o CSV baixado por scripts/download-emendas-sp.ts).
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-sp-aberto.ts
 *   npx tsx --require dotenv/config scripts/estados/import-sp-aberto.ts --dry-run
 *   npx tsx --require dotenv/config scripts/estados/import-sp-aberto.ts --anos 2025,2026
 *
 * Substitui o import-sp.ts, que lia planilhas do painel do Power BI. Os dois
 * publicavam conjuntos diferentes: conferido em setembro de 2026, o deputado
 * Gilmaci Santos tinha 12 emendas de 2026 no sistema (R$ 13,2 M) contra 5 no
 * portal (R$ 4,8 M) — sete códigos que não existem na base oficial.
 *
 * Por isso este import APAGA, nos anos que cobre, as emendas estaduais de SP
 * que não vierem nesta base: sem isso as antigas ficariam para sempre, somando
 * valores que o portal não reconhece.
 */
import fs from 'fs';
import path from 'path';
import { buildPrisma, importarEmendas, type EmendaEstadualRow } from './base-import-estadual';
import { classificarArea } from '../../lib/portal-transparencia';

function arg(nome: string): string | undefined {
  const i = process.argv.findIndex(a => a === `--${nome}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const ARQUIVO = arg('file') ?? path.join('data', 'estados', 'sp-emendas.csv');
const DRY_RUN = process.argv.includes('--dry-run');
const ANOS = (arg('anos') ?? '').split(',').map(n => parseInt(n, 10)).filter(Boolean);

/** Campos fixos antes e depois de `objeto`, no cabeçalho de 14 colunas. */
const ANTES = 7;
const DEPOIS = 6;
const COLUNAS = 14;

interface Linha {
  orgao: string; origem: string; cod: string; parlamentar: string; partido: string;
  instrumento: string; beneficiario: string; objeto: string; tipo: string;
  funcao: string; municipio: string; empenhado: string; liquidado: string; pago: string;
}

/**
 * Divide uma linha do CSV, remontando o `objeto` quando ele foi partido.
 *
 * O portal não coloca aspas no campo `objeto`, e 153 linhas listam municípios
 * separados por ponto-e-vírgula ali dentro. Isso desloca todas as colunas
 * seguintes: o tipo vira "SUMARÉ", o valor empenhado vira "JABORANDI". Como a
 * quantidade de campos antes e depois do objeto é fixa, o conserto é exato —
 * tudo que sobrar no meio é o objeto.
 */
function partir(linha: string): Linha | null {
  let campos = linha.split(';');
  if (campos.length < COLUNAS) return null;          // truncada: não dá para confiar
  if (campos.length > COLUNAS) {
    const objeto = campos.slice(ANTES, campos.length - DEPOIS).join(';');
    campos = [...campos.slice(0, ANTES), objeto, ...campos.slice(-DEPOIS)];
  }
  const [orgao, origem, cod, parlamentar, partido, instrumento, beneficiario,
         objeto, tipo, funcao, municipio, empenhado, liquidado, pago] = campos;
  return { orgao, origem, cod, parlamentar, partido, instrumento, beneficiario,
           objeto, tipo, funcao, municipio, empenhado, liquidado, pago };
}

/**
 * Os valores vêm em CENTAVOS, com ponto decimal: "120000000.00" é R$ 1.200.000.
 * Lidos como reais, ficariam cem vezes maiores.
 */
function reais(v: string): number {
  const n = Number((v ?? '').trim());
  return Number.isFinite(n) ? n / 100 : 0;
}

/** O ano não é coluna: é o começo do código ("2026.047.77770"). */
function anoDoCodigo(cod: string): number | null {
  const a = parseInt(cod.slice(0, 4), 10);
  return a >= 2000 && a <= 2100 ? a : null;
}

function mapear(l: Linha): EmendaEstadualRow | null {
  const autor = l.parlamentar.trim();
  const cod = l.cod.trim();
  const ano = anoDoCodigo(cod);
  // Sem autor não é emenda parlamentar: 9.133 linhas da base (código com sete
  // dígitos no meio) vêm sem nome e ficam de fora.
  if (!autor || !ano || !cod) return null;
  if (ANOS.length > 0 && !ANOS.includes(ano)) return null;

  const orgao = l.orgao.trim();
  const empenhado = reais(l.empenhado);

  return {
    idPortal:       `SP-${ano}-${cod}`,
    ano,
    numero:         cod,
    // Qual instrumento: "Emenda LOA" ou "Transferência Voluntária". A tela de
    // emendas mostra isso como etiqueta e soma por grupo.
    tipo:           l.origem.trim() || l.tipo.trim() || undefined,
    funcao:         orgao || undefined,
    subfuncao:      l.funcao.trim() || undefined,
    area:           classificarArea(null, l.funcao.trim() || orgao || null),
    objeto:         l.objeto.trim() || undefined,
    valorProposto:  empenhado || undefined,
    valorEmpenhado: empenhado,
    valorPago:      reais(l.pago),
    uf:             'SP',
    municipioNome:  l.municipio.trim() || undefined,
    autorNome:      autor,
    autorCargo:     'DEPUTADO_ESTADUAL',
    autorPartido:   l.partido.trim() || undefined,
  };
}

async function main() {
  if (!fs.existsSync(ARQUIVO)) {
    console.error(`Arquivo não encontrado: ${ARQUIVO}`);
    console.error('Rode antes: npx tsx scripts/download-emendas-sp.ts');
    process.exit(1);
  }

  console.log(`🔄 Import SP (portal da transparência)${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`   arquivo: ${ARQUIVO}`);
  if (ANOS.length) console.log(`   anos: ${ANOS.join(', ')}`);

  // O portal publica em UTF-8. Lido como latin-1, "Transferência Voluntária"
  // vira "TransferÃªncia VoluntÃ¡ria" e vai assim para o banco e para a tela.
  // Conferido: o arquivo inteiro decodifica como UTF-8 sem um byte invalido.
  const texto = fs.readFileSync(ARQUIVO, 'utf8');
  const linhas = texto.split(/\r?\n/);
  const rows: EmendaEstadualRow[] = [];
  let quebradas = 0, truncadas = 0, ignoradas = 0;

  for (let i = 1; i < linhas.length; i++) {           // pula o cabeçalho
    const bruta = linhas[i];
    if (!bruta.trim()) continue;
    if (bruta.split(';').length > COLUNAS) quebradas++;
    const l = partir(bruta);
    if (!l) { truncadas++; continue; }
    const row = mapear(l);
    if (!row) { ignoradas++; continue; }
    rows.push(row);
  }

  console.log(`\n  ${linhas.length - 1} linhas lidas`);
  console.log(`  ${quebradas} com ponto-e-vírgula dentro do objeto — remontadas`);
  console.log(`  ${truncadas} truncadas — descartadas`);
  console.log(`  ${ignoradas} sem parlamentar ou fora dos anos — ignoradas`);
  console.log(`  ${rows.length} emendas a importar`);

  const porAno = new Map<number, number>();
  for (const r of rows) porAno.set(r.ano, (porAno.get(r.ano) ?? 0) + 1);
  console.log('  ' + [...porAno].sort().map(([a, n]) => `${a}: ${n}`).join('  ·  '));

  const porTipo = new Map<string, number>();
  for (const r of rows) {
    const k = r.tipo ?? 'sem instrumento';
    porTipo.set(k, (porTipo.get(k) ?? 0) + 1);
  }
  console.log('  ' + [...porTipo].map(([t, n]) => `${t}: ${n}`).join('  ·  '));

  if (rows.length === 0) { console.error('\nNada a importar.'); process.exit(1); }

  const prisma = buildPrisma();
  try {
    const res = await importarEmendas(prisma, 'SP', rows, { dryRun: DRY_RUN });
    console.log(`\n  gravadas: ${res.inseridas} | erros: ${res.erros} | parlamentares: ${res.parlamentares}`);

    // ── Limpeza: o que não veio nesta base sai ───────────────────────────
    //
    // Sem isto, as emendas trazidas do painel do Power BI ficariam no banco
    // para sempre. Só mexe nos ANOS que este import cobriu — anos de fora
    // continuam intocados.
    const anosImportados = [...porAno.keys()];
    const vieram = new Set(rows.map(r => r.idPortal));
    const existentes = await prisma.emendaParlamentar.findMany({
      where: { uf: 'SP', esfera: 'ESTADUAL', ano: { in: anosImportados } },
      select: { id: true, idPortal: true },
    });
    const sobrando = existentes.filter(e => !vieram.has(e.idPortal));

    console.log(`\n  no banco nesses anos: ${existentes.length}`);
    console.log(`  fora da base do portal: ${sobrando.length}`);

    if (sobrando.length > 0) {
      if (DRY_RUN) {
        console.log('  [dry-run] seriam apagadas. Exemplos:');
        for (const s of sobrando.slice(0, 5)) console.log(`    ${s.idPortal}`);
      } else {
        const LOTE = 500;
        for (let i = 0; i < sobrando.length; i += LOTE) {
          await prisma.emendaParlamentar.deleteMany({
            where: { id: { in: sobrando.slice(i, i + LOTE).map(s => s.id) } },
          });
        }
        console.log(`  ${sobrando.length} apagadas.`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  if (DRY_RUN) console.log('\n  [dry-run] nenhuma escrita realizada.');
}

main().catch(e => { console.error(e); process.exit(1); });
