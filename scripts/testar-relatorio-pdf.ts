/**
 * Teste do PDF dos relatórios da Gabi — layout e integridade dos dados.
 *
 *     npm run testar:pdf
 *
 * Existe porque os dois defeitos que o cliente encontrou não aparecem em
 * `tsc` nem em teste de função: um era a tabela espremida no pé da página,
 * com as linhas pintadas umas sobre as outras; o outro era o relatório sair
 * com 3 estados quando o pedido era "por cada estado". Os dois só se veem no
 * documento pronto — e não dá para conferir documento pronto no olho a cada
 * mudança.
 *
 * Como funciona: gera o PDF de verdade e **lê de volta a coordenada de cada
 * texto impresso**, acompanhando a pilha de matrizes do pdfkit. Com a posição
 * em mãos, "deformado" vira uma conta: duas linhas a menos de 12pt uma da
 * outra estão sobrepostas; cabeçalho sem nenhuma linha abaixo está órfão.
 *
 * Rode antes e depois de mexer em doc-pdf.tsx ou em tabela-ranking.ts.
 */
import React from 'react';
import zlib from 'zlib';
import { renderToBuffer } from '@react-pdf/renderer';
import { Document, Page, renderContent, docStyles as S } from '@/lib/agent/report/doc-pdf';
import { tabelaCompletaRanking } from '@/lib/agent/report/tabela-ranking';

// ─── Leitura do PDF ──────────────────────────────────────────────────────────
// O pdfkit não posiciona com Tm (é sempre o mesmo): a posição vem da pilha
// q / Q / cm. Então aqui se acompanha a transformação acumulada, como faria um
// leitor de PDF.

interface ItemTexto { x: number; y: number; t: string }

const IDENT = [1, 0, 0, 1, 0, 0];
const mult = (m: number[], n: number[]) => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];

const BARRA = String.fromCharCode(92);
const RE_ESCAPE = new RegExp(BARRA + BARRA + '([()' + BARRA + BARRA + '])', 'g');
const RE_TOKEN = new RegExp(
  '<[0-9A-Fa-f\\s]*>|\\((?:' + BARRA + BARRA + '.|[^()' + BARRA + BARRA + '])*\\)'
  + '|\\[|\\]|[-\\d.]+|[A-Za-z\'"*]+', 'g');

