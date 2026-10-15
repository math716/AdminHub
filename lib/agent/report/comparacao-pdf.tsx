// PDF do comparador de candidatos e da evolução entre eleições (Mapa Eleitoral).
//
// A tela manda o que já calculou — colunas, linhas (todas, sem corte) e a cor
// de cada área do mapa — e aqui sai o documento no mesmo visual dos relatórios
// da Gabi: cabeçalho, resumo, mapa e a tabela completa.
//
// A tabela é montada direto, sem o conversor de markdown: aquele transforma
// toda tabela num gráfico de barras com outra paleta, e as cores não bateriam
// com as dos candidatos no mapa.

import React from 'react';
import { renderToBuffer, Svg, Path } from '@react-pdf/renderer';
import { Document, Page, Text, View, HeaderBand, DocFooter, docStyles as S, stripEmoji, C, type Pill } from '@/lib/agent/report/doc-pdf';
import { renderMapaPintado, type MapaResult } from '@/lib/agent/report/geo-map';

export interface EntradaPdfComparacao {
  /** 'vencedor': quem venceu em cada área; 'evolucao': antes × depois. */
  modo: 'vencedor' | 'evolucao';
  titulo: string;
  subtitulo?: string;
  /** Nomes das colunas de votos (candidatos, ou "2018 · Fulano" / "2022 · Fulano"). */
  colunas: string[];
  /** Cor de cada coluna (modo vencedor). */
  cores?: string[];
  rotuloArea: string;
  linhas: Array<{ nome: string; valores: number[] }>;
  mapa?: { tipo: 'brasil' | 'estado'; uf?: string; cores: Record<string, { cor: string; opacidade: number }> };
}

