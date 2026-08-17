'use client';

import { useState } from 'react';
import {
  PieChart, Pie, Cell,
  BarChart, Bar, LabelList,
  LineChart, Line,
  XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { FileDown, Map, BarChart2, Loader2 } from 'lucide-react';
import Link from 'next/link';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Visualizacao {
  tipo: 'barras' | 'donut' | 'serie_temporal' | 'cards_kpi' | 'tabela';
  titulo?: string;
  dados: any;
}

// ─── Cores e utilitários ──────────────────────────────────────────────────────

const COLORS = ['#4a9ede', '#22d3ee', '#a78bfa', '#34d399', '#f87171', '#fbbf24', '#fb923c', '#e879f9'];

function fmtMoney(val: number): string {
  if (val >= 1_000_000_000) return `R$ ${(val / 1_000_000_000).toFixed(1).replace('.', ',')}B`;
  if (val >= 1_000_000)     return `R$ ${(val / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (val >= 1_000)         return `R$ ${(val / 1_000).toFixed(0)}K`;
  return `R$ ${val.toLocaleString('pt-BR')}`;
}

function fmtCount(val: number): string {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1).replace('.', ',')}B`;
  if (val >= 1_000_000)     return `${(val / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (val >= 1_000)         return `${(val / 1_000).toFixed(0)}K`;
  return val.toLocaleString('pt-BR');
}

const tooltipStyle = {
  background: '#0d1b2a',
  border: '1px solid rgba(74,158,222,0.3)',
  borderRadius: 8,
  fontSize: 11,
  color: '#e2e8f0',
};

// ─── Donut panel ──────────────────────────────────────────────────────────────

function DonutPanel({ vis, isMoney }: { vis: Visualizacao; isMoney: boolean }) {
  const items = vis.dados?.itens ?? [];
  const total = items.reduce((s: number, it: any) => s + (it.valor ?? 0), 0);
  const fmt = isMoney ? fmtMoney : fmtCount;

  return (
    <div style={{ width: '44%' }}>
      {/* Gráfico de pizza real */}
      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items}
              dataKey="valor"
              nameKey="label"
              cx="50%" cy="50%"
              innerRadius="38%" outerRadius="70%"
              paddingAngle={2}
            >
              {items.map((_: any, i: number) => (
                <Cell key={i} fill={items[i]?.cor || COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: any) => [fmt(v), '']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda com barras de progresso */}
      <div className="space-y-2 px-2 mt-1">
        {items.map((item: any, i: number) => {
          const pct = total > 0 ? ((item.valor / total) * 100).toFixed(1) : '0';
          const color = item.cor || COLORS[i % COLORS.length];
          return (
            <div key={i}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                <span className="flex-1 text-[10px] truncate" style={{ color: '#cbd5e1' }}>{item.label}</span>
                <span className="text-[10px] font-bold flex-shrink-0 ml-1" style={{ color }}>{pct}%</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
              </div>
              <p className="text-[9px] mt-0.5 text-right" style={{ color: '#475569' }}>
                {fmt(item.valor)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Bar panel ────────────────────────────────────────────────────────────────

function BarPanel({ vis, isMoney }: { vis: Visualizacao; isMoney: boolean }) {
  const allItems = vis.dados?.itens ?? [];
  const items = allItems.slice(0, 8); // limita a 8 barras para não amontoar
  const fmt = isMoney ? fmtMoney : fmtCount;

  const barKeys: string[] = (() => {
    if (!items.length) return ['valor'];
    const keys = Object.keys(items[0]).filter(
      k => k !== 'label' && k !== 'cor' && typeof items[0][k] === 'number',
    );
    return keys.length > 0 ? keys : ['valor'];
  })();
  const isMulti = barKeys.length > 1;

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={items} margin={{ top: 20, right: 8, left: -20, bottom: 8 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 8, fill: '#94a3b8' }}
              interval={0}
              angle={-32}
              textAnchor="end"
              height={54}
              tickMargin={4}
              tickFormatter={(v: string) => v.length > 13 ? v.slice(0, 11) + '…' : v}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: any) => [fmt(v), '']}
            />
            {isMulti && (
              <Legend wrapperStyle={{ fontSize: 9, color: '#94a3b8', paddingTop: 4 }} />
            )}
            {barKeys.map((key, ki) => (
              <Bar
                key={key}
                dataKey={key}
                name={key}
                fill={COLORS[ki % COLORS.length]}
                radius={[4, 4, 0, 0]}
              >
                <LabelList
                  dataKey={key}
                  position="top"
                  formatter={(v: any) => typeof v === 'number' ? fmtCount(v) : v}
                  style={{ fontSize: 8, fill: '#94a3b8' }}
                />
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

function SeriePanel({ vis, isMoney }: { vis: Visualizacao; isMoney: boolean }) {
  const fmt = isMoney ? fmtMoney : fmtCount;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={vis.dados?.pontos ?? []} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
            <XAxis dataKey="data" tick={{ fontSize: 8, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} tickFormatter={(v: number) => fmtCount(v)} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [fmt(v), '']} />
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
}: {
  visualizacoes: Visualizacao[];
  tools?: string[];
  dadosBrutos?: Record<string, any>;
  titulo?: string;
  conteudo?: string;
}) {
  const [pdfLoading, setPdfLoading] = useState(false);

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

  return (
    <div
      className="mt-3 rounded-xl overflow-hidden w-full"
      style={{ background: 'rgba(10,18,35,0.9)', border: '1px solid rgba(74,158,222,0.22)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: '1px solid rgba(74,158,222,0.12)', background: 'rgba(74,158,222,0.06)' }}
      >
        <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: '#64748b' }}>
          {tituloCard || 'Dados'}
        </p>
        {totalVal > 0 && (
          <span
            className="text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(74,158,222,0.15)', color: '#4a9ede' }}
          >
            {pillLabel}
          </span>
        )}
      </div>

      {/* Charts */}
      <div className="p-4">

        {/* Donut + Barras lado a lado */}
        {donut && barras && (
          <div className="flex gap-3 items-start">
            <DonutPanel vis={donut} isMoney={isMoney} />
            <div className="self-stretch w-px flex-shrink-0" style={{ background: 'rgba(74,158,222,0.1)' }} />
            <BarPanel vis={barras} isMoney={isMoney} />
          </div>
        )}

        {/* Só donut — tamanho maior */}
        {donut && !barras && (
          <div className="flex gap-4 items-start">
            {/* Donut maior */}
            <div style={{ width: '44%' }}>
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donut.dados?.itens ?? []}
                      dataKey="valor"
                      nameKey="label"
                      cx="50%" cy="50%"
                      innerRadius="35%" outerRadius="72%"
                      paddingAngle={2}
                    >
                      {(donut.dados?.itens ?? []).map((_: any, i: number) => (
                        <Cell key={i} fill={(donut.dados.itens[i]?.cor) || COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: any) => [isMoney ? fmtMoney(v) : fmtCount(v), '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Legenda detalhada à direita */}
            <div className="flex-1 space-y-2.5 pt-2">
              {(donut.dados?.itens ?? []).map((item: any, i: number) => {
                const total = (donut.dados?.itens ?? []).reduce((s: number, x: any) => s + (x.valor ?? 0), 0);
                const pct = total > 0 ? ((item.valor / total) * 100).toFixed(1) : '0';
                const color = item.cor || COLORS[i % COLORS.length];
                return (
                  <div key={i}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="flex-1 text-xs font-medium truncate" style={{ color: '#e2e8f0' }}>{item.label}</span>
                      <span className="text-xs font-bold flex-shrink-0" style={{ color }}>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <p className="text-[10px] mt-0.5 text-right" style={{ color: '#475569' }}>
                      {isMoney ? fmtMoney(item.valor) : fmtCount(item.valor)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Só barras */}
        {!donut && barras && <BarPanel vis={barras} isMoney={isMoney} />}

        {/* Só série */}
        {serie && !donut && !barras && <SeriePanel vis={serie} isMoney={isMoney} />}

        {/* Donut + Série */}
        {donut && serie && !barras && (
          <div className="flex gap-3 items-start">
            <DonutPanel vis={donut} isMoney={isMoney} />
            <div className="self-stretch w-px flex-shrink-0" style={{ background: 'rgba(74,158,222,0.1)' }} />
            <SeriePanel vis={serie} isMoney={isMoney} />
          </div>
        )}

        {/* KPI cards */}
        {kpi?.dados?.cards && (
          <div className="grid grid-cols-2 gap-2 mt-1">
            {kpi.dados.cards.slice(0, 6).map((card: any, i: number) => (
              <div
                key={i}
                className="rounded-lg p-2.5"
                style={{ background: 'rgba(74,158,222,0.08)', border: '1px solid rgba(74,158,222,0.12)' }}
              >
                <p className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: '#64748b' }}>{card.label}</p>
                <p className="text-sm font-bold" style={{ color: '#e2e8f0' }}>
                  {card.valor}
                  {card.unidade && (
                    <span className="text-xs font-normal ml-1" style={{ color: '#94a3b8' }}>{card.unidade}</span>
                  )}
                </p>
                {card.variacao !== undefined && (
                  <p className="text-[10px] mt-0.5" style={{ color: card.variacao >= 0 ? '#4ade80' : '#f87171' }}>
                    {card.variacao >= 0 ? '+' : ''}{card.variacao}%
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tabela fallback */}
        {visualizacoes.find(v => v.tipo === 'tabela') && !donut && !barras && !serie && !kpi && (() => {
          const t = visualizacoes.find(v => v.tipo === 'tabela')!;
          return (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    {t.dados?.colunas?.map((col: string, i: number) => (
                      <th key={i} className="text-left px-2 py-1.5 font-semibold"
                        style={{ color: '#4a9ede', borderBottom: '1px solid rgba(74,158,222,0.2)' }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.dados?.linhas?.slice(0, 10).map((linha: any[], i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(74,158,222,0.06)' }}>
                      {linha.map((cel, j) => (
                        <td key={j} className="px-2 py-1" style={{ color: '#94a3b8' }}>{String(cel ?? '')}</td>
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
      <div
        className="flex items-center gap-2 px-4 py-3 flex-wrap"
        style={{ borderTop: '1px solid rgba(74,158,222,0.1)' }}
      >
        <button
          onClick={gerarRelatorio}
          disabled={pdfLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:opacity-90 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #1d6fd8, #4a9ede)', color: '#fff' }}
        >
          {pdfLoading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <FileDown className="w-3.5 h-3.5" />}
          {pdfLoading ? 'Gerando…' : 'Gerar relatório PDF'}
        </button>
        {(hasVotacao || !hasEmendas) && (
          <Link
            href="/dashboard/mapa"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:bg-white/5"
            style={{ color: '#94a3b8', border: '1px solid rgba(74,158,222,0.15)' }}
          >
            <Map className="w-3.5 h-3.5" />
            Ver no mapa
          </Link>
        )}
        {(hasEmendas || !hasVotacao) && (
          <Link
            href="/dashboard/emendas"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:bg-white/5"
            style={{ color: '#94a3b8', border: '1px solid rgba(74,158,222,0.15)' }}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            Abrir em Emendas
          </Link>
        )}
      </div>
    </div>
  );
}
