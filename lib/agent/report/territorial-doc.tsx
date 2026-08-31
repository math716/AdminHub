// Montagem do PDF do Relatório Territorial do DF (por Região Administrativa).
// Layout: 1 página por deputado (cabeçalho + KPIs + pizza e mapa lado a lado +
// top 5 + leitura), e ao final o COMPARATIVO entre todos (tabela, mapa "quem
// domina cada RA", disputas territoriais e nota metodológica).

import { renderToBuffer, StyleSheet, Svg, Path, Image } from '@react-pdf/renderer';
import React from 'react';
import fs from 'fs';
import path from 'path';
import {
  Document, Page, Text, View,
  DocFooter, renderContent, docStyles as S, stripEmoji, C,
} from '@/lib/agent/report/doc-pdf';
import {
  renderMapaDF_RA, renderMapaDF_RAVencedor, tituloCaso,
  type MapaResult, type Vencedor,
} from '@/lib/agent/report/geo-map';
import {
  carregarTerritorial, metricasDeputado, resolverDeputados,
  type DeputadoMetrics, type TerritorialData,
} from '@/lib/agent/report/df-territorial';

const fmtInt = (n: number) => Math.round(n).toLocaleString('pt-BR');
const fmtPct = (n: number) => `${n.toFixed(1).replace('.', ',')}%`;

const PAD_TOP = 34, PAD_H = 34;

// Paleta da pizza (a última cor é reservada para "Outras RAs")
const PIE = ['#1d6fd8', '#0ea5e9', '#16a34a', '#f59e0b', '#a855f7', '#cbd5e1'];

