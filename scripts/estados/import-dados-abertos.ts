/**
 * Importa as emendas estaduais de ES, MG e PE dos portais de dados abertos
 * (CKAN) de cada governo — as três fontes que trazem deputado, município e
 * valores (validação de 21/10/2026; ver lib/emendas/estados-ativos.ts).
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/estados/import-dados-abertos.ts --uf ES [--anos 2025,2026] [--dry-run] [--forcar]
 *
 *   --uf       ES, MG ou PE (obrigatório)
 *   --anos     só esses anos (padrão: todos os que a fonte publica)
 *   --dry-run  baixa, confere e mostra os totais por ano; não grava
 *   --forcar   importa mesmo que os arquivos não tenham mudado desde a última vez
 *
 * Fontes:
 *   ES — dados.es.gov.br, "Emendas-Estaduais-{ano}.csv" (2021 em diante).
 *        Uma linha por emenda × instrumento × dotação: os valores se repetem
 *        entre linhas da mesma emenda (E0275 de 2025: o mesmo empenho de
 *        R$ 50.900 em três linhas) — soma-se o valor DISTINTO de cada campo,
 *        a mesma regra validada no import de SP.
 *   MG — dados.mg.gov.br, "Emendas Estaduais - Indicações": uma linha por
 *        indicação, 2023 em diante, com código IBGE. Inclui blocos e bancadas
 *        (gravados com cargo BANCADA). 2021–2022 não estão na fonte e ficam
 *        como estavam.
 *   PE — dados.pe.gov.br, "Tabela Completa PIX|DIRETA|GTV {ano}": uma linha por
 *        empenho (só 2026 em diante traz o deputado). Valores somados por
 *        empenho distinto; orçamento da emenda uma vez.
 *
 * O import APAGA, nos anos que cobre, as emendas estaduais da UF que não
 * vieram na fonte: as da importação manual de maio–julho tinham outro formato
 * de código e números errados (ES 2025 com o valor previsto no lugar do
 * empenhado: R$ 166,8 mi "empenhados" contra R$ 69,5 mi na fonte).
 *
 * Arquivo igual ao da última vez (data de modificação no portal) → o ano dele
 * não é reimportado. O estado fica em data/estados/.dados-abertos-estado.json.
 * Emenda com anotação de usuário nunca é apagada (só avisada no log).
 */
import fs from 'fs';
import path from 'path';
import { buildPrisma, importarEmendas, type EmendaEstadualRow } from './base-import-estadual';
import { classificarArea } from '../../lib/portal-transparencia';
import type { ParlamentarCargo } from '@prisma/client';

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}
const UF = (arg('uf') ?? '').toUpperCase();
const ANOS = (arg('anos') ?? '').split(',').map(n => parseInt(n, 10)).filter(Boolean);
const DRY_RUN = process.argv.includes('--dry-run');
const FORCAR = process.argv.includes('--forcar');
const ESTADO = path.join('data', 'estados', '.dados-abertos-estado.json');

interface Recurso { id: string; name: string; url: string; last_modified?: string; created?: string }
interface Fonte {
  portal: string;
  pacote: string;
  /** Recursos a baixar, com o ano de cada um. */
  escolher: (rs: Recurso[]) => { recurso: Recurso; ano?: number }[];
  /** Linhas do CSV → emendas (já agrupadas). */
  mapear: (arquivos: { recurso: Recurso; ano?: number; linhas: Record<string, string>[] }[]) => EmendaEstadualRow[];
}

// ─── Utilidades ───────────────────────────────────────────────────────────────
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function baixar(url: string): Promise<string> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(300_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const texto = buf.toString('utf8').replace(/^﻿/, '');
      if (texto.trimStart().startsWith('<')) throw new Error('veio uma página HTML no lugar do CSV');
      return texto;
    } catch (e: any) {
      if (tentativa >= 3) throw new Error(`${url}: ${e.message}`);
      await new Promise(r => setTimeout(r, 10_000 * tentativa));
    }
  }
}

/** CSV com ";" e aspas opcionais (os três portais publicam assim). */
function lerCsv(texto: string): Record<string, string>[] {
  const linhas: string[][] = [];
  let campo = '', linha: string[] = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ';') { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some(x => x !== '')) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo !== '' || linha.length) { linha.push(campo); if (linha.some(x => x !== '')) linhas.push(linha); }
  const [cab, ...resto] = linhas;
  return resto.map(l => Object.fromEntries(cab.map((h, i) => [h.trim(), (l[i] ?? '').trim()])));
}