const COR_GANHO = '#16a34a';
const COR_PERDA = '#dc2626';
const fmt = (n: number) => n.toLocaleString('pt-BR');
const pct = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1).replace('.', ',')}%`;
const h = React.createElement;

function vencedorDe(valores: number[]): { i: number; diferenca: number; folga: number } | null {
  const total = valores.reduce((s, v) => s + v, 0);
  if (!total) return null;
  const ordem = valores.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const diferenca = ordem[0].v - (ordem[1]?.v ?? 0);
  return { i: diferenca === 0 ? -1 : ordem[0].i, diferenca, folga: diferenca / total };
}

function Resumo(e: EntradaPdfComparacao): React.ReactNode {
  const linhaResumo = (rotulo: string, valor: string, cor?: string) =>
    h(View, { style: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 } },
      h(Text, { style: { fontSize: 9, color: '#334155' } }, rotulo),
      h(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: cor ?? C.dark } }, valor));

  if (e.modo === 'evolucao') {
    const a = e.linhas.reduce((s, l) => s + (l.valores[0] ?? 0), 0);
    const b = e.linhas.reduce((s, l) => s + (l.valores[1] ?? 0), 0);
    const cresceu = e.linhas.filter(l => l.valores[1] > l.valores[0]).length;
    const caiu = e.linhas.filter(l => l.valores[1] < l.valores[0]).length;
    return h(View, { style: { marginTop: 10 } },
      h(Text, { style: S.h2 }, 'Resumo'),
      linhaResumo(e.colunas[0], fmt(a)),
      linhaResumo(e.colunas[1], fmt(b)),
      linhaResumo('Diferença', `${b - a > 0 ? '+' : ''}${fmt(b - a)}${a ? ` (${pct((b - a) / a)})` : ''}`, b >= a ? COR_GANHO : COR_PERDA),
      linhaResumo(`Áreas em que cresceu / caiu (${e.linhas.length} no total)`, `${cresceu} / ${caiu}`),
    );
  }
  const vit = e.colunas.map((_, i) => e.linhas.filter(l => vencedorDe(l.valores)?.i === i).length);
  return h(View, { style: { marginTop: 10 } },
    h(Text, { style: S.h2 }, `Resumo — ${e.linhas.length} áreas`),
    ...e.colunas.map((c, i) => linhaResumo(
      c,
      `${fmt(e.linhas.reduce((s, l) => s + (l.valores[i] ?? 0), 0))} votos · venceu em ${vit[i]}`,
      e.cores?.[i],
    )),
  );
}

function SecaoMapa(mapa: MapaResult): React.ReactNode {
  return h(View, { style: { marginTop: 12 }, wrap: false },
    h(Text, { style: S.h2 }, 'Mapa'),
    h(View, { style: { alignItems: 'center', paddingVertical: 8, borderWidth: 1, borderColor: C.border, borderRadius: 6 } },
      h(Svg, { width: mapa.width, height: mapa.height },
        ...mapa.paths.map((p, i) => h(Path, { key: i, d: p.d, fill: p.fill, stroke: C.white, strokeWidth: 0.3 })),
      ),
      h(View, { style: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 8 } },
        ...mapa.legend.map((l, i) => h(View, { key: i, style: { flexDirection: 'row', alignItems: 'center', gap: 4 } },
          h(View, { style: { width: 9, height: 9, borderRadius: 2, backgroundColor: l.cor } }),
          h(Text, { style: { fontSize: 8, color: C.gray } }, l.label),
        )),
      ),
    ),
  );
}

function Tabela(e: EntradaPdfComparacao): React.ReactNode {
  const ultima = e.modo === 'evolucao' ? 'Diferença' : 'Vantagem';
  const larguraArea = '34%';
  const larguraValor = `${(66 / (e.colunas.length + 1)).toFixed(2)}%`;
  const celula = (texto: string, largura: string, opcoes: { negrito?: boolean; cor?: string; esquerda?: boolean } = {}) =>
    h(Text, {
      style: {
        width: largura, fontSize: 7.5, paddingVertical: 2.5, paddingHorizontal: 3,
        textAlign: opcoes.esquerda ? 'left' : 'right', color: opcoes.cor ?? '#334155',
        fontFamily: opcoes.negrito ? 'Helvetica-Bold' : 'Helvetica',
      },
    }, texto);

  // Ordem: evolução pela diferença (maior ganho primeiro); vencedor pela área mais disputada primeiro.
  const ordenadas = [...e.linhas].sort((x, y) => e.modo === 'evolucao'
    ? (y.valores[1] - y.valores[0]) - (x.valores[1] - x.valores[0])
    : (vencedorDe(x.valores)?.folga ?? 2) - (vencedorDe(y.valores)?.folga ?? 2));

  return h(View, { style: { marginTop: 12 } },
    h(Text, { style: S.h2 }, `${e.rotuloArea === 'Cidade' ? 'Todas as cidades' : `Tabela completa — ${e.rotuloArea.toLowerCase()}`} (${e.linhas.length})`),
    // Cabeçalho repetido em cada página.
    h(View, { fixed: true, style: { flexDirection: 'row', backgroundColor: C.light, borderBottomWidth: 1, borderColor: C.border } },
      celula(e.rotuloArea, larguraArea, { negrito: true, esquerda: true }),
      ...e.colunas.map((c, i) => celula(stripEmoji(c), larguraValor, { negrito: true, cor: e.cores?.[i] })),
      celula(ultima, larguraValor, { negrito: true }),
    ),
    ...ordenadas.map((l, ri) => {
      let ultimaCelula: React.ReactNode;
      if (e.modo === 'evolucao') {
        const [a, b] = l.valores;
        const d = b - a;
        ultimaCelula = celula(`${d > 0 ? '+' : ''}${fmt(d)}${a ? ` (${pct(d / a)})` : ''}`, larguraValor, { negrito: true, cor: d > 0 ? COR_GANHO : d < 0 ? COR_PERDA : undefined });
      } else {
        const v = vencedorDe(l.valores);
        ultimaCelula = celula(!v ? '—' : v.i === -1 ? 'empate' : `${fmt(v.diferenca)} (${(v.folga * 100).toFixed(1).replace('.', ',')}%)`, larguraValor);
      }
      const venc = e.modo === 'vencedor' ? vencedorDe(l.valores)?.i : undefined;
      return h(View, { key: ri, wrap: false, style: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: C.border, backgroundColor: ri % 2 ? '#fafbfc' : C.white } },
        celula(stripEmoji(l.nome), larguraArea, { esquerda: true, cor: C.dark }),
        ...l.valores.map((v, i) => celula(fmt(v), larguraValor, { negrito: venc === i, cor: venc === i ? e.cores?.[i] : undefined })),
        ultimaCelula,
      );
    }),
  );
}

export async function montarPdfComparacao(e: EntradaPdfComparacao): Promise<Buffer> {
  const legenda = e.modo === 'evolucao'
    ? [{ label: 'Ganhou votos', cor: COR_GANHO }, { label: 'Perdeu votos', cor: COR_PERDA }]
    : e.colunas.map((c, i) => ({ label: c, cor: e.cores?.[i] ?? C.blue }));
  const mapa = e.mapa
    ? await renderMapaPintado({ uf: e.mapa.tipo === 'estado' ? e.mapa.uf : undefined, cores: e.mapa.cores, legenda, width: 380, height: 320 })
    : null;

  const pills: Pill[] = [
    { label: 'Tipo:', value: e.modo === 'evolucao' ? 'Evolução entre eleições' : 'Comparação de candidatos' },
    ...(e.subtitulo ? [{ label: 'Recorte:', value: e.subtitulo }] : []),
    { label: 'Emitido:', value: new Date().toLocaleDateString('pt-BR') },
  ];

  const doc = h(Document, null,
    h(Page, { size: 'A4', style: S.page },
      HeaderBand({ titulo: stripEmoji(e.titulo).slice(0, 90), pills }),
      Resumo(e),
      mapa ? SecaoMapa(mapa) : null,
      Tabela(e),
      DocFooter('votos'),
    ),
  );
  return renderToBuffer(doc as any) as Promise<Buffer>;
}