// ─── Estilos locais ──────────────────────────────────────────────────────────
const T = StyleSheet.create({
  // Cabeçalho
  hero: {
    backgroundColor: '#0a1a33',
    marginTop: -PAD_TOP, marginHorizontal: -PAD_H, marginBottom: 12,
    paddingHorizontal: PAD_H, paddingTop: 20, paddingBottom: 16,
    position: 'relative',
  },
  heroAccent:  { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, flexDirection: 'row' },
  heroTop:     { flexDirection: 'row', alignItems: 'center' },
  heroBadge:   {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#1d6fd8',
    borderWidth: 1.5, borderColor: 'rgba(34,211,238,0.65)',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  heroBadgeTxt:{ fontFamily: 'Helvetica-Bold', fontSize: 14, color: C.white },
  heroLabel:   { fontSize: 7, color: C.cyan, fontFamily: 'Helvetica-Bold', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 3 },
  heroTitle:   { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.white, lineHeight: 1.2 },
  heroSub:     { fontSize: 7.5, color: 'rgba(226,232,240,0.6)', marginTop: 3 },
  heroChips:   { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 10 },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10,
    borderWidth: 0.8, borderColor: 'rgba(74,158,222,0.45)',
    paddingVertical: 3, paddingHorizontal: 9,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  chipLabel: { fontSize: 6.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.8 },
  chipValue: { fontSize: 7.5, color: C.white, fontFamily: 'Helvetica-Bold' },
  flagBox: {
    position: 'absolute', right: PAD_H, top: 18,
    borderWidth: 1, borderColor: 'rgba(34,211,238,0.55)', borderRadius: 4,
    padding: 2, backgroundColor: 'rgba(255,255,255,0.10)',
  },
  flagImg: { width: 74, height: 52, borderRadius: 2 },

  // KPIs
  kpiRow:   { flexDirection: 'row', gap: 8, marginBottom: 8 },
  kpiCard:  {
    flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 6,
    borderTopWidth: 2.5, borderTopColor: '#1d6fd8',
    padding: 8, backgroundColor: '#f8fafc',
  },
  kpiLabel: { fontSize: 6, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  kpiValue: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: C.dark },
  kpiSub:   { fontSize: 6.5, color: C.blue, marginTop: 2, fontFamily: 'Helvetica-Bold' },

  // Linha pizza + mapa
  vizRow:   { flexDirection: 'row', gap: 8, marginBottom: 8 },
  vizBox:   { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 9 },
  vizTitle: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.gray, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  pieWrap:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pieLegend:{ flex: 1, gap: 3 },
  pieItem:  { flexDirection: 'row', alignItems: 'center' },
  pieDot:   { width: 7, height: 7, borderRadius: 2, marginRight: 5 },
  pieLabel: { fontSize: 7, color: '#334155', flex: 1 },
  piePct:   { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.dark },
  mapWrap:  { alignItems: 'center' },
  mapLegend:{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 5 },
  mapLegItem:{ flexDirection: 'row', alignItems: 'center', gap: 3 },
  mapLegTxt:{ fontSize: 6.5, color: C.gray },
});

// ─── Cabeçalho hero (com a bandeira do estado) ───────────────────────────────
// A bandeira vem de public/flags/{UF}.png, embutida como buffer (o react-pdf
// trataria um caminho string como URL). Sem o arquivo, o cabeçalho sai limpo
// (fallback silencioso). Genérico para outras UFs no futuro.
export type BandeiraSrc = { data: Buffer; format: 'png' } | null;
export function caminhoBandeira(uf: string): BandeiraSrc {
  try {
    const fp = path.join(process.cwd(), 'public', 'flags', `${uf.toUpperCase()}.png`);
    return { data: fs.readFileSync(fp), format: 'png' };
  } catch {
    return null;
  }
}

function Hero({ titulo, sub, chips, iniciais, bandeira }: {
  titulo: string; sub: string;
  chips: { label: string; value: string }[];
  iniciais: string;
  bandeira: BandeiraSrc;
}): React.ReactNode {
  return React.createElement(View, { style: T.hero },
    // bandeira do estado (com moldura — o campo da bandeira do DF é branco)
    bandeira ? React.createElement(View, { style: T.flagBox },
      React.createElement(Image, { src: bandeira, style: T.flagImg }),
    ) : null,
    React.createElement(View, { style: T.heroTop },
      React.createElement(View, { style: T.heroBadge },
        React.createElement(Text, { style: T.heroBadgeTxt }, iniciais)),
      React.createElement(View, { style: { flex: 1, paddingRight: 120 } },
        React.createElement(Text, { style: T.heroLabel }, 'Relatório Territorial · Gabi IA · AdminHub'),
        React.createElement(Text, { style: T.heroTitle }, stripEmoji(titulo)),
        React.createElement(Text, { style: T.heroSub }, sub),
      ),
    ),
    React.createElement(View, { style: T.heroChips },
      ...chips.map((c, i) => React.createElement(View, { key: i, style: T.chip },
        React.createElement(Text, { style: T.chipLabel }, c.label),
        React.createElement(Text, { style: T.chipValue }, c.value),
      )),
    ),
    // linha de destaque (azul → ciano)
    React.createElement(View, { style: T.heroAccent },
      React.createElement(View, { style: { flex: 3, backgroundColor: '#1d6fd8' } }),
      React.createElement(View, { style: { flex: 2, backgroundColor: '#22d3ee' } }),
      React.createElement(View, { style: { flex: 1, backgroundColor: '#a78bfa' } }),
    ),
  );
}

function iniciaisDe(nome: string): string {
  const parts = stripEmoji(nome).trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'G';
}

// ─── KPIs ────────────────────────────────────────────────────────────────────
function KpiRow(m: DeputadoMetrics): React.ReactNode {
  const cards: { label: string; value: string; sub?: string }[] = [
    { label: 'RA mais votada', value: m.raMaisVotos ? tituloCaso(m.raMaisVotos.ra) : '—',
      sub: m.raMaisVotos ? `${fmtInt(m.raMaisVotos.votos)} votos` : undefined },
    { label: 'Maior domínio', value: m.raMaiorParticipacao ? tituloCaso(m.raMaiorParticipacao.ra) : '—',
      sub: m.raMaiorParticipacao ? `${fmtPct(m.raMaiorParticipacao.participacao)} dos votos da RA` : undefined },
    { label: 'Concentração top 3', value: fmtPct(m.concentracaoTop3), sub: 'da votação total' },
    { label: 'Perfil territorial', value: m.indiceLabel },
  ];
  return React.createElement(View, { style: T.kpiRow, wrap: false },
    ...cards.map((c, i) => React.createElement(View, { key: i, style: T.kpiCard },
      React.createElement(Text, { style: T.kpiLabel }, c.label),
      React.createElement(Text, { style: T.kpiValue }, stripEmoji(c.value)),
      c.sub ? React.createElement(Text, { style: T.kpiSub }, c.sub) : null,
    )),
  );
}

// ─── Pizza (donut) top 5 + Outras ────────────────────────────────────────────
function fp(n: number): string { return parseFloat(n.toFixed(2)).toString(); }
function donutSeg(cx: number, cy: number, R: number, r: number, sa: number, ea: number): string {
  const x1o = cx + R * Math.cos(sa), y1o = cy + R * Math.sin(sa);
  const x2o = cx + R * Math.cos(ea), y2o = cy + R * Math.sin(ea);
  const x1i = cx + r * Math.cos(ea), y1i = cy + r * Math.sin(ea);
  const x2i = cx + r * Math.cos(sa), y2i = cy + r * Math.sin(sa);
  const lg = ea - sa > Math.PI ? 1 : 0;
  return `M${fp(x1o)} ${fp(y1o)} A${fp(R)} ${fp(R)} 0 ${lg} 1 ${fp(x2o)} ${fp(y2o)} L${fp(x1i)} ${fp(y1i)} A${fp(r)} ${fp(r)} 0 ${lg} 0 ${fp(x2i)} ${fp(y2i)}Z`;
}

function PizzaRA(m: DeputadoMetrics): React.ReactNode {
  const top5 = m.top5;
  const somaTop = top5.reduce((s, r) => s + r.votos, 0);
  const outras = Math.max(0, m.votosDistribuidos - somaTop);
  const itens = [
    ...top5.map((r, i) => ({ label: tituloCaso(r.ra), valor: r.votos, cor: PIE[i % PIE.length] })),
    ...(outras > 0 ? [{ label: 'Outras RAs', valor: outras, cor: PIE[5] }] : []),
  ];
  const total = itens.reduce((s, it) => s + it.valor, 0) || 1;

  const size = 104, cx = size / 2, cy = size / 2, R = size * 0.47, r = size * 0.27;
  const GAP = 0.03;
  let ang = -Math.PI / 2;
  const paths = itens.map((it, i) => {
    const sweep = (it.valor / total) * 2 * Math.PI;
    const el = sweep > 0.005
      ? React.createElement(Path, { key: i, d: donutSeg(cx, cy, R, r, ang, ang + Math.max(sweep - GAP, 0.001)), fill: it.cor })
      : null;
    ang += sweep;
    return el;
  }).filter(Boolean) as React.ReactNode[];

  const legend = itens.map((it, i) => React.createElement(View, { key: i, style: T.pieItem },
    React.createElement(View, { style: { ...T.pieDot, backgroundColor: it.cor } }),
    React.createElement(Text, { style: T.pieLabel }, it.label.length > 20 ? it.label.slice(0, 18) + '…' : it.label),
    React.createElement(Text, { style: T.piePct }, fmtPct((it.valor / total) * 100)),
  ));

  return React.createElement(View, { style: T.vizBox },
    React.createElement(Text, { style: T.vizTitle }, 'Distribuição da votação por RA'),
    React.createElement(View, { style: T.pieWrap },
      React.createElement(Svg, { width: size, height: size }, ...paths),
      React.createElement(View, { style: T.pieLegend }, ...legend),
    ),
  );
}

// ─── Mapa (dentro do card, lado a lado com a pizza) ──────────────────────────
function MapaBox(mapa: MapaResult, titulo: string): React.ReactNode {
  return React.createElement(View, { style: T.vizBox },
    React.createElement(Text, { style: T.vizTitle }, titulo),
    React.createElement(View, { style: T.mapWrap },
      React.createElement(Svg, { width: mapa.width, height: mapa.height },
        ...mapa.paths.map((p, i) => React.createElement(Path, { key: i, d: p.d, fill: p.fill, stroke: C.white, strokeWidth: 0.4 })),
      ),
      mapa.legend.length > 0 ? React.createElement(View, { style: T.mapLegend },
        ...mapa.legend.map((l, i) => React.createElement(View, { key: i, style: T.mapLegItem },
          React.createElement(View, { style: { width: 7, height: 7, borderRadius: 2, backgroundColor: l.cor } }),
          React.createElement(Text, { style: T.mapLegTxt }, l.label),
        )),
      ) : null,
    ),
  );
}

// ─── Tabela top 5 (manual — sem gráfico automático) ──────────────────────────
function TabelaTop5(m: DeputadoMetrics): React.ReactNode {
  const headers = ['Região Administrativa', 'Votos', 'Concentração', 'Domínio na RA'];
  const flexes  = [1.8, 1, 1, 1];
  return React.createElement(View, { style: S.tableWrap },
    React.createElement(View, { style: S.tableRow, wrap: false, minPresenceAhead: 48 },
      ...headers.map((h, i) => React.createElement(View, { key: i, style: { ...S.tableHdrCell, flex: flexes[i] } },
        React.createElement(Text, { style: S.tableHdrText }, h)))),
    ...m.top5.map((r, ri) => React.createElement(View, {
      key: ri, wrap: false,
      style: [ri === m.top5.length - 1 ? S.tableRowLast : S.tableRow, ri % 2 === 1 ? S.tableRowAlt : {}],
    },
      React.createElement(View, { style: { ...S.tableCell, flex: flexes[0] } },
        React.createElement(Text, { style: S.tableCellBold }, `${ri + 1}º  ${tituloCaso(r.ra)}`)),
      React.createElement(View, { style: { ...S.tableCell, flex: flexes[1] } },
        React.createElement(Text, { style: S.tableCellText }, fmtInt(r.votos))),
      React.createElement(View, { style: { ...S.tableCell, flex: flexes[2] } },
        React.createElement(Text, { style: S.tableCellText }, fmtPct(r.concentracao))),
      React.createElement(View, { style: { ...S.tableCell, flex: flexes[3] } },
        React.createElement(Text, { style: S.tableCellText }, fmtPct(r.participacao))),
    )),
  );
}

// ─── Leitura estratégica (texto) ─────────────────────────────────────────────
function leituraDeputado(m: DeputadoMetrics): string {
  const fracas  = m.regioesFracas.map(r => tituloCaso(r.ra)).join(', ');
  const reduto  = m.raMaisVotos ? tituloCaso(m.raMaisVotos.ra) : '—';
  const dominio = m.raMaiorParticipacao ? tituloCaso(m.raMaiorParticipacao.ra) : '—';
  return [
    '### Leitura territorial',
    '',
    `O maior reduto de **${tituloCaso(m.nomeUrna)}** é **${reduto}**` +
      (m.raMaisVotos ? ` (${fmtInt(m.raMaisVotos.votos)} votos, ${fmtPct(m.raMaisVotos.concentracao)} da votação)` : '') +
      `. Em força proporcional — a fatia dos votos da região que é dele — destaca-se **${dominio}**` +
      (m.raMaiorParticipacao ? ` (${fmtPct(m.raMaiorParticipacao.participacao)} dos votos locais)` : '') +
      (dominio !== reduto ? ' — sinal de que o reduto absoluto reflete também o tamanho do eleitorado, não apenas domínio.' : ' — reduto absoluto e proporcional coincidem, caracterizando domínio real do território.'),
    '',
    `Os três maiores redutos somam **${fmtPct(m.concentracaoTop3)}** da votação — perfil **${m.indiceLabel.toLowerCase()}**. ` +
      `Menor presença: ${fracas}. Total: **${fmtInt(m.totalVotos)}** votos em ${Object.keys(m.votosPorRA).length} RAs.`,
  ].join('\n');
}

// ─── Página por deputado ──────────────────────────────────────────────────────
function PaginaDeputado({ m, mapa, bandeira, ano, cargo }: {
  m: DeputadoMetrics; mapa: MapaResult | null; bandeira: BandeiraSrc; ano: number; cargo: string;
}): React.ReactNode {
  const chips = [
    { label: 'Cargo', value: cargo },
    { label: 'Ano', value: String(ano) },
    ...(m.partido ? [{ label: 'Partido', value: m.partido }] : []),
    { label: 'Votos', value: fmtInt(m.totalVotos) },
  ];
  return React.createElement(Page, { size: 'A4', style: S.page },
    Hero({
      titulo: tituloCaso(m.nomeUrna),
      sub: 'Análise territorial por Região Administrativa — Distrito Federal',
      chips, iniciais: iniciaisDe(m.nomeUrna), bandeira,
    }),
    KpiRow(m),
    React.createElement(View, { style: T.vizRow, wrap: false },
      PizzaRA(m),
      mapa ? MapaBox(mapa, 'Mapa do DF — intensidade de votos') : null,
    ),
    TabelaTop5(m),
    ...renderContent(leituraDeputado(m)),
    DocFooter('votos'),
  );
}

// ─── Comparativo final ────────────────────────────────────────────────────────
function TabelaComparativa(ms: DeputadoMetrics[]): React.ReactNode {
  const headers = ['Deputado', 'Partido', 'Votos', 'Principal reduto', 'Maior domínio', 'Perfil'];
  const flexes  = [1.7, 0.9, 0.9, 1.3, 1.3, 1.2];
  const ordenados = [...ms].sort((a, b) => b.totalVotos - a.totalVotos);
  return React.createElement(View, { style: S.tableWrap },
    React.createElement(View, { style: S.tableRow, wrap: false, minPresenceAhead: 48 },
      ...headers.map((h, i) => React.createElement(View, { key: i, style: { ...S.tableHdrCell, flex: flexes[i] } },
        React.createElement(Text, { style: S.tableHdrText }, h)))),
    ...ordenados.map((m, ri) => React.createElement(View, {
      key: ri, wrap: false,
      style: [ri === ordenados.length - 1 ? S.tableRowLast : S.tableRow, ri % 2 === 1 ? S.tableRowAlt : {}],
    },
      React.createElement(View, { style: { ...S.tableCell, flex: flexes[0] } },
        React.createElement(Text, { style: S.tableCellBold }, tituloCaso(m.nomeUrna))),
      React.createElement(View, { style: { ...S.tableCell, flex: flexes[1] } },
        React.createElement(Text, { style: S.tableCellText }, m.partido)),
      React.createElement(View, { style: { ...S.tableCell, flex: flexes[2] } },
        React.createElement(Text, { style: S.tableCellText }, fmtInt(m.totalVotos))),
      React.createElement(View, { style: { ...S.tableCell, flex: flexes[3] } },
        React.createElement(Text, { style: S.tableCellText }, m.raMaisVotos ? tituloCaso(m.raMaisVotos.ra) : '—')),
      React.createElement(View, { style: { ...S.tableCell, flex: flexes[4] } },
        React.createElement(Text, { style: S.tableCellText },
          m.raMaiorParticipacao ? `${tituloCaso(m.raMaiorParticipacao.ra)} (${fmtPct(m.raMaiorParticipacao.participacao)})` : '—')),
      React.createElement(View, { style: { ...S.tableCell, flex: flexes[5] } },
        React.createElement(Text, { style: S.tableCellText }, m.indiceLabel)),
    )),
  );
}

function textoDisputas(ms: DeputadoMetrics[]): string {
  // RAs que são o reduto principal de 2+ deputados = disputa direta
  const porReduto = new Map<string, string[]>();
  for (const m of ms) {
    if (!m.raMaisVotos) continue;
    const ra = m.raMaisVotos.ra;
    porReduto.set(ra, [...(porReduto.get(ra) ?? []), tituloCaso(m.nomeUrna)]);
  }
  const disputadas = [...porReduto.entries()].filter(([, deps]) => deps.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);
  const exclusivas = [...porReduto.entries()].filter(([, deps]) => deps.length === 1);

  const linhas: string[] = ['### Disputas territoriais', ''];
  if (disputadas.length > 0) {
    for (const [ra, deps] of disputadas) {
      linhas.push(`- **${tituloCaso(ra)}** — reduto principal de ${deps.length} deputados: ${deps.join(', ')} (disputa direta pelo mesmo território).`);
    }
  } else {
    linhas.push('- Nenhuma RA é reduto principal de mais de um deputado do grupo.');
  }
  if (exclusivas.length > 0) {
    linhas.push('', `Redutos exclusivos (um único deputado do grupo como líder): ${exclusivas.map(([ra, deps]) => `**${tituloCaso(ra)}** (${deps[0]})`).join('; ')}.`);
  }
  return linhas.join('\n');
}

function notaMetodologica(faltantes: string[]): string {
  const linhas = [
    '### Nota metodológica e transparência',
    '',
    '- Fonte: resultados oficiais do TSE, apurados por zona eleitoral. Os votos de cada zona foram distribuídos entre as Regiões Administrativas pela localização dos locais de votação (georreferenciamento), proporcionalmente ao número de locais de cada zona em cada RA.',
    '- A apuração oficial vai até o nível de zona/seção — o detalhamento por RA é uma estimativa geográfica de alta fidelidade, adequada para leitura estratégica.',
    '- "Domínio" = percentual dos votos válidos do cargo naquela RA que pertencem ao deputado (força proporcional). Evita tratar regiões populosas automaticamente como redutos.',
  ];
  if (faltantes.length > 0) {
    linhas.push(`- Não localizados na base eleitoral consultada: **${faltantes.join(', ')}** — verifique a grafia do nome de urna.`);
  }
  return linhas.join('\n');
}

function PaginasComparativo({ ms, mapa, bandeira, ano, cargo, faltantes, mesmaEleicao = true }: {
  ms: DeputadoMetrics[]; mapa: MapaResult | null; bandeira: BandeiraSrc;
  ano: number | string; cargo: string; faltantes: string[]; mesmaEleicao?: boolean;
}): React.ReactNode {
  const chips = [
    { label: 'Parlamentares', value: String(ms.length) },
    { label: 'Cargo', value: cargo },
    { label: mesmaEleicao ? 'Ano' : 'Eleições', value: String(ano) },
  ];
  return React.createElement(Page, { size: 'A4', style: S.page },
    Hero({
      titulo: 'Comparativo Territorial',
      sub: 'Redutos, domínio proporcional e disputas entre os parlamentares analisados',
      chips, iniciais: 'CT', bandeira,
    }),
    mapa ? React.createElement(View, { wrap: false, style: { marginBottom: 8 } },
      MapaBox(mapa, 'Quem domina cada Região Administrativa (mais votos na RA, entre os analisados)'),
    ) : null,
    ...(mesmaEleicao ? [] : renderContent(
      `**Leitura comparativa entre eleições diferentes.** Os parlamentares deste relatório foram `
      + `eleitos em anos distintos (${ano}) — no Senado isso é a regra, porque a renovação é `
      + `alternada. Cada um disputou contra concorrentes diferentes, com eleitorado e contexto `
      + `próprios, então os votos absolutos não são diretamente comparáveis. O que se compara com `
      + `segurança é o **padrão territorial de cada um**: onde concentra, onde é fraco e o grau de `
      + `dispersão pelas Regiões Administrativas.\n`,
    )),
    ...renderContent(textoDisputas(ms)),
    React.createElement(Text, { style: S.h3 }, 'Quadro comparativo'),
    TabelaComparativa(ms),
    ...renderContent(notaMetodologica(faltantes)),
    DocFooter('votos'),
  );
}

// ─── Página de aviso (nenhum deputado encontrado) ─────────────────────────────
function PaginaVazia(faltantes: string[], bandeira: BandeiraSrc): React.ReactNode {
  return React.createElement(Page, { size: 'A4', style: S.page },
    Hero({ titulo: 'Relatório Territorial do DF', sub: 'Distrito Federal — por Região Administrativa', chips: [], iniciais: 'DF', bandeira }),
    ...renderContent(
      'Não foi possível localizar os deputados informados na base eleitoral do DF.\n\n' +
      (faltantes.length ? `Nomes consultados: ${faltantes.join(', ')}.\n\n` : '') +
      'Verifique a grafia como aparece na urna e tente novamente.',
    ),
    DocFooter('votos'),
  );
}

// ─── Builder principal: nomes → Buffer do PDF ─────────────────────────────────
export async function montarRelatorioTerritorial(params: {
  ano: number; uf: string; cargo: string; nomes: string[];
  /**
   * Eleições adicionais a varrer com os nomes que a principal não localizou.
   * O Senado renova de forma alternada (1/3 e 2/3), então os 3 senadores em
   * exercício vêm de DUAS eleições — um relatório da bancada cruza 2018 e 2022.
   */
  tambemEm?: Array<{ ano: number; cargo?: string }>;
}): Promise<Buffer> {
  const { ano, uf, cargo, nomes } = params;

  // bandeira do estado no cabeçalho (public/flags/{UF}.png)
  const bandeira = caminhoBandeira(uf);

  const lotes = [
    { ano, cargo },
    ...(params.tambemEm ?? []).map(t => ({ ano: t.ano, cargo: t.cargo ?? cargo })),
  ];

  const paginas: React.ReactNode[] = [];
  const metricas: DeputadoMetrics[] = [];
  const anosUsados = new Set<number>();
  let faltantes: string[] = nomes;

  for (const lote of lotes) {
    if (faltantes.length === 0) break;
    const territorial: TerritorialData | null = carregarTerritorial(lote.ano, uf, lote.cargo);
    if (!territorial) continue;

    const res = resolverDeputados(faltantes, lote.ano, uf, lote.cargo);
    faltantes = res.faltantes;

    for (const { cand } of res.encontrados) {
      const votosRA = territorial.votosPorCand.get(cand.id) ?? {};
      const m = metricasDeputado(cand, votosRA, territorial.totalPorRA);
      metricas.push(m);
      anosUsados.add(lote.ano);
      const mapa = await renderMapaDF_RA({ valores: votosRA, width: 225, height: 170 });
      paginas.push(PaginaDeputado({ m, mapa, bandeira, ano: lote.ano, cargo: lote.cargo }));
    }
  }

  // Comparativo final (2+ parlamentares): vencedor por RA entre os analisados.
  // Com eleições diferentes na mesma lista o mapa "quem domina" mentiria — são
  // disputas distintas, com eleitorado e concorrentes distintos —, então ali
  // fica só o quadro comparativo, com o ano de cada um.
  if (metricas.length >= 2) {
    const mesmaEleicao = anosUsados.size === 1;
    let mapaVencedor: MapaResult | null = null;
    if (mesmaEleicao) {
      const winners: Record<string, Vencedor> = {};
      for (const m of metricas) {
        for (const [ra, votos] of Object.entries(m.votosPorRA)) {
          const atual = winners[ra] as (Vencedor & { votos?: number }) | undefined;
          if (!atual || votos > (atual.votos ?? 0)) {
            winners[ra] = { candidato: m.nomeUrna, partido: m.partido, votos } as any;
          }
        }
      }
      mapaVencedor = await renderMapaDF_RAVencedor({ winners, width: 275, height: 210 });
    }
    const anosLabel = [...anosUsados].sort().join(' e ');
    paginas.push(PaginasComparativo({
      ms: metricas, mapa: mapaVencedor, bandeira,
      ano: anosLabel, cargo, faltantes, mesmaEleicao,
    }));
  }

  if (paginas.length === 0) paginas.push(PaginaVazia(faltantes, bandeira));

  return renderToBuffer(React.createElement(Document, null, ...paginas) as any) as unknown as Buffer;
}