function decodificar(bruto: string): string {
  if (bruto.startsWith('<')) {
    const hex = bruto.slice(1, -1).replace(/\s/g, '');
    let s = '';
    for (let i = 0; i + 1 < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return s;
  }
  return bruto.slice(1, -1).replace(RE_ESCAPE, '$1');
}

function itensDoFluxo(conteudo: string): ItemTexto[] {
  const itens: ItemTexto[] = [];
  let ctm = IDENT.slice();
  const pilha: number[][] = [];
  let tm = IDENT.slice();
  let emTexto = false;
  let ops: number[] = [];
  let txt = '';

  for (const tk of conteudo.match(RE_TOKEN) ?? []) {
    if (/^[-\d.]+$/.test(tk)) { ops.push(parseFloat(tk)); continue; }
    if (tk.startsWith('<') || tk.startsWith('(')) { txt += decodificar(tk); continue; }
    if (tk === '[') { txt = ''; continue; }
    if (tk === ']') continue;

    switch (tk) {
      case 'q': pilha.push(ctm.slice()); break;
      case 'Q': ctm = pilha.pop() ?? IDENT.slice(); break;
      case 'cm': if (ops.length >= 6) ctm = mult(ops.slice(-6), ctm); break;
      case 'BT': emTexto = true; tm = IDENT.slice(); txt = ''; break;
      case 'ET': emTexto = false; break;
      case 'Tm': if (ops.length >= 6) tm = ops.slice(-6); break;
      case 'Tj':
      case 'TJ': {
        if (emTexto && txt.trim()) {
          const m = mult(tm, ctm);
          itens.push({ x: +m[4].toFixed(1), y: +m[5].toFixed(1), t: txt.trim() });
        }
        txt = '';
        break;
      }
    }
    ops = [];
  }
  return itens;
}

/** Uma lista de textos posicionados por página do documento. */
function paginasDoPdf(buf: Buffer): ItemTexto[][] {
  const paginas: ItemTexto[][] = [];
  let i = 0;
  while (true) {
    let ini = buf.indexOf('stream', i);
    // "endstream" também contém "stream": só interessa o que abre o fluxo.
    while (ini > 3 && buf.toString('latin1', ini - 3, ini) === 'end') ini = buf.indexOf('stream', ini + 6);
    if (ini === -1) break;
    let p = ini + 6;
    if (buf[p] === 13) p++;
    if (buf[p] === 10) p++;
    const fim = buf.indexOf('endstream', p);
    if (fim === -1) break;
    try {
      const c = zlib.inflateSync(buf.subarray(p, fim)).toString('latin1');
      if (c.includes('BT')) paginas.push(itensDoFluxo(c));
    } catch { /* fluxo de fonte ou imagem, não de conteúdo */ }
    i = fim + 9;
  }
  return paginas;
}

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

/** Marcadores de linha de tabela: a sigla na 1ª coluna, ou o "1º"/"2º"… */
const ehMarcador = (o: ItemTexto) => o.x < 120 && (UFS.includes(o.t) || /^\d{1,2}º$/.test(o.t));

interface Defeitos { sobrepostas: number; orfaos: number; noRodape: number }

function medir(buf: Buffer): Defeitos & { paginas: number; texto: string } {
  const paginas = paginasDoPdf(buf);
  let sobrepostas = 0, orfaos = 0, noRodape = 0;

  for (const itens of paginas) {
    const marcas = itens.filter(ehMarcador).sort((a, b) => b.y - a.y);

    // Uma linha destas tabelas tem ~20pt no mínimo. Menos de 12pt entre dois
    // marcadores só acontece se estiverem desenhados um sobre o outro.
    for (let i = 0; i + 1 < marcas.length; i++) {
      if (marcas[i].y - marcas[i + 1].y < 12) sobrepostas++;
    }

    // O rodapé é fixo no pé da página: texto abaixo de 34pt sai por cima dele.
    noRodape += marcas.filter(m => m.y < 34).length;

    // Cabeçalho de tabela sem nenhuma linha abaixo, na mesma página.
    for (const cab of itens.filter(o => o.t === 'UF' && o.x < 120)) {
      if (!marcas.some(m => m.y < cab.y - 1)) orfaos++;
    }
  }

  return { sobrepostas, orfaos, noRodape, paginas: paginas.length, texto: paginas.flat().map(o => o.t).join(' ') };
}

// ─── Relatório de testes ─────────────────────────────────────────────────────
let falhas = 0;
function conferir(nome: string, ok: boolean, detalhe = '') {
  if (!ok) falhas++;
  console.log(`   ${ok ? 'ok   ' : 'FALHA'} ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
}

const semDefeito = (d: Defeitos) => d.sobrepostas === 0 && d.orfaos === 0 && d.noRodape === 0;
const descrever = (d: Defeitos) => [
  d.sobrepostas ? `${d.sobrepostas} sobreposição` : '',
  d.orfaos ? `${d.orfaos} cabeçalho órfão` : '',
  d.noRodape ? `${d.noRodape} sobre o rodapé` : '',
].filter(Boolean).join(', ');

async function pdfDe(markdown: string): Promise<Buffer> {
  const doc = React.createElement(Document, null,
    React.createElement(Page, { size: 'A4', style: S.page }, ...renderContent(markdown)));
  return renderToBuffer(doc as any);
}

// ─── Dados de teste ──────────────────────────────────────────────────────────
// Nomes e votos com o comprimento dos reais: é o comprimento da célula que
// decide se a linha quebra em duas ou três, e é disso que o defeito depende.
const PARTIDOS = ['REPUBLICANOS','SOLIDARIEDADE','PODEMOS','PSDB','UNIAO','PL','PT','MDB','PSD','PP','REDE','DEM','PSB','PDT','PSC'];

const porEstadoCom = (n: number) => Object.fromEntries(UFS.map((uf, u) => [uf,
  Array.from({ length: n }, (_, i) => ({
    nomeUrna: `Wellington Fagundes ${uf}${i + 1}`,
    nome: `Wellington Fagundes ${uf}${i + 1}`,
    partido: PARTIDOS[(u + i) % PARTIDOS.length],
    totalVotos: 10_714_913 - u * 321_457 - i * 97_331,
    situacao: i === 0 ? 'ELEITO' : 'NAO ELEITO',
    ano: i % 2 === 0 ? '2022' : '2018',
  })),
]));

const PARAGRAFO =
  'A análise a seguir considera os votos apurados pelo Tribunal Superior Eleitoral em cada '
  + 'unidade da federação, somando os dois pleitos do período e ordenando os candidatos pelo '
  + 'total de votos nominais recebidos no estado.';

// ─── 1. Tabela larga não pode deformar, quebre a página onde quebrar ─────────
// O relatório do cliente quebrou num ponto específico. Como a Gabi escreve uma
// análise de tamanho diferente a cada pedido, o ponto de quebra muda — então a
// tabela enfrenta aqui todos os pontos possíveis.
async function suiteQuebraDePagina() {
  console.log('\n=== 1. Tabela por região em cada ponto de quebra de página ===');
  const rk = { porEstado: porEstadoCom(5), recorte: 'Senador · 2018 + 2022' };
  const anexo = tabelaCompletaRanking(rk, '')!;

  let ruins = 0;
  const posicoes = Array.from({ length: 22 }, (_, i) => i);
  for (const n of posicoes) {
    const md = Array.from({ length: n }, () => PARAGRAFO + '\n').join('\n') + anexo;
    const d = medir(await pdfDe(md));
    if (!semDefeito(d)) { ruins++; console.log(`      ponto ${n}: ${descrever(d)}`); }
  }
  conferir(`nenhuma deformação em ${posicoes.length} pontos de quebra`, ruins === 0,
    ruins ? `${ruins} com defeito` : '');
}

// ─── 2. Tabela maior que a página quebra sem perder linha ────────────────────
async function suiteTabelaGigante() {
  console.log('\n=== 2. Tabela maior que uma página ===');
  const N = 60;
  const md = [
    '| Município | Candidato | Votos | Ano |',
    '|---|---|---|---|',
    ...Array.from({ length: N }, (_, i) =>
      `| Municipio numero ${i + 1} | Fulano de Tal da Silva (PARTIDO) | ${(1_000_000 - i * 997).toLocaleString('pt-BR')} | 2022 |`),
  ].join('\n');

  const { texto, paginas } = medir(await pdfDe(md));
  const faltando = Array.from({ length: N }, (_, i) => i + 1)
    .filter(i => !texto.includes(`numero ${i} `) && !texto.includes(`numero ${i}`));
  conferir(`as ${N} linhas saem no documento`, faltando.length === 0,
    faltando.length ? `faltaram ${faltando.join(', ')}` : `${paginas} páginas`);
}

// ─── 3. O anexo traz tudo, em qualquer profundidade ──────────────────────────
// A ferramenta entrega até 15 por estado. Nenhuma colocação pode ser cortada
// para a tabela caber na largura da página — acima de 5, o anexo divide em
// faixas (1º ao 5º, 6º ao 10º…) em vez de encolher o dado.
async function suiteAnexoCompleto() {
  console.log('\n=== 3. Anexo com todos os estados, em qualquer profundidade ===');
  for (const n of [3, 5, 6, 10, 15]) {
    const anexo = tabelaCompletaRanking({ porEstado: porEstadoCom(n), recorte: 'Senador · 2018 + 2022' }, '');
    if (!anexo) { conferir(`${n} por estado`, false, 'anexo não gerado'); continue; }

    const d = medir(await pdfDe(anexo));
    const esperados = UFS.length * n;
    const faltando = UFS.flatMap(uf =>
      Array.from({ length: n }, (_, i) => `${uf}${i + 1}`).filter(m => !d.texto.includes(m)));

    conferir(
      `${String(n).padStart(2)} por estado: ${esperados} candidatos, sem deformação`,
      faltando.length === 0 && semDefeito(d),
      [faltando.length ? `${faltando.length} faltando` : '', descrever(d), `${d.paginas} páginas`]
        .filter(Boolean).join(', '),
    );
  }
}

// ─── 4. O anexo não repete o que a Gabi já escreveu ──────────────────────────
async function suiteSemDuplicar() {
  console.log('\n=== 4. Convivência com o texto da Gabi ===');
  const porEstado = porEstadoCom(5);

  const parcial = ['| UF | 1º |', '|---|---|', '| SP | Marcos Pontes |', '| RJ | Romário |'].join('\n');
  conferir('texto parcial: o anexo entra', tabelaCompletaRanking({ porEstado }, parcial) !== null);

  const completa = ['| UF | 1º |', '|---|---|', ...UFS.map(uf => `| ${uf} | alguém |`)].join('\n');
  conferir('texto já completo: o anexo não repete', tabelaCompletaRanking({ porEstado }, completa) === null);

  conferir('sem ranking no turno: nada é acrescentado', tabelaCompletaRanking(undefined, 'texto') === null);
}

async function main() {
  await suiteQuebraDePagina();
  await suiteTabelaGigante();
  await suiteAnexoCompleto();
  await suiteSemDuplicar();

  console.log(`\n${falhas === 0 ? '✓ Todos os testes passaram.' : `✗ ${falhas} falha(s).`}\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(2); });