const num = (v?: string) => {
  if (!v) return 0;
  const s = v.trim();
  // "50900,0000" (ES/MG) ou "100000.0" (PE)
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return Number.isFinite(n) ? n : 0;
};
/** Soma os valores DISTINTOS do campo nas linhas (repetição = mesma despesa). */
const somaDistintos = (ls: Record<string, string>[], campo: string) =>
  [...new Set(ls.map(l => l[campo]).filter(v => num(v) !== 0))].reduce((s, v) => s + num(v), 0);
const nomeProprio = (s: string) => s.trim().replace(/\s+/g, ' ');

// ─── Fontes ───────────────────────────────────────────────────────────────────
const FONTES: Record<string, Fonte> = {
  ES: {
    portal: 'https://dados.es.gov.br',
    pacote: 'portal-da-transparencia-emendas-parlamentares-do-estado',
    escolher: rs => rs.flatMap(r => {
      const m = r.name.match(/^Emendas-Estaduais-(\d{4})\.csv$/i);
      return m ? [{ recurso: r, ano: Number(m[1]) }] : [];
    }),
    mapear: arqs => arqs.flatMap(({ linhas }) => {
      const grupos = new Map<string, Record<string, string>[]>();
      for (const l of linhas) {
        if (!l.NumeroEmenda) continue;
        grupos.set(l.NumeroEmenda, [...(grupos.get(l.NumeroEmenda) ?? []), l]);
      }
      return [...grupos.values()].map((g): EmendaEstadualRow => {
        const l = g[0];
        const ano = Number(l.AnoEmenda);
        const numero = l.NumeroEmenda.split('/').pop()!.trim(); // "2025 / E0275" → "E0275"
        return {
          idPortal: `ES-${ano}-${numero}`,
          ano, numero,
          tipo: l.TipoEmenda || undefined,
          funcao: l.Funcao || undefined,
          subfuncao: l.SubFuncao || undefined,
          area: classificarArea(null, l.Funcao || null),
          objeto: l.ObjetoFinalidade || undefined,
          valorProposto: num(l.ValorPrevisto) || undefined,
          valorEmpenhado: somaDistintos(g, 'ValorEmpenho'),
          valorPago: somaDistintos(g, 'ValorPago'),
          uf: 'ES',
          municipioNome: l.Municipio || undefined,
          autorNome: nomeProprio(l.NomeAutor.replace(/^dep(\.|utad[oa])\s*/i, '')),
          autorCargo: 'DEPUTADO_ESTADUAL',
        };
      });
    }),
  },

  MG: {
    portal: 'https://dados.mg.gov.br',
    pacote: 'portal_emendas_estaduais',
    escolher: rs => rs.filter(r => /indica/i.test(r.name)).map(recurso => ({ recurso })),
    mapear: arqs => arqs.flatMap(({ linhas }) => linhas.flatMap((l): EmendaEstadualRow[] => {
      const ano = Number(l.ano_exercicio);
      if (!l.numero_indicacao || !ano || !l.responsavel) return [];
      const classe = (l.classificacao_resp_descricao || '').toUpperCase();
      const cargo: ParlamentarCargo = /BLOCO|BANCADA/.test(classe) ? 'BANCADA' : 'DEPUTADO_ESTADUAL';
      const ibge = (l.municipio_ibge || '').replace(/[,.]0+$/, '');
      return [{
        idPortal: `MG-${ano}-${l.numero_indicacao}`,
        ano, numero: l.numero_indicacao,
        tipo: l.tipo_indicacao || undefined,
        funcao: l.funcao_descricao || undefined,
        area: classificarArea(null, l.funcao_descricao || null),
        objeto: l.descricao_indicacao || undefined,
        valorProposto: num(l.valor_indicacao) || undefined,
        valorEmpenhado: num(l.valor_empenhado),
        valorPago: num(l.valor_pago),
        uf: 'MG',
        codigoIbge: /^\d{7}$/.test(ibge) ? ibge : undefined,
        municipioNome: l.municipio || undefined,
        autorNome: nomeProprio(l.responsavel),
        autorCargo: cargo,
        corrigirCargo: true,
        estagio: l.status_indicacao || undefined,
      }];
    })),
  },

  PE: {
    portal: 'https://dados.pe.gov.br',
    pacote: 'emendasparlamentaresestaduais',
    escolher: rs => rs.flatMap(r => {
      const m = r.name.match(/^Tabela Completa (PIX|DIRETA|GTV) (\d{4})$/i);
      return m ? [{ recurso: r, ano: Number(m[2]) }] : [];
    }),
    mapear: arqs => arqs.flatMap(({ recurso, ano, linhas }) => {
      const modalidade = recurso.name.match(/PIX|DIRETA|GTV/i)![0].toUpperCase();
      const rotulo = modalidade === 'PIX' ? 'Transferência especial (PIX)'
        : modalidade === 'DIRETA' ? 'Aplicação direta' : 'Transferência voluntária (GTV)';
      const grupos = new Map<string, Record<string, string>[]>();
      for (const l of linhas) {
        if (!l.codigo_alepe || !l.autor) continue;
        grupos.set(l.codigo_alepe, [...(grupos.get(l.codigo_alepe) ?? []), l]);
      }
      return [...grupos.values()].map((g): EmendaEstadualRow => {
        const l = g[0];
        // Uma linha por empenho: soma cada empenho uma vez (linha repetida
        // do mesmo empenho não conta duas).
        const porEmpenho = new Map<string, Record<string, string>>();
        g.forEach((x, i) => porEmpenho.set(x.numero_empenho || `sem-empenho-${i}`, x));
        const soma = (c: string) => [...porEmpenho.values()].reduce((s, x) => s + num(x[c]), 0);
        const a = Number(l.ano) || ano!;
        return {
          idPortal: `PE-${a}-${l.codigo_alepe}`,
          ano: a, numero: l.codigo_alepe,
          tipo: `${rotulo}${l.tipo ? ` · ${l.tipo.toLowerCase()}` : ''}`,
          funcao: l.tematica || undefined,
          area: classificarArea(null, l.tematica || null),
          objeto: l.objeto || l.resumo_objeto || undefined,
          valorProposto: num(l.orcamento_atual) || num(l.valor_dot_inicial) || undefined,
          valorEmpenhado: soma('valor_empenhado'),
          valorPago: soma('valor_pago') + soma('valor_rp_pago'),
          uf: 'PE',
          municipioNome: l.municipio && l.municipio !== '-' ? l.municipio : undefined,
          autorNome: nomeProprio(l.autor),
          autorCargo: 'DEPUTADO_ESTADUAL',
          estagio: l.status_documental_fisico || l.detalhamento_lc_573 || undefined,
        };
      });
    }),
  },
};

