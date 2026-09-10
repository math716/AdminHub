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

/**
 * Soma os valores DISTINTOS de um campo dentro do grupo.
 *
 * O portal exporta um produto cartesiano: para um mesmo código, cada empenho
 * aparece cruzado com cada liquidação. Medido no código 2024.292.56581 —
 * 4.180 linhas, UM único instrumento jurídico, e os valores se repetindo em
 * todas as combinações. Somar as linhas daria R$ 94,9 milhões numa emenda que
 * não vale isso; só em 2024, o total do estado passaria de R$ 15 BILHÕES.
 *
 * Somar os valores distintos reconstrói o lado A do cruzamento. A limitação é
 * conhecida e vale registrar: dois empenhos de valor idêntico viram um só. Não
 * há no arquivo nada que os separe — nem o instrumento jurídico, que é o mesmo.
 */
function somaDistintos(grupo: Linha[], campo: (l: Linha) => string): number {
  const vistos = new Set<string>();
  for (const l of grupo) {
    const v = (campo(l) ?? '').trim();
    if (v) vistos.add(v);
  }
  let total = 0;
  for (const v of vistos) total += reais(v);
  return total;
}

function mapear(grupo: Linha[]): EmendaEstadualRow | null {
  const l = grupo[0];
  const autor = l.parlamentar.trim();
  const cod = l.cod.trim();
  const ano = anoDoCodigo(cod);
  // Sem autor não é emenda parlamentar: 9.133 linhas da base (código com sete
  // dígitos no meio) vêm sem nome e ficam de fora.
  if (!autor || !ano || !cod) return null;
  if (ANOS.length > 0 && !ANOS.includes(ano)) return null;

  const orgao = l.orgao.trim();
  const empenhado = somaDistintos(grupo, x => x.empenhado);

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
    valorPago:      somaDistintos(grupo, x => x.pago),
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
  let quebradas = 0, truncadas = 0;

  // Agrupa por código ANTES de mapear: uma emenda é um código, e o arquivo traz
  // várias linhas por código (ver somaDistintos). Sem agrupar, cada linha
  // viraria uma gravação no mesmo idPortal e o valor final seria o da última
  // linha lida — nem a soma, nem o maior: o que calhasse de vir por último.
  const porCodigo = new Map<string, Linha[]>();
  for (let i = 1; i < linhas.length; i++) {           // pula o cabeçalho
    const bruta = linhas[i];
    if (!bruta.trim()) continue;
    if (bruta.split(';').length > COLUNAS) quebradas++;
    const l = partir(bruta);
    if (!l) { truncadas++; continue; }
    const cod = l.cod.trim();
    if (!cod) { truncadas++; continue; }
    const grupo = porCodigo.get(cod);
    if (grupo) grupo.push(l); else porCodigo.set(cod, [l]);
  }

  const rows: EmendaEstadualRow[] = [];
  let ignoradas = 0;
  for (const grupo of porCodigo.values()) {
    const row = mapear(grupo);
    if (!row) { ignoradas++; continue; }
    rows.push(row);
  }

  console.log(`\n  ${linhas.length - 1} linhas lidas`);
  console.log(`  ${quebradas} com ponto-e-vírgula dentro do objeto — remontadas`);
  console.log(`  ${truncadas} truncadas — descartadas`);
  console.log(`  ${porCodigo.size} códigos distintos`);
  console.log(`  ${ignoradas} sem parlamentar ou fora dos anos — ignorados`);
  console.log(`  ${rows.length} emendas a importar`);

  // Contagem E dinheiro por ano: número de emendas sozinho não deixa ninguém
  // conferir contra o portal, que é o único jeito de saber se o import prestou.
  const porAno = new Map<number, { n: number; empenhado: number }>();
  for (const r of rows) {
    const d = porAno.get(r.ano) ?? { n: 0, empenhado: 0 };
    d.n++; d.empenhado += r.valorEmpenhado;
    porAno.set(r.ano, d);
  }
  const brl = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  console.log('');
  for (const [ano, d] of [...porAno].sort()) {
    console.log(`    ${ano}: ${String(d.n).padStart(6)} emendas   R$ ${brl(d.empenhado).padStart(15)}`
      + (d.empenhado === 0 ? '   ← o portal não publica execução deste ano' : ''));
  }

  const porTipo = new Map<string, number>();
  for (const r of rows) {
    const k = r.tipo ?? 'sem instrumento';
    porTipo.set(k, (porTipo.get(k) ?? 0) + 1);
  }
  console.log('');
  console.log('  ' + [...porTipo].map(([t, n]) => `${t}: ${n}`).join('  ·  '));

  if (rows.length === 0) { console.error('\nNada a importar.'); process.exit(1); }

  const prisma = buildPrisma();
  try {
    // 40 gravacoes em paralelo, e nao as 20 do padrao: a conexao e aberta com
    // connection_limit=50, entao havia folga sem uso. O gargalo aqui e a ida e
    // volta ate o banco, nao o processamento — dobrar a concorrencia corta o
    // tempo quase pela metade. Os 10 que sobram ficam para os upserts de
    // parlamentar, que acontecem no meio do lote.
    const res = await importarEmendas(prisma, 'SP', rows, { dryRun: DRY_RUN, batchSize: 40 });
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
