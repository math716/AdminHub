'use client';

import { useState } from 'react';
import { useTheme } from 'next-themes';
import {
  PieChart, Pie, Cell,
  BarChart, Bar, LabelList,
  LineChart, Line,
  XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { FileDown, Map, BarChart2, Loader2, MapPinned } from 'lucide-react';
import Link from 'next/link';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Visualizacao {
  tipo: 'barras' | 'donut' | 'serie_temporal' | 'cards_kpi' | 'tabela';
  titulo?: string;
  dados: any;
}

// ─── Cores e utilitários ──────────────────────────────────────────────────────

const COLORS = ['#4a9ede', '#22d3ee', '#a78bfa', '#34d399', '#f87171', '#fbbf24', '#fb923c', '#e879f9'];

// Paleta que se adapta ao tema (claro/escuro)
function paleta(isDark: boolean) {
  return isDark
    ? {
        cardBg: 'rgba(10,18,35,0.9)', cardBorder: 'rgba(74,158,222,0.22)',
        headBg: 'rgba(74,158,222,0.06)', headBorder: 'rgba(74,158,222,0.12)',
        divider: 'rgba(74,158,222,0.10)', rowBorder: 'rgba(74,158,222,0.06)',
        title: '#8296b8', label: '#e2e8f0', muted: '#94a3b8', axis: '#94a3b8',
        track: 'rgba(255,255,255,0.08)', tooltipBg: '#0d1b2a', tooltipText: '#e2e8f0',
        kpiBg: 'rgba(74,158,222,0.08)', kpiBorder: 'rgba(74,158,222,0.12)',
        pillBg: 'rgba(74,158,222,0.15)', pillText: '#4a9ede',
        btnText: '#94a3b8', btnBorder: 'rgba(74,158,222,0.18)',
        tableHead: '#4a9ede', tableBorder: 'rgba(74,158,222,0.2)',
      }
    : {
        cardBg: '#f8fafc', cardBorder: '#e2e8f0',
        headBg: '#f1f5f9', headBorder: '#e2e8f0',
        divider: '#e2e8f0', rowBorder: '#eef2f7',
        title: '#64748b', label: '#0f172a', muted: '#475569', axis: '#64748b',
        track: 'rgba(15,23,42,0.08)', tooltipBg: '#ffffff', tooltipText: '#0f172a',
        kpiBg: '#eef4fb', kpiBorder: '#dbe6f2',
        pillBg: 'rgba(29,111,216,0.12)', pillText: '#1d6fd8',
        btnText: '#475569', btnBorder: '#cbd5e1',
        tableHead: '#1d6fd8', tableBorder: '#dbe6f2',
      };
}
type Paleta = ReturnType<typeof paleta>;

const tooltipFor = (t: Paleta) => ({
  background: t.tooltipBg, border: `1px solid ${t.cardBorder}`,
  borderRadius: 8, fontSize: 11, color: t.tooltipText,
});

function fmtMoney(val: number): string {
  if (val >= 1_000_000_000) return `R$ ${(val / 1_000_000_000).toFixed(1).replace('.', ',')}B`;
  if (val >= 1_000_000)     return `R$ ${(val / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (val >= 1_000)         return `R$ ${(val / 1_000).toFixed(0)}K`;
  return `R$ ${val.toLocaleString('pt-BR')}`;
}

// KPI vem do modelo como { valor, unidade } — o valor pode ser número cru
// (ex.: 176207634) e a unidade "R$". Formata em pt-BR e trata moeda como
// prefixo, senão sai "176207634 R$".
function fmtKpi(valor: any, unidade?: string): { texto: string; sufixo?: string } {
  const ehMoeda = !!unidade && /^R\$|BRL|reais/i.test(unidade.trim());
  const num = typeof valor === 'number'
    ? valor
    : (typeof valor === 'string' && /^-?[\d.,]+$/.test(valor.trim())
        ? Number(valor.replace(/\./g, '').replace(',', '.'))
        : NaN);

  if (!isNaN(num) && isFinite(num)) {
    if (ehMoeda) return { texto: fmtMoney(num) };
    return { texto: fmtCount(num), sufixo: unidade };
  }
  return { texto: String(valor ?? ''), sufixo: unidade };
}

function fmtCount(val: number): string {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1).replace('.', ',')}B`;
  if (val >= 1_000_000)     return `${(val / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (val >= 1_000)         return `${(val / 1_000).toFixed(0)}K`;
  return val.toLocaleString('pt-BR');
}

// ─── Donut panel ──────────────────────────────────────────────────────────────

function DonutPanel({ vis, isMoney, t }: { vis: Visualizacao; isMoney: boolean; t: Paleta }) {
  const items = vis.dados?.itens ?? [];
  const total = items.reduce((s: number, it: any) => s + (it.valor ?? 0), 0);
  const fmt = isMoney ? fmtMoney : fmtCount;

  return (
    <div style={{ width: '44%' }}>
      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={items} dataKey="valor" nameKey="label" cx="50%" cy="50%" innerRadius="38%" outerRadius="70%" paddingAngle={2}>
              {items.map((_: any, i: number) => (
                <Cell key={i} fill={items[i]?.cor || COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipFor(t)} formatter={(v: any) => [fmt(v), '']} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2 px-2 mt-1">
        {items.map((item: any, i: number) => {
          const pct = total > 0 ? ((item.valor / total) * 100).toFixed(1) : '0';
          const color = item.cor || COLORS[i % COLORS.length];
          return (
            <div key={i}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="flex-1 text-[10px] truncate" style={{ color: t.label }}>{item.label}</span>
                <span className="text-[10px] font-bold flex-shrink-0 ml-1" style={{ color }}>{pct}%</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: t.track }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
              </div>
              <p className="text-[9px] mt-0.5 text-right" style={{ color: t.muted }}>{fmt(item.valor)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Bar panel ────────────────────────────────────────────────────────────────

// "claudioCastro" / "cláudio_castro" → "Cláudio Castro"
function pretty(k: string): string {
  return k
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function BarPanel({ vis, isMoney, t }: { vis: Visualizacao; isMoney: boolean; t: Paleta }) {
  const allItems = vis.dados?.itens ?? [];
  const fmt = isMoney ? fmtMoney : fmtCount;

  const barKeys: string[] = (() => {
    if (!allItems.length) return ['valor'];
    const keys = Object.keys(allItems[0]).filter(k => k !== 'label' && k !== 'cor' && typeof allItems[0][k] === 'number');
    return keys.length > 0 ? keys : ['valor'];
  })();
  const isMulti = barKeys.length > 1;
  // Menos barras quando há várias séries (comparação), para não amontoar.
  const items = allItems.slice(0, isMulti ? 6 : 8);

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={items} margin={{ top: 20, right: 10, left: 16, bottom: 8 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 8, fill: t.axis }}
              interval={0}
              angle={-32}
              textAnchor="end"
              height={54}
              tickMargin={4}
              tickFormatter={(v: string) => v.length > 13 ? v.slice(0, 11) + '…' : v}
            />
            <YAxis hide />
            <Tooltip contentStyle={tooltipFor(t)} formatter={(v: any, n: any) => [fmt(v), isMulti ? n : '']} />
            {isMulti && (
              <Legend wrapperStyle={{ fontSize: 9, color: t.muted, paddingTop: 4 }} />
            )}
            {barKeys.map((key, ki) => (
              <Bar key={key} dataKey={key} name={pretty(key)} fill={COLORS[ki % COLORS.length]} radius={[4, 4, 0, 0]}>
                {/* Rótulos de valor só quando há UMA série — em comparações eles se empilham */}
                {!isMulti && (
                  <LabelList
                    dataKey={key}
                    position="top"
                    formatter={(v: any) => typeof v === 'number' ? fmtCount(v) : v}
                    style={{ fontSize: 8, fill: t.muted }}
                  />
                )}
                {!isMulti && items.map((_: any, i: number) => (
                  <Cell key={i} fill={items[i]?.cor || COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Serie temporal panel ─────────────────────────────────────────────────────

function SeriePanel({ vis, isMoney, t }: { vis: Visualizacao; isMoney: boolean; t: Paleta }) {
  const fmt = isMoney ? fmtMoney : fmtCount;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={vis.dados?.pontos ?? []} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
            <XAxis dataKey="data" tick={{ fontSize: 8, fill: t.axis }} />
            <YAxis tick={{ fontSize: 8, fill: t.axis }} tickFormatter={(v: number) => fmtCount(v)} />
            <Tooltip contentStyle={tooltipFor(t)} formatter={(v: any) => [fmt(v), '']} />
            <Line type="monotone" dataKey="valor" stroke="#4a9ede" strokeWidth={2} dot={{ r: 3, fill: '#4a9ede' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Visualizações combinadas ─────────────────────────────────────────────────

export function VisualizacoesCard({
  visualizacoes,
  tools,
  dadosBrutos,
  titulo,
  conteudo,
  onNavigate,
}: {
  visualizacoes: Visualizacao[];
  tools?: string[];
  dadosBrutos?: Record<string, any>;
  titulo?: string;
  conteudo?: string;
  onNavigate?: () => void;
}) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const { resolvedTheme } = useTheme();
  const t = paleta(resolvedTheme !== 'light'); // default escuro até resolver

  const gerarRelatorio = async () => {
    if (pdfLoading) return;
    setPdfLoading(true);
    try {
      const res = await fetch('/api/agent/relatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo, conteudo, visualizacoes, tools, dadosBrutos }),
      });
      if (!res.ok) { alert('Erro ao gerar relatório.'); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gabi-relatorio-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Falha ao gerar relatório.');
    } finally {
      setPdfLoading(false);
    }
  };
  if (!visualizacoes || visualizacoes.length === 0) return null;

  const donut  = visualizacoes.find(v => v.tipo === 'donut');
  const barras = visualizacoes.find(v => v.tipo === 'barras');
  const serie  = visualizacoes.find(v => v.tipo === 'serie_temporal');
  const kpi    = visualizacoes.find(v => v.tipo === 'cards_kpi');

  const isMoney = !!(tools?.includes('buscar_emendas') || tools?.includes('comparar_parlamentares'));

  const tituloCard = titulo ?? donut?.titulo ?? barras?.titulo ?? serie?.titulo ?? visualizacoes[0]?.titulo;
  const totalVal = donut?.dados?.itens?.reduce((s: number, it: any) => s + (it.valor ?? 0), 0) ?? 0;
  const pillLabel = isMoney ? fmtMoney(totalVal) : fmtCount(totalVal);

  const hasVotacao = !!(tools?.includes('buscar_votacao'));
  const hasEmendas = !!(tools?.includes('buscar_emendas'));

  // Deep-link do "Ver no mapa": leva o candidato consultado já pré-preenchido
  // (a página /dashboard/mapa faz auto-busca a partir desses parâmetros).
  const votCand = dadosBrutos?.buscar_votacao?.candidatos?.[0];
  const mapaHref = votCand
    ? `/dashboard/mapa?${new URLSearchParams({
        candidato: votCand.nomeUrna || votCand.nome || '',
        ano: String(votCand.ano ?? 2022),
        uf: votCand.uf || 'BR',
      }).toString()}`
    : '/dashboard/mapa';

  return (
    <div
      className="mt-3 rounded-xl overflow-hidden w-full"
      style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: `1px solid ${t.headBorder}`, background: t.headBg }}
      >
        <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: t.title }}>
          {tituloCard || 'Dados'}
        </p>
        {totalVal > 0 && (
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: t.pillBg, color: t.pillText }}>
            {pillLabel}
          </span>
        )}
      </div>

      {/* Charts */}
      <div className="p-4">

        {/* Donut + Barras lado a lado */}
        {donut && barras && (
          <div className="flex gap-3 items-start">
            <DonutPanel vis={donut} isMoney={isMoney} t={t} />
            <div className="self-stretch w-px flex-shrink-0" style={{ background: t.divider }} />
            <BarPanel vis={barras} isMoney={isMoney} t={t} />
          </div>
        )}

        {/* Só donut — tamanho maior */}
        {donut && !barras && (
          <div className="flex gap-4 items-start">
            <div style={{ width: '44%' }}>
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donut.dados?.itens ?? []} dataKey="valor" nameKey="label" cx="50%" cy="50%" innerRadius="35%" outerRadius="72%" paddingAngle={2}>
                      {(donut.dados?.itens ?? []).map((_: any, i: number) => (
                        <Cell key={i} fill={(donut.dados.itens[i]?.cor) || COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipFor(t)} formatter={(v: any) => [isMoney ? fmtMoney(v) : fmtCount(v), '']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="flex-1 space-y-2.5 pt-2">
              {(donut.dados?.itens ?? []).map((item: any, i: number) => {
                const total = (donut.dados?.itens ?? []).reduce((s: number, x: any) => s + (x.valor ?? 0), 0);
                const pct = total > 0 ? ((item.valor / total) * 100).toFixed(1) : '0';
                const color = item.cor || COLORS[i % COLORS.length];
                return (
                  <div key={i}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="flex-1 text-xs font-medium truncate" style={{ color: t.label }}>{item.label}</span>
                      <span className="text-xs font-bold flex-shrink-0" style={{ color }}>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: t.track }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <p className="text-[10px] mt-0.5 text-right" style={{ color: t.muted }}>
                      {isMoney ? fmtMoney(item.valor) : fmtCount(item.valor)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Só barras */}
        {!donut && barras && <BarPanel vis={barras} isMoney={isMoney} t={t} />}

        {/* Só série */}
        {serie && !donut && !barras && <SeriePanel vis={serie} isMoney={isMoney} t={t} />}

        {/* Donut + Série */}
        {donut && serie && !barras && (
          <div className="flex gap-3 items-start">
            <DonutPanel vis={donut} isMoney={isMoney} t={t} />
            <div className="self-stretch w-px flex-shrink-0" style={{ background: t.divider }} />
            <SeriePanel vis={serie} isMoney={isMoney} t={t} />
          </div>
        )}

        {/* KPI cards */}
        {kpi?.dados?.cards && (
          <div className="grid grid-cols-2 gap-2 mt-1">
            {kpi.dados.cards.slice(0, 6).map((card: any, i: number) => (
              <div key={i} className="rounded-lg p-2.5" style={{ background: t.kpiBg, border: `1px solid ${t.kpiBorder}` }}>
                <p className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: t.title }}>{card.label}</p>
                {(() => {
                  const { texto, sufixo } = fmtKpi(card.valor, card.unidade);
                  return (
                    <p className="text-sm font-bold" style={{ color: t.label }}>
                      {texto}
                      {sufixo && (<span className="text-xs font-normal ml-1" style={{ color: t.muted }}>{sufixo}</span>)}
                    </p>
                  );
                })()}
                {card.variacao !== undefined && (
                  <p className="text-[10px] mt-0.5" style={{ color: card.variacao >= 0 ? '#16a34a' : '#ef4444' }}>
                    {card.variacao >= 0 ? '+' : ''}{card.variacao}%
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tabela fallback */}
        {visualizacoes.find(v => v.tipo === 'tabela') && !donut && !barras && !serie && !kpi && (() => {
          const tab = visualizacoes.find(v => v.tipo === 'tabela')!;
          return (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    {tab.dados?.colunas?.map((col: string, i: number) => (
                      <th key={i} className="text-left px-2 py-1.5 font-semibold" style={{ color: t.tableHead, borderBottom: `1px solid ${t.tableBorder}` }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tab.dados?.linhas?.slice(0, 10).map((linha: any[], i: number) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${t.rowBorder}` }}>
                      {linha.map((cel, j) => (
                        <td key={j} className="px-2 py-1" style={{ color: t.muted }}>{String(cel ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 px-4 py-3 flex-wrap" style={{ borderTop: `1px solid ${t.divider}` }}>
        <button
          onClick={gerarRelatorio}
          disabled={pdfLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:opacity-90 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #1d6fd8, #4a9ede)', color: '#fff' }}
        >
          {pdfLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
          {pdfLoading ? 'Gerando…' : 'Gerar relatório PDF'}
        </button>
        {(hasVotacao || !hasEmendas) && (
          <Link
            href={mapaHref}
            onClick={() => onNavigate?.()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:opacity-80"
            style={{ color: t.btnText, border: `1px solid ${t.btnBorder}` }}
          >
            <Map className="w-3.5 h-3.5" />
            Ver no mapa
          </Link>
        )}
        {(hasEmendas || !hasVotacao) && (
          <Link
            href="/dashboard/emendas"
            onClick={() => onNavigate?.()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:opacity-80"
            style={{ color: t.btnText, border: `1px solid ${t.btnBorder}` }}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            Abrir em Emendas
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Card do Relatório Territorial (por Região Administrativa) ──────────────────
// Renderiza um botão que baixa o PDF territorial. Aparece quando a Gabi usa a
// ferramenta gerar_relatorio_territorial (independente de haver visualizações).
export function RelatorioTerritorialCard({ payload }: { payload: any }) {
  const [loading, setLoading] = useState(false);
  const { resolvedTheme } = useTheme();
  const t = paleta(resolvedTheme !== 'light');

  if (!payload?.prontoParaGerar) return null;

  const gerar = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/agent/relatorio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'territorial',
          ano: payload.ano,
          uf: payload.uf,
          cargo: payload.cargo,
          deputados: payload.deputados,
        }),
      });
      if (!res.ok) { alert('Erro ao gerar relatório territorial.'); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gabi-relatorio-territorial-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Falha ao gerar relatório territorial.');
    } finally {
      setLoading(false);
    }
  };

  const nEnc  = payload.encontrados?.length ?? 0;
  const nFalt = payload.faltantes?.length ?? 0;

  return (
    <div className="mt-3 rounded-xl overflow-hidden w-full" style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: `1px solid ${t.headBorder}`, background: t.headBg }}>
        <MapPinned className="w-3.5 h-3.5" style={{ color: t.pillText }} />
        <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: t.title }}>
          Relatório Territorial · {payload.uf} {payload.ano}
        </p>
      </div>
      <div className="p-4 flex items-center gap-3 flex-wrap">
        <button
          onClick={gerar}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:opacity-90 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #1d6fd8, #4a9ede)', color: '#fff' }}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
          {loading ? 'Gerando…' : 'Gerar Relatório Territorial (PDF)'}
        </button>
        <span className="text-[11px]" style={{ color: t.muted }}>
          {nEnc} deputado{nEnc !== 1 ? 's' : ''} pronto{nEnc !== 1 ? 's' : ''}
          {nFalt > 0 ? ` · ${nFalt} não localizado${nFalt !== 1 ? 's' : ''}` : ''}
        </span>
      </div>
    </div>
  );
}