// ─── Principal ────────────────────────────────────────────────────────────────
async function main() {
  const fonte = FONTES[UF];
  if (!fonte) { console.error('Use --uf ES, MG ou PE'); process.exit(1); }
  console.log(`🔄 Import ${UF} — dados abertos (${fonte.portal})${DRY_RUN ? ' [DRY RUN]' : ''}`);

  const pac = await fetch(`${fonte.portal}/api/3/action/package_show?id=${fonte.pacote}`, {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000),
  }).then(r => r.json());
  if (!pac.success) throw new Error(`catálogo de ${UF} não respondeu`);
  let escolhidos = fonte.escolher(pac.result.resources as Recurso[]);
  if (ANOS.length && escolhidos.every(e => e.ano)) escolhidos = escolhidos.filter(e => ANOS.includes(e.ano!));
  if (escolhidos.length === 0) throw new Error(`nenhum arquivo de ${UF} encontrado no catálogo`);

  // Arquivo igual ao da última vez → nada a importar.
  let visto: Record<string, Record<string, string>> = {};
  try { visto = JSON.parse(fs.readFileSync(ESTADO, 'utf8')); } catch { /* primeira vez */ }
  const marca = (r: Recurso) => r.last_modified ?? r.created ?? '';
  const mudou = escolhidos.filter(e => visto[UF]?.[e.recurso.id] !== marca(e.recurso));
  console.log(`   ${escolhidos.length} arquivo(s) na fonte; ${mudou.length} mudaram desde a última importação.`);
  if (!FORCAR && !DRY_RUN) {
    if (mudou.length === 0) { console.log('   Nada mudou — não há o que importar.'); return; }
    // Arquivo por ano (ES, PE): só os anos que mudaram. Arquivo único (MG): tudo.
    if (escolhidos.every(e => e.ano)) escolhidos = mudou;
  }

  const arquivos = [];
  for (const e of escolhidos) {
    const linhas = lerCsv(await baixar(e.recurso.url));
    console.log(`   ✓ ${e.recurso.name}: ${linhas.length} linhas`);
    arquivos.push({ ...e, linhas });
  }

  let rows = fonte.mapear(arquivos);
  if (ANOS.length) rows = rows.filter(r => ANOS.includes(r.ano));

  // Conferência: quantidade e dinheiro por ano.
  const porAno = new Map<number, { n: number; prop: number; emp: number; pago: number; semMun: number }>();
  for (const r of rows) {
    const d = porAno.get(r.ano) ?? { n: 0, prop: 0, emp: 0, pago: 0, semMun: 0 };
    d.n++; d.prop += r.valorProposto ?? 0; d.emp += r.valorEmpenhado; d.pago += r.valorPago;
    if (!r.municipioNome && !r.codigoIbge) d.semMun++;
    porAno.set(r.ano, d);
  }
  const mi = (v: number) => (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  console.log('\n   ano   emendas   destinado(mi)   empenhado(mi)   pago(mi)   sem município');
  for (const [ano, d] of [...porAno].sort()) {
    console.log(`   ${ano}  ${String(d.n).padStart(8)}  ${mi(d.prop).padStart(14)}  ${mi(d.emp).padStart(14)}  ${mi(d.pago).padStart(9)}  ${String(d.semMun).padStart(14)}`);
  }
  console.log(`   autores: ${new Set(rows.map(r => r.autorNome)).size}`);
  if (rows.length === 0) throw new Error('nenhuma emenda mapeada — o formato da fonte pode ter mudado');

  const prisma = buildPrisma();
  try {
    const res = await importarEmendas(prisma, UF, rows, { dryRun: DRY_RUN, batchSize: 40 });
    console.log(`\n   processadas: ${res.inseridas} (iguais, sem regravar: ${res.iguais}) | erros: ${res.erros} | parlamentares novos: ${res.parlamentares}`);

    // ── Limpeza: emendas estaduais da UF, nesses anos, que não vieram ──────
    const anosImportados = [...porAno.keys()];
    const vieram = new Set(rows.map(r => r.idPortal));
    const existentes = await prisma.emendaParlamentar.findMany({
      where: { uf: UF, esfera: 'ESTADUAL', ano: { in: anosImportados } },
      select: { id: true, idPortal: true, _count: { select: { anotacoes: true } } },
    });
    const fora = existentes.filter(e => !vieram.has(e.idPortal));
    const anotadas = fora.filter(e => e._count.anotacoes > 0);
    if (anotadas.length) console.log(`   ${anotadas.length} emenda(s) fora da fonte têm anotação de usuário — mantidas: ${anotadas.map(a => a.idPortal).join(', ')}`);
    const sobrando = fora.filter(e => e._count.anotacoes === 0);
    console.log(`   no banco nesses anos: ${existentes.length}; fora da fonte: ${fora.length}`);
    if (sobrando.length > 0 && !DRY_RUN) {
      if (res.erros > rows.length * 0.05) {
        console.log('   Muitos erros na gravação — limpeza adiada para não apagar o que não foi regravado.');
      } else {
        for (let i = 0; i < sobrando.length; i += 500) {
          await prisma.emendaParlamentar.deleteMany({ where: { id: { in: sobrando.slice(i, i + 500).map(s => s.id) } } });
        }
        // Cadastros que ficaram sem emenda nenhuma (os da importação manual).
        const orfaos = await prisma.parlamentar.deleteMany({
          where: {
            uf: UF, cargo: { in: ['DEPUTADO_ESTADUAL', 'BANCADA'] },
            emendas: { none: {} }, transferenciasPix: { none: {} },
          },
        });
        console.log(`   ${sobrando.length} emendas antigas apagadas; ${orfaos.count} cadastros sem emenda removidos.`);
      }
    } else if (sobrando.length > 0) {
      console.log(`   [dry-run] seriam apagadas. Exemplos: ${sobrando.slice(0, 3).map(s => s.idPortal).join(', ')}`);
    }

    if (!DRY_RUN && res.erros === 0) {
      visto[UF] = { ...visto[UF], ...Object.fromEntries(escolhidos.map(e => [e.recurso.id, marca(e.recurso)])) };
      fs.mkdirSync(path.dirname(ESTADO), { recursive: true });
      fs.writeFileSync(ESTADO, JSON.stringify(visto, null, 1));
    }
    if (res.erros > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(e => { console.error('\nErro:', e.message ?? e); process.exit(1); });
