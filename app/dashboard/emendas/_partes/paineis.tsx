'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import dynamic from 'next/dynamic';
import { Landmark, CheckCircle2, MapPinned, Loader2, Users, Vote, Building2, Search, TrendingUp, TrendingDown, Trophy, X, Plus, Pencil, Trash2, Save, AlertCircle, Paperclip } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Select } from '@/components/ui/select';
import { AREA_LABELS, AREA_COLORS, CARGO_LABELS, formatBRL, formatBRLCompact, type EmendaArea, type ParlamentarCargo } from '@/lib/portal-transparencia';
import { EmendaDocumentosModal } from '@/components/emendas/emenda-documentos-modal';
import { PortalEmenda, PortalParlamentar, DestinoRow, EmendaNaoRealizadaLocal, MunicipioStats, ResumoEstado, ParlamentarPorMunicipio } from './tipos';


export const Donut3DChart = dynamic(() => import('@/components/charts/donut-3d-chart'), { ssr: false });

// ===========================================================================
// Componentes internos
// ===========================================================================

// O Portal grava a bancada como "BANCADA DE SAO PAULO", sem acento, e o
// cadastro dela fica como deputado federal. Na tela: "Bancada de São Paulo",
// cargo "Bancada estadual". Demais nomes passam iguais.
export const UF_COM_ACENTO: Record<string, string> = {
  'SAO PAULO': 'de São Paulo', 'PARA': 'do Pará', 'PARAIBA': 'da Paraíba', 'PARANA': 'do Paraná', 'PIAUI': 'do Piauí',
  'MARANHAO': 'do Maranhão', 'CEARA': 'do Ceará', 'AMAPA': 'do Amapá', 'GOIAS': 'de Goiás', 'RONDONIA': 'de Rondônia',
  'ESPIRITO SANTO': 'do Espírito Santo', 'AMAZONAS': 'do Amazonas', 'ACRE': 'do Acre', 'ALAGOAS': 'de Alagoas', 'BAHIA': 'da Bahia',
  'DISTRITO FEDERAL': 'do Distrito Federal', 'MATO GROSSO': 'de Mato Grosso', 'MATO GROSSO DO SUL': 'de Mato Grosso do Sul',
  'MINAS GERAIS': 'de Minas Gerais', 'PERNAMBUCO': 'de Pernambuco', 'RIO DE JANEIRO': 'do Rio de Janeiro',
  'RIO GRANDE DO NORTE': 'do Rio Grande do Norte', 'RIO GRANDE DO SUL': 'do Rio Grande do Sul', 'RORAIMA': 'de Roraima',
  'SANTA CATARINA': 'de Santa Catarina', 'SERGIPE': 'de Sergipe', 'TOCANTINS': 'do Tocantins',
};
export const ehBancada = (nome: string) => /^bancada\b/i.test(nome.trim());
// Emenda de comissão da Câmara/Senado ("COM. DA SAUDE"): a importação federal
// grava com cargo de deputado federal, e aparecia como "Deputado Federal".
export const ehComissao = (nome: string) => /^(com\.|comiss[aã]o\b)/i.test(nome.trim());
export function nomeExibicao(nome: string): string {
  if (!ehBancada(nome)) return nome;
  const resto = nome.trim().replace(/^bancada\s+(d[aeo]s?\s+)?/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return `Bancada ${UF_COM_ACENTO[resto] ?? nome.trim().replace(/^bancada\s+/i, '')}`;
}
export function cargoExibicao(nome: string, cargo: string): string {
  if (ehBancada(nome)) return 'Bancada estadual';
  if (ehComissao(nome)) return 'Comissão';
  return CARGO_LABELS[cargo as ParlamentarCargo] ?? cargo;
}
export const corCargoEmenda = (nome: string, cargo: string) =>
  ehBancada(nome) ? '#7c3aed' : ehComissao(nome) ? '#d97706' : cargo === 'SENADOR' ? '#059669' : cargo === 'DEPUTADO_ESTADUAL' ? '#0891b2' : '#2563eb';
export function iniciaisNome(nome: string) {
  const p = nome.trim().split(/\s+/).filter(x => !/^(d[aeo]s?|e)$/i.test(x));
  if (p.length === 0) return '?';
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}

/** Linha de ranking: posição, (avatar), nome, valor e barra proporcional. */
export function LinhaRanking({ posicao, titulo, subtitulo, valor, fracao, cor, avatar, onClick }: {
  posicao: number;
  titulo: string;
  subtitulo?: string;
  valor: string;
  fracao: number;
  cor: string;
  avatar?: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="w-full text-left group rounded-xl px-2 py-1.5 -mx-2 transition-colors hover:bg-[var(--tint-06)]">
      <div className="flex items-center gap-2">
        {avatar ? (
          <span className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${cor}, ${cor}bb)` }}>{avatar}</span>
        ) : (
          <span className="w-5 text-[11px] font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>{posicao}</span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium truncate group-hover:text-[color:var(--brand-cobalt-text)] transition-colors" style={{ color: 'var(--text-primary)' }} title={titulo}>{titulo}</span>
          {subtitulo && <span className="block text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>{subtitulo}</span>}
        </span>
        <span className="text-xs font-bold tabular-nums flex-shrink-0" style={{ color: 'var(--text-primary)' }}>{valor}</span>
      </div>
      <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'var(--tint-06)', marginLeft: avatar ? 36 : 28 }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(3, fracao * 100)}%`, background: cor }} />
      </div>
    </button>
  );
}

export function ResumoGeralCard({
  view,
  ano,
  stateName,
  municipio,
  municipioStats,
  resumo,
  parlamentar,
  parlamentarTotal,
  parlamentarTotalPago,
  parlamentarMunicipioTotal,
  soValorDestinado = false,
}: {
  view: 'brasil' | 'estado';
  ano: number;
  stateName: string;
  municipio: { codigo: string; nome: string } | null;
  municipioStats: MunicipioStats | null;
  resumo: ResumoEstado | null;
  parlamentar: PortalParlamentar | null;
  parlamentarTotal: number;
  parlamentarTotalPago: number;
  parlamentarMunicipioTotal: number | null;
  /** Só estaduais de um estado que publica só o valor destinado (RJ). */
  soValorDestinado?: boolean;
}) {
  const tetoMac   = municipio ? municipioStats?.tetoMac   ?? null : null;
  const tetoPap   = municipio ? municipioStats?.tetoPap   ?? null : null;
  const habitantes = municipio ? municipioStats?.habitantes ?? null : null;
  const eleitores  = municipio ? municipioStats?.eleitores  ?? null : null;

  // ── Lógica do card "Total de Emendas" ──────────────────────────────────
  // Prioridade: ambos → só parlamentar → só município → estado inteiro
  const hasBoth = !!(parlamentar && municipio);
  const hasParl = !!parlamentar && !municipio;
  const hasMun  = !!municipio   && !parlamentar;

  const totalLabel = hasBoth
    ? `${parlamentar!.nome.split(' ')[0]} em ${municipio!.nome}`
    : hasParl
    ? 'Total do Parlamentar'
    : hasMun
    ? 'Total de Emendas'
    : 'Total Municipalizado';

  const totalValue = hasBoth
    ? (parlamentarMunicipioTotal ?? 0)
    : hasParl
    ? parlamentarTotal
    : hasMun
    ? (resumo?.valorPorMunicipio?.[municipio!.codigo] ?? 0)
    : (resumo?.totalMunicipalizado ?? 0);

  const totalSub = hasBoth
    ? `de ${parlamentarTotal > 0 ? formatBRLCompact(parlamentarTotal) : '—'} total do parlamentar no estado`
    : hasParl
    ? `${formatBRLCompact(parlamentarTotalPago)} pago · em ${ano}`
    : hasMun
    ? `em ${ano}`
    : (resumo?.totalEstadual ?? 0) > 0
    ? `${formatBRLCompact(resumo!.totalEstadual)} adicional sem município`
    : `em ${ano}`;

  const semMunicipio = view === 'estado' && !municipio;
  const municipiosBeneficiados = Object.keys(resumo?.valorPorMunicipio ?? {}).length;
  const pctPago = (resumo?.totalEmpenhado ?? 0) > 0 ? (resumo!.totalPago / resumo!.totalEmpenhado) : 0;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-[color:var(--text-tertiary)] mb-3">
        {view === 'brasil' ? 'Resumo geral' : municipio ? `Resumo · ${municipio.nome}` : `Resumo · ${stateName}`}
      </p>
      {view === 'brasil' ? (
        <p className="text-xs py-2" style={{ color: 'var(--text-tertiary)' }}>
          Escolha um estado no mapa para ver quanto foi empenhado, pago e para quais cidades.
        </p>
      ) : semMunicipio && !parlamentar ? (
        <div className="space-y-3">
          <ResumoStat
            icon={<Landmark className="w-4 h-4" />}
            iconBg="rgba(37,99,235,0.14)"
            iconColor="#2563eb"
            label={soValorDestinado ? 'Destinado no estado' : 'Empenhado no estado'}
            value={formatBRLCompact(resumo?.totalEmpenhado ?? 0)}
            sub={`${(resumo?.totalEmendas ?? 0).toLocaleString('pt-BR')} emendas em ${ano}`}
          />
          {soValorDestinado ? (
            <ResumoStat
              icon={<CheckCircle2 className="w-4 h-4" />}
              iconBg="rgba(16,185,129,0.15)"
              iconColor="var(--success)"
              label="Pago"
              value="Não publicado"
              sub="O governo do estado não publica a execução por emenda"
            />
          ) : (
          <ResumoStat
            icon={<CheckCircle2 className="w-4 h-4" />}
            iconBg="rgba(16,185,129,0.15)"
            iconColor="var(--success)"
            label="Pago"
            value={formatBRLCompact(resumo?.totalPago ?? 0)}
            sub={`${(pctPago * 100).toFixed(0)}% do empenhado`}
            barra={{ fracao: pctPago, cor: '#10b981' }}
          />
          )}
          <ResumoStat
            icon={<Building2 className="w-4 h-4" />}
            iconBg="rgba(245,158,11,0.15)"
            iconColor="var(--warning)"
            label="Municipalizado"
            value={formatBRLCompact(resumo?.totalMunicipalizado ?? 0)}
            sub={(resumo?.totalEstadual ?? 0) > 0 ? `${formatBRLCompact(resumo!.totalEstadual)} sem município definido` : `em ${ano}`}
          />
          <ResumoStat
            icon={<MapPinned className="w-4 h-4" />}
            iconBg="rgba(99,102,241,0.15)"
            iconColor="#6366f1"
            label="Cidades beneficiadas"
            value={municipiosBeneficiados.toLocaleString('pt-BR')}
            sub="Escolha uma no mapa para ver população, eleitores e tetos"
          />
        </div>
      ) : (
        <div className="space-y-3">
          {municipio && (
            <>
              <ResumoStat
                icon={<Users className="w-4 h-4" />}
                iconBg="rgba(74,158,222,0.15)"
                iconColor="var(--acento-azul)"
                label="População"
                value={habitantes != null ? habitantes.toLocaleString('pt-BR') : '—'}
                sub="habitantes"
              />
              <ResumoStat
                icon={<Vote className="w-4 h-4" />}
                iconBg="rgba(99,102,241,0.15)"
                iconColor="#6366f1"
                label="Eleitores"
                value={eleitores != null ? eleitores.toLocaleString('pt-BR') : '—'}
                sub="eleitores"
              />
            </>
          )}
          <ResumoStat
            icon={<Landmark className="w-4 h-4" />}
            iconBg="rgba(16,185,129,0.15)"
            iconColor="var(--success)"
            label={totalLabel}
            value={formatBRLCompact(totalValue)}
            sub={totalSub}
          />
          {municipio && (
            <>
              <ResumoStat
                icon={<Building2 className="w-4 h-4" />}
                iconBg="rgba(245,158,11,0.15)"
                iconColor="var(--warning)"
                label="Teto MAC"
                value={tetoMac != null ? formatBRLCompact(tetoMac) : 'sem dados'}
                sub={tetoMac != null ? 'Média e Alta Complexidade · anual' : undefined}
              />
              <ResumoStat
                icon={<Building2 className="w-4 h-4" />}
                iconBg="rgba(20,184,166,0.15)"
                iconColor="#14b8a6"
                label="Teto PAP"
                value={tetoPap != null ? formatBRLCompact(tetoPap) : 'sem dados'}
                sub={tetoPap != null ? 'Atenção Primária · anual' : undefined}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ResumoStat({
  icon, iconBg, iconColor, label, value, sub, barra,
}: { icon: React.ReactNode; iconBg: string; iconColor: string; label: string; value: string; sub?: string; barra?: { fracao: number; cor: string } }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: iconBg, color: iconColor, border: `1px solid ${iconColor}33` }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-slate-600 dark:text-slate-500 font-semibold">{label}</p>
        <p className="text-[color:var(--text-primary)] font-bold text-base tabular-nums break-words">{value}</p>
        {barra && (
          <div className="h-1 rounded-full overflow-hidden my-1" style={{ background: 'var(--tint-06)' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, barra.fracao * 100)}%`, background: barra.cor }} />
          </div>
        )}
        {sub && <p className="text-[10px] text-[color:var(--text-tertiary)]">{sub}</p>}
      </div>
    </div>
  );
}

export function EmendasPorAreaCard({
  view,
  municipio,
  parlamentar,
  emendas,
  resumo,
}: {
  view: 'brasil' | 'estado';
  municipio: { codigo: string; nome: string } | null;
  parlamentar: PortalParlamentar | null;
  emendas: PortalEmenda[];
  resumo: ResumoEstado | null;
}) {
  const areas = useMemo(() => {
    if (municipio || parlamentar) {
      const m = new Map<EmendaArea, number>();
      emendas.forEach((e) => m.set(e.area, (m.get(e.area) ?? 0) + e.valorEmpenhado));
      return Array.from(m.entries())
        .map(([area, total]) => ({ area, total }))
        .sort((a, b) => b.total - a.total);
    }
    return resumo?.areas ?? [];
  }, [municipio, parlamentar, emendas, resumo]);

  const data = useMemo(
    () =>
      areas.map((a) => ({
        name:  AREA_LABELS[a.area],
        value: Math.round(a.total),
        color: AREA_COLORS[a.area],
      })),
    [areas],
  );

  const total = areas.reduce((s, a) => s + a.total, 0);

  return (
    <div
      className="rounded-2xl p-4 h-full"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-[color:var(--text-tertiary)] mb-3">Emendas por Área</p>
      {view === 'brasil' || areas.length === 0 ? (
        <p className="text-xs text-slate-600 dark:text-slate-500 text-center py-6">
          {view === 'brasil' ? 'Selecione um estado no mapa' : 'Sem dados para o ano selecionado'}
        </p>
      ) : (
        <>
          <div className="h-44 relative">
            <Donut3DChart
              data={data.slice(0, 6)}
              centerValue={formatBRLCompact(total)}
              centerLabel="total"
              hideLegend
              valueFormatter={formatBRL}
            />
          </div>
          <div className="mt-3 space-y-1.5">
            {areas.slice(0, 4).map((a) => {
              const pct = total > 0 ? ((a.total / total) * 100).toFixed(0) : '0';
              return (
                <div key={a.area} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: AREA_COLORS[a.area] }} />
                    <span className="text-slate-700 dark:text-slate-300 truncate">{AREA_LABELS[a.area]}</span>
                  </div>
                  <span className="text-[color:var(--text-primary)] font-semibold flex-shrink-0">{formatBRLCompact(a.total)} <span className="text-slate-600 dark:text-slate-500">({pct}%)</span></span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function SelecionarEstadoCard() {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-[color:var(--text-tertiary)] mb-2">Como usar</p>
      <ol className="text-xs text-slate-700 dark:text-slate-300 space-y-2 list-decimal list-inside">
        <li>Clique em um estado no mapa</li>
        <li>Escolha um município (popup mostra habitantes, eleitores e tetos)</li>
        <li>Pesquise um parlamentar para ver os gráficos por área e por ano</li>
      </ol>
    </div>
  );
}

export function Top5ParlamentaresDoMunicipioCard({
  municipioNome, parlamentares, loading, onPick,
}: {
  municipioNome: string;
  parlamentares: { cpf: string | null; idPortal: string; nome: string; total: number; cargo: ParlamentarCargo; partido: string | null }[];
  loading: boolean;
  onPick: (p: { cpf: string | null; idPortal: string; nome: string; total: number; cargo: ParlamentarCargo; partido: string | null }) => void;
}) {
  return (
    <div
      className="rounded-2xl p-4 h-full flex flex-col"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-[color:var(--text-tertiary)] mb-1 flex-shrink-0">Top 5 Parlamentares</p>
      <p className="text-[10px] text-[color:var(--brand-cobalt-text)]/80 mb-2 truncate flex-shrink-0" title={municipioNome}>
        que mais enviaram para {municipioNome}
      </p>
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-600 dark:text-slate-500" />
        </div>
      )}
      {!loading && parlamentares.length === 0 && (
        <p className="text-xs text-slate-600 dark:text-slate-500 text-center py-4">Sem dados disponíveis</p>
      )}
      {!loading && parlamentares.length > 0 && (
        <ol className="flex-1 overflow-y-auto space-y-1 pr-0.5 px-2">
          {parlamentares.map((p, i) => (
            <li key={p.idPortal}>
              <LinhaRanking
                posicao={i + 1}
                avatar={iniciaisNome(nomeExibicao(p.nome))}
                titulo={nomeExibicao(p.nome)}
                subtitulo={`${cargoExibicao(p.nome, p.cargo)}${p.partido && !ehBancada(p.nome) ? ` · ${p.partido}` : ''}`}
                valor={formatBRLCompact(p.total)}
                fracao={p.total / Math.max(parlamentares[0]?.total ?? 1, 1)}
                cor={corCargoEmenda(p.nome, p.cargo)}
                onClick={() => onPick(p)}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function Top5ParlamentaresEstadoCard({
  topResumo, onPick,
}: {
  topResumo: { cpf: string | null; idPortal: string; nome: string; cargo: string; partido: string | null; total: number }[];
  onPick: (p: { cpf: string | null; idPortal: string; nome: string; cargo: string; partido: string | null; total: number }) => void;
}) {
  if (topResumo.length === 0) return null;
  return (
    <div
      className="rounded-2xl p-4 h-full flex flex-col"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-[color:var(--text-tertiary)] mb-3 flex-shrink-0">Top 5 Parlamentares</p>
      <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 px-2">
        {topResumo.slice(0, 5).map((p, i) => (
          <LinhaRanking
            key={p.idPortal}
            posicao={i + 1}
            avatar={iniciaisNome(nomeExibicao(p.nome))}
            titulo={nomeExibicao(p.nome)}
            subtitulo={`${cargoExibicao(p.nome, p.cargo)}${p.partido && !ehBancada(p.nome) ? ` · ${p.partido}` : ''}`}
            valor={formatBRLCompact(p.total)}
            fracao={p.total / Math.max(topResumo[0]?.total ?? 1, 1)}
            cor={corCargoEmenda(p.nome, p.cargo)}
            onClick={() => onPick(p)}
          />
        ))}
      </div>
    </div>
  );
}

export function Top5MunicipiosCard({
  resumo,
  loading,
  onClick,
  escopoParlamentar,
}: {
  resumo: ResumoEstado | null;
  loading: boolean;
  onClick: (m: { codigoIbge: string; nome: string }) => void;
  /** Quando set, mostra o top 5 do parlamentar em vez do agregado do estado. */
  escopoParlamentar?: {
    nome: string;
    municipios: { codigoIbge: string; nome: string; total: number }[];
  } | null;
}) {
  // Se há parlamentar selecionado, usa o top dele. Senão, usa o do estado.
  const top = escopoParlamentar?.municipios ?? resumo?.topMunicipios ?? [];
  const isParlamentar = !!escopoParlamentar;

  return (
    <div
      className="rounded-2xl p-4 h-full flex flex-col"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-[color:var(--text-tertiary)] mb-1 flex-shrink-0">
        Top 5 Municípios
      </p>
      {isParlamentar && (
        <p className="text-[10px] text-[color:var(--brand-cobalt-text)]/80 mb-2 truncate flex-shrink-0" title={escopoParlamentar.nome}>
          beneficiados por {escopoParlamentar.nome}
        </p>
      )}
      {!isParlamentar && <div className="mb-2 flex-shrink-0" />}

      {loading && !isParlamentar && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-600 dark:text-slate-500" />
        </div>
      )}
      {!loading && top.length === 0 && (
        <p className="text-xs text-slate-600 dark:text-slate-500 text-center py-4">
          {isParlamentar
            ? 'Nenhum município identificado (emendas em nível estadual)'
            : 'Sem dados disponíveis'}
        </p>
      )}
      {!loading && top.length > 0 && (
        <ol className="flex-1 overflow-y-auto space-y-1 pr-0.5 px-2">
          {top.map((m, i) => (
            <li key={m.codigoIbge}>
              <LinhaRanking
                posicao={i + 1}
                titulo={m.nome}
                valor={formatBRLCompact(m.total)}
                fracao={m.total / Math.max(top[0]?.total ?? 1, 1)}
                cor="#2563eb"
                onClick={() => onClick(m)}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function ParlamentarSearchCard({
  query, setQuery, results, searching, onPick, topResumo, onPickFromResumo, selected, onClear,
}: {
  query: string;
  setQuery: (v: string) => void;
  results: PortalParlamentar[];
  searching: boolean;
  onPick: (p: PortalParlamentar) => void;
  topResumo: { cpf: string | null; idPortal: string; nome: string; cargo: string; partido: string | null; total: number }[];
  onPickFromResumo: (p: { cpf: string | null; idPortal: string; nome: string; cargo: string; partido: string | null; total: number }) => void;
  selected: PortalParlamentar | null;
  onClear: () => void;
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}
    >
      <p className="text-[10px] uppercase tracking-widest font-bold text-[color:var(--text-tertiary)] mb-2">Emendas por Parlamentar</p>

      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar parlamentar…"
          className="w-full bg-[var(--tint-06)] border border-[var(--tint-10)] rounded-xl pl-8 pr-3 py-2 text-xs text-[color:var(--text-primary)] placeholder-slate-500 outline-none focus:border-amber-500/50"
        />
        {searching && <Loader2 className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-slate-600 dark:text-slate-500" />}
      </div>

      {query.length >= 2 && results.length > 0 && (
        <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.idPortal}
              onClick={() => onPick(p)}
              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[var(--tint-06)] transition-colors"
            >
              <p className="text-xs text-[color:var(--text-primary)] font-medium truncate">{p.nome}</p>
              <p className="text-[10px] text-slate-600 dark:text-slate-500">
                {cargoExibicao(p.nome, p.cargo)}
                {p.partido ? ` · ${p.partido}` : ''}
                {p.uf ? ` · ${p.uf}` : ''}
              </p>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="mt-3 flex items-center gap-2 px-2.5 py-2 rounded-xl"
          style={{ background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.25)' }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[color:var(--text-primary)] font-semibold truncate">{selected.nome}</p>
            <p className="text-[10px] text-[color:var(--brand-cobalt-text)]/80">
              {cargoExibicao(selected.nome, selected.cargo)}{selected.partido ? ` · ${selected.partido}` : ''}
            </p>
          </div>
          <button onClick={onClear} className="text-slate-600 dark:text-slate-500 hover:text-white p-1 rounded-lg">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {!selected && topResumo.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {topResumo.slice(0, 5).map((p) => (
            <button
              key={p.idPortal}
              onClick={() => onPickFromResumo(p)}
              className="w-full flex items-center gap-2 group text-left hover:bg-[var(--tint-06)] -mx-1 px-1 py-1 rounded-lg transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-[color:var(--text-primary)] truncate group-hover:text-[color:var(--brand-cobalt-text)]">{p.nome}</p>
                <p className="text-[10px] text-slate-600 dark:text-slate-500">{cargoExibicao(p.nome, p.cargo)}</p>
              </div>
              <span className="text-[11px] font-semibold text-[color:var(--brand-cobalt-text)] flex-shrink-0">{formatBRLCompact(p.total)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MunicipioPopup({
  municipio, stats, loading, onClose,
}: {
  municipio: { codigo: string; nome: string };
  stats: MunicipioStats | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        className="absolute left-1/2 -translate-x-1/2 bottom-4 z-[450] rounded-xl px-4 py-3 pointer-events-auto w-[260px] max-w-[calc(100%-16px)]"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-raised)',
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[color:var(--brand-cobalt-text)]">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              Município
            </span>
            <p className="text-[color:var(--text-primary)] font-bold text-sm mt-0.5">{municipio.nome}</p>
          </div>
          <button onClick={onClose} className="text-slate-600 dark:text-slate-400 hover:text-white p-0.5 rounded-lg">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="py-2 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-slate-600 dark:text-slate-500" />
          </div>
        ) : (
          <div className="space-y-1.5 text-[11px]">
            <PopupRow
              label="Habitantes"
              value={stats?.habitantes != null ? stats.habitantes.toLocaleString('pt-BR') : '—'}
              hint={stats?.fonteHabitantes ?? undefined}
            />
            <PopupRow
              label="Eleitores"
              value={stats?.eleitores != null ? stats.eleitores.toLocaleString('pt-BR') : '—'}
              hint={stats?.eleitores == null ? 'requer importação do TSE' : undefined}
            />
            <PopupRow
              label="Teto MAC"
              value={stats?.tetoMac != null ? formatBRLCompact(stats.tetoMac) : '—'}
              hint={stats?.tetoMac == null ? 'requer cadastro manual (DataSUS)' : undefined}
            />
            <PopupRow
              label="Teto PAP"
              value={stats?.tetoPap != null ? formatBRLCompact(stats.tetoPap) : '—'}
              hint={stats?.tetoPap == null ? 'fonte SISAPS — pendente' : undefined}
            />
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export function PopupRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-slate-600 dark:text-slate-400 flex-shrink-0">{label}</span>
      <div className="text-right min-w-0">
        <span className={value === '—' ? 'text-slate-600 dark:text-slate-500' : 'text-[color:var(--text-primary)] font-semibold'}>{value}</span>
        {hint && <p className="text-[10px] text-slate-600 dark:text-slate-500 italic mt-0.5 leading-tight">{hint}</p>}
      </div>
    </div>
  );
}

export function LegendaCores() {
  // Mesmas faixas discretas usadas pelo StateMap — qualquer mudança aqui
  // precisa replicar no getColor de state-map.tsx pra legenda continuar
  // batendo com o desenho. Paletas diferentes por tema.
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const items = isDark
    ? [
        { label: 'Acima de R$ 2 milhões',   color: '#0c4f8a' },
        { label: 'R$ 1 milhão – 2 milhões', color: '#1d6fb8' },
        { label: 'R$ 500 mil – 1 milhão',   color: '#3a8ed1' },
        { label: 'Até R$ 500 mil',          color: '#7fb8e0' },
        { label: 'Sem emendas',             color: '#15355c', border: '1px solid var(--tint-18)' },
      ]
    : [
        { label: 'Acima de R$ 2 milhões',   color: '#2C5282' },
        { label: 'R$ 1 milhão – 2 milhões', color: '#4A7FB5' },
        { label: 'R$ 500 mil – 1 milhão',   color: '#82B0D4' },
        { label: 'Até R$ 500 mil',          color: '#B5D0E8' },
        { label: 'Sem emendas',             color: '#E8F0F8', border: '1px solid #CBD5E1' },
      ];
  return (
    <div className="space-y-1">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-sm flex-shrink-0"
            style={{ background: it.color, border: (it as any).border ?? 'none' }}
          />
          <span className="text-[10px] text-slate-700 dark:text-slate-300">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

export function ParlamentarDashboard({
  parlamentar, ano, uf, escopo, loading, totalAno, totalPago, porArea, porAno, maxPorAno, porMunicipio, porTipo, destinos, destinosFlat, emendas, pixPorMunicipio, pixTotal, onMunicipioClick,
}: {
  parlamentar: PortalParlamentar;
  ano: number;
  uf?: string;
  escopo?: string;
  loading: boolean;
  totalAno: number;
  totalPago: number;
  porArea: { name: string; value: number; color: string; area: EmendaArea }[];
  porAno: { ano: number; total: number }[];
  maxPorAno: number;
  porMunicipio: ParlamentarPorMunicipio[];
  porTipo: { tipo: string; total: number; qtd: number; semValor: number }[];
  destinos: { municipal: number; estadual: number; qtdMun: number; qtdEst: number };
  destinosFlat: DestinoRow[];
  emendas: PortalEmenda[];
  pixPorMunicipio: { codigoIbge: string; nome: string; uf: string | null; total: number; qtd: number }[];
  pixTotal: number;
  onMunicipioClick?: (m: ParlamentarPorMunicipio) => void;
}) {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === 'dark';
  const pctPago = totalAno > 0 ? (totalPago / totalAno) * 100 : 0;
  // Emendas cujo valor o governo do estado não publicou (SP) e deputado cujas
  // emendas só têm o valor destinado (estaduais do RJ).
  const semValorPublicado = emendas.filter((e) => e.semValorPublicado).length;
  const soValorDestinado = emendas.length > 0 && emendas.every((e) => e.soValorDestinado);
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-[color:var(--brand-cobalt-text)]">Dashboard do parlamentar</p>
          <h2 className="text-xl text-[color:var(--text-primary)] font-bold mt-1">{parlamentar.nome}</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            {cargoExibicao(parlamentar.nome, parlamentar.cargo)}
            {parlamentar.partido ? ` · ${parlamentar.partido}` : ''}
            {parlamentar.uf ? ` · ${parlamentar.uf}` : ''}
          </p>
        </div>
        <div
          className="rounded-2xl px-5 py-3 text-right"
          style={{
            background: 'linear-gradient(135deg, rgba(37,99,235,0.15), rgba(37,99,235,0.05))',
            border: '1px solid rgba(37,99,235,0.35)',
            boxShadow: 'inset 0 0 18px rgba(37,99,235,0.08)',
          }}
        >
          <p className="text-[10px] uppercase tracking-widest text-[color:var(--brand-cobalt-text)] font-bold">
            Total enviado em {ano}{escopo ? ` · ${escopo}` : ''}
          </p>
          <p className="text-2xl font-bold text-[color:var(--text-primary)] mt-0.5">
            {loading ? <Loader2 className="w-5 h-5 animate-spin inline" /> : formatBRLCompact(totalAno)}
          </p>
          {!loading && totalAno > 0 && (soValorDestinado ? (
            <p className="text-[11px] mt-0.5 italic text-[color:var(--text-tertiary)]"
              title="O governo do RJ não publica o empenho nem o pagamento de cada emenda estadual">
              Valor destinado · execução não publicada
            </p>
          ) : (
            <p className="text-[11px] text-[color:var(--success)] mt-0.5">
              Pago: <span className="font-bold">{formatBRLCompact(totalPago)}</span>
              <span className="text-[color:var(--success)]/60"> ({pctPago.toFixed(0)}%)</span>
            </p>
          ))}
          {!loading && (destinos.municipal > 0 || destinos.estadual > 0) && (
            <div className="mt-2 text-[10px] text-slate-700 dark:text-slate-300 space-y-0.5 text-right">
              <p>
                <span className="text-[color:var(--brand-cobalt-text)]">●</span> A municípios: <span className="font-semibold text-[color:var(--text-primary)]">{formatBRLCompact(destinos.municipal)}</span>
                <span className="text-slate-600 dark:text-slate-500"> ({destinos.qtdMun})</span>
              </p>
              <p>
                <span className="text-violet-400">●</span> Nível UF (sem município): <span className="font-semibold text-[color:var(--text-primary)]">{formatBRLCompact(destinos.estadual)}</span>
                <span className="text-slate-600 dark:text-slate-500"> ({destinos.qtdEst})</span>
              </p>
              {/* SP deixa o valor em branco em muitas emendas (todas as
                  transferências voluntárias de 2026): elas entram na contagem
                  acima, mas não no total — e R$ 0 não é o valor delas. */}
              {semValorPublicado > 0 && (
                <p title="O governo do estado não divulgou o valor destas emendas; o total acima soma só as que têm valor">
                  <span className="text-slate-400">●</span> Sem valor publicado pelo governo do estado:{' '}
                  <span className="font-semibold text-[color:var(--text-primary)]">{semValorPublicado}</span>
                </p>
              )}
            </div>
          )}
          {!loading && porTipo.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2 justify-end max-w-[360px]">
              {porTipo.map((t) => (
                <span
                  key={t.tipo}
                  className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold"
                  style={{
                    background: 'var(--tint-06)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--tint-08)',
                  }}
                  title={`${t.qtd} ${t.qtd === 1 ? 'emenda' : 'emendas'}${t.semValor ? ` — ${t.semValor} sem valor publicado pelo governo do estado` : ''}`}
                >
                  {t.tipo}: {t.semValor === t.qtd
                    ? `${t.semValor} sem valor publicado`
                    : <>{formatBRLCompact(t.total)}{t.semValor > 0 && <span className="font-normal text-[color:var(--text-tertiary)]"> + {t.semValor} sem valor</span>}</>}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-10 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-600 dark:text-slate-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Donut: Emendas por Área */}
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-04)' }}>
            <p className="text-[10px] uppercase tracking-widest font-bold text-[color:var(--text-tertiary)] mb-2">Distribuição por área</p>
            {porArea.length === 0 ? (
              <p className="text-xs text-slate-600 dark:text-slate-500 text-center py-10">Sem emendas em {ano}</p>
            ) : (
              <>
                <div className="h-56 relative">
                  <Donut3DChart
                    data={porArea.slice(0, 6)}
                    centerValue={formatBRLCompact(totalAno)}
                    centerLabel={`em ${ano}`}
                    valueFormatter={formatBRL}
                  />
                </div>
              </>
            )}
          </div>

          {/* Linha: Valor por Ano */}
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-04)' }}>
            <p className="text-[10px] uppercase tracking-widest font-bold text-[color:var(--text-tertiary)] mb-2">Valor por ano (histórico)</p>
            {porAno.length === 0 ? (
              <p className="text-xs text-slate-600 dark:text-slate-500 text-center py-10">Sem histórico disponível</p>
            ) : (
              <div className="space-y-2 mt-2">
                {porAno.map((p) => {
                  const pct = Math.max(2, (p.total / maxPorAno) * 100);
                  const isAnoSelecionado = p.ano === ano;
                  return (
                    <div key={p.ano} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={isAnoSelecionado ? 'text-[color:var(--brand-cobalt-text)] font-bold' : 'text-slate-700 dark:text-slate-300'}>{p.ano}</span>
                        <span className={isAnoSelecionado ? 'text-[color:var(--brand-cobalt-text)] font-bold' : 'text-[color:var(--text-primary)] font-semibold'}>
                          {formatBRLCompact(p.total)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--tint-06)] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: isAnoSelecionado
                              ? 'linear-gradient(90deg, #2563EB, var(--brand-cobalt-text))'
                              : 'linear-gradient(90deg, #4a9ede, #6cb9ed)',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Barras: Comparativo de todas as áreas (do ano selecionado) */}
          <div className="rounded-xl p-4" style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-04)' }}>
            <p className="text-[10px] uppercase tracking-widest font-bold text-[color:var(--text-tertiary)] mb-2">Comparativo de áreas em {ano}</p>
            {porArea.length === 0 ? (
              <p className="text-xs text-slate-600 dark:text-slate-500 text-center py-10">Sem dados</p>
            ) : (
              <div className="space-y-2 mt-2">
                {porArea.map((a) => {
                  const max = porArea[0].value;
                  const pct = Math.max(2, (a.value / max) * 100);
                  return (
                    <div key={a.area} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-700 dark:text-slate-300 truncate">{a.name}</span>
                        <span className="text-[color:var(--text-primary)] font-semibold">{formatBRLCompact(a.value)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--tint-06)] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: a.color, boxShadow: `0 0 6px ${a.color}66` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabela detalhada das emendas individuais */}
      {!loading && (emendas.length > 0 || destinosFlat.length > 0) && (
        <EmendasDetalhadasCard
          ano={ano}
          uf={uf}
          emendas={emendas}
          destinosFlat={destinosFlat}
          parlamentarId={parlamentar.cpf ?? parlamentar.idPortal}
        />
      )}


      {/* Destinos de transferências Pix (EC 105/2019) — preenche quando a
          emenda foi cadastrada a nível UF e o município só foi decidido
          depois via Pix Parlamentar. */}
      {!loading && pixPorMunicipio.length > 0 && (
        <MunicipiosPixCard
          ano={ano}
          pixPorMunicipio={pixPorMunicipio}
          pixTotal={pixTotal}
          onClick={(m) => onMunicipioClick?.({
            codigoIbge: m.codigoIbge,
            nome:       m.nome,
            uf:         m.uf,
            total:      m.total,
            areas:      [],
          })}
        />
      )}
    </div>
  );
}

export const FORM_NR_EMPTY = { numero: '', tipo: '', area: '', favorecido: '', municipio: '', uf: '', valor: '', observacao: '', documentoBase64: '', documentoNome: '' };

export function EmendasDetalhadasCard({
  ano, uf, emendas, destinosFlat, parlamentarId,
}: {
  ano: number;
  uf?: string;
  emendas: PortalEmenda[];
  destinosFlat: DestinoRow[];
  parlamentarId: string;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { data: session } = useSession() || {};

  const semDadosPagamento = emendas.length > 0
    && emendas.every((e) => e.autorCargo === 'DEPUTADO_ESTADUAL' && e.valorPago === 0);
  const semDadosExecucao = semDadosPagamento
    && emendas.every((e) => e.valorEmpenhado === 0);

  const [emendaSelecionada, setEmendaSelecionada] = useState<{
    codigo: string;
    titulo: string;
    filtroFavorecido?: { cnpj: string | null; nome: string | null; municipio: string | null; uf: string | null };
  } | null>(null);

  // ── Emendas não realizadas ───────────────────────────────────────────────────
  const [modoNR, setModoNR] = useState(false);
  const [emendasNR, setEmendasNR] = useState<EmendaNaoRealizadaLocal[]>([]);
  const [loadingNR, setLoadingNR] = useState(false);
  const [showFormNR, setShowFormNR] = useState(false);
  const [editingNR, setEditingNR] = useState<EmendaNaoRealizadaLocal | null>(null);
  const [formNR, setFormNR] = useState(FORM_NR_EMPTY);
  const [savingNR, setSavingNR] = useState(false);
  const [errNR, setErrNR] = useState('');
  const docInputRef = useRef<HTMLInputElement>(null);

  const fetchNR = useCallback(async () => {
    setLoadingNR(true);
    try {
      const res = await fetch(`/api/emendas-nao-realizadas?ano=${ano}&parlamentarId=${encodeURIComponent(parlamentarId)}`);
      if (res.ok) setEmendasNR(await res.json());
    } finally {
      setLoadingNR(false);
    }
  }, [ano, parlamentarId]);

  useEffect(() => { if (modoNR) fetchNR(); }, [modoNR, fetchNR]);

  const openNewNR = () => {
    setEditingNR(null);
    setFormNR(FORM_NR_EMPTY);
    setErrNR('');
    setShowFormNR(true);
  };

  const openEditNR = (item: EmendaNaoRealizadaLocal) => {
    setEditingNR(item);
    setFormNR({
      numero: item.numero ?? '',
      tipo: item.tipo ?? '',
      area: item.area ?? '',
      favorecido: item.favorecido,
      municipio: item.municipio ?? '',
      uf: item.uf ?? '',
      valor: item.valor ? String(item.valor) : '',
      observacao: item.observacao ?? '',
      documentoBase64: item.documentoBase64 ?? '',
      documentoNome: item.documentoNome ?? '',
    });
    setErrNR('');
    setShowFormNR(true);
  };

  const handleDocChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX = 7 * 1024 * 1024;
    if (file.size > MAX) { setErrNR('Documento muito grande (máx. 7MB).'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setFormNR((f) => ({ ...f, documentoBase64: (ev.target?.result as string) ?? '', documentoNome: file.name }));
    reader.readAsDataURL(file);
  };

  const saveNR = async () => {
    if (!formNR.favorecido.trim()) { setErrNR('Favorecido é obrigatório.'); return; }
    setSavingNR(true);
    setErrNR('');
    try {
      const body = { ...formNR, ano, parlamentarId, valor: parseFloat(formNR.valor.replace(',', '.')) || 0 };
      const url = editingNR ? `/api/emendas-nao-realizadas/${editingNR.id}` : '/api/emendas-nao-realizadas';
      const method = editingNR ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); setErrNR(e.error ?? 'Erro ao salvar.'); return; }
      setShowFormNR(false);
      setEditingNR(null);
      setFormNR(FORM_NR_EMPTY);
      fetchNR();
    } finally {
      setSavingNR(false);
    }
  };

  const deleteNR = async (id: string) => {
    if (!confirm('Excluir esta emenda não realizada?')) return;
    await fetch(`/api/emendas-nao-realizadas/${id}`, { method: 'DELETE' });
    fetchNR();
  };

  // Filtros
  const [busca, setBusca] = useState('');
  const [funcaoFiltro, setFuncaoFiltro] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [valorColuna, setValorColuna] = useState<'empenhado' | 'pago'>('empenhado');
  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');

  // Quando há destinosFlat usa-os; caso contrário usa emendas como fallback
  const usandoFlat = destinosFlat.length > 0;

  // Dropdowns: populados a partir dos destinos flat (ou emendas no fallback)
  const funcoes = useMemo(() => {
    const s = new Set<string>();
    if (usandoFlat) destinosFlat.forEach((d) => { if (d.funcao) s.add(d.funcao); });
    else            emendas.forEach((e) => { if (e.funcao) s.add(e.funcao); });
    return Array.from(s).sort();
  }, [usandoFlat, destinosFlat, emendas]);

  const tiposCurtos = useMemo(() => {
    const s = new Set<string>();
    if (usandoFlat) destinosFlat.forEach((d) => { if (d.tipoEmenda) s.add(tipoCurtoLabel(d.tipoEmenda)); });
    else            emendas.forEach((e) => { if (e.tipo) s.add(tipoCurtoLabel(e.tipo)); });
    return Array.from(s).sort();
  }, [usandoFlat, destinosFlat, emendas]);

  const normalizar = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const vMinNum = valorMin ? parseFloat(valorMin) : null;
  const vMaxNum = valorMax ? parseFloat(valorMax) : null;
  const q = normalizar(busca.trim());

  // ── Flat (destinos reais por favorecido) ──────────────────────────────────
  const destinosFiltrados = useMemo(() => {
    if (!usandoFlat) return [];
    return destinosFlat.filter((d) => {
      if (q && !normalizar(d.municipio ?? '').includes(q)
             && !normalizar(d.nomeFavorecido ?? '').includes(q)
             && !normalizar(d.funcao ?? '').includes(q)
             && !normalizar(d.numeroEmenda ?? '').includes(q)) return false;
      if (funcaoFiltro && d.funcao !== funcaoFiltro) return false;
      if (tipoFiltro && tipoCurtoLabel(d.tipoEmenda) !== tipoFiltro) return false;
      const valFiltro = valorColuna === 'pago' ? d.valorPago : d.valorEmpenhado;
      if (valorColuna === 'pago' && d.valorPago === 0) return false;
      if (vMinNum !== null && valFiltro < vMinNum) return false;
      if (vMaxNum !== null && valFiltro > vMaxNum) return false;
      return true;
    });
  }, [usandoFlat, destinosFlat, q, funcaoFiltro, tipoFiltro, valorColuna, vMinNum, vMaxNum]);

  // ── Fallback: emendas filtradas ───────────────────────────────────────────
  const emendasFiltradas = useMemo(() => {
    if (usandoFlat) return [];
    return [...emendas]
      .filter((e) => {
        if (q && !normalizar(e.municipioNome ?? '').includes(q)
               && !normalizar(e.funcao ?? '').includes(q)
               && !normalizar(e.objeto ?? '').includes(q)
               && !normalizar(e.numero ?? '').includes(q)) return false;
        if (funcaoFiltro && e.funcao !== funcaoFiltro) return false;
        if (tipoFiltro && tipoCurtoLabel(e.tipo) !== tipoFiltro) return false;
        const valFiltro = valorColuna === 'pago' ? (e.valorPago ?? 0) : (e.valorEmpenhado ?? 0);
        if (valorColuna === 'pago' && (e.valorPago ?? 0) === 0) return false;
        if (vMinNum !== null && valFiltro < vMinNum) return false;
        if (vMaxNum !== null && valFiltro > vMaxNum) return false;
        return true;
      })
      .sort((a, b) => (b.valorEmpenhado ?? 0) - (a.valorEmpenhado ?? 0));
  }, [usandoFlat, emendas, q, funcaoFiltro, tipoFiltro, valorColuna, vMinNum, vMaxNum]);

  const temFiltro = busca || funcaoFiltro || tipoFiltro || valorMin || valorMax || valorColuna !== 'empenhado';
  const totalItens   = usandoFlat ? destinosFlat.length   : emendas.length;
  const filtradoQtd  = usandoFlat ? destinosFiltrados.length : emendasFiltradas.length;
  const totalValor   = usandoFlat
    ? (temFiltro ? destinosFiltrados : destinosFlat).reduce((s, d) => s + d.valorEmpenhado, 0)
    : (temFiltro ? emendasFiltradas  : emendas).reduce((s, e) => s + (e.valorEmpenhado ?? 0), 0);

  const labelItens = usandoFlat ? 'destinos' : (emendas.length === 1 ? 'emenda' : 'emendas');

  const limparFiltros = () => { setBusca(''); setFuncaoFiltro(''); setTipoFiltro(''); setValorMin(''); setValorMax(''); };

  return (
    <div
      className="mt-4 rounded-2xl overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div
        className="px-5 py-3.5 flex items-center justify-between gap-2 md:gap-4 flex-wrap"
        style={{ borderBottom: '1px solid var(--tint-06)', background: 'var(--tint-04)' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-1 h-4 rounded-full" style={{ background: 'linear-gradient(180deg,#f59e0b,#d97706)' }} />
          <p className="text-xs font-bold text-[color:var(--text-primary)] tracking-wide">Detalhe das Emendas</p>
          <span className="text-[10px] text-slate-600 dark:text-slate-500 font-medium">{ano}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle: Emendas não realizadas */}
          <button
            onClick={() => { setModoNR((v) => !v); setShowFormNR(false); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all"
            style={modoNR
              ? { background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)' }
              : { background: 'var(--tint-04)', color: 'var(--text-secondary)', border: '1px solid var(--tint-08)' }}
          >
            <AlertCircle className="w-3.5 h-3.5" />
            Não realizadas
          </button>

          {!modoNR && (
            <>
              {semDadosExecucao && (
                <span className="text-[10px] text-[color:var(--brand-cobalt)]/70 italic hidden sm:block">Sem dados de execução estadual</span>
              )}
              {semDadosPagamento && !semDadosExecucao && (
                <span className="text-[10px] text-[color:var(--brand-cobalt)]/70 italic hidden sm:block">Sem dados de pagamento estadual</span>
              )}
              <div className="flex items-center gap-2 px-3 py-1 rounded-full" style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-08)' }}>
                {temFiltro && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
                <span className="text-[11px] font-semibold text-[color:var(--text-primary)]">{temFiltro ? filtradoQtd : totalItens}</span>
                <span className="text-[10px] text-slate-600 dark:text-slate-400">{labelItens}</span>
                <span className="text-slate-600 text-[10px]">·</span>
                <span className="text-[11px] font-semibold text-[color:var(--success)]">{formatBRLCompact(totalValor)}</span>
              </div>
              {temFiltro && (
                <button
                  onClick={limparFiltros}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium text-slate-700 dark:text-slate-300 hover:text-white transition-colors"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
                >
                  <X className="w-3 h-3" /> Limpar
                </button>
              )}
            </>
          )}

          {modoNR && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full" style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-08)' }}>
              <span className="text-[11px] font-semibold text-[color:var(--text-primary)]">{emendasNR.length}</span>
              <span className="text-[10px] text-slate-600 dark:text-slate-400">registros</span>
              {emendasNR.length > 0 && (
                <>
                  <span className="text-slate-600 text-[10px]">·</span>
                  <span className="text-[11px] font-semibold" style={{ color: '#ef4444' }}>
                    {formatBRLCompact(emendasNR.reduce((s, e) => s + e.valor, 0))}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Emendas Não Realizadas ───────────────────────────────────────── */}
      {modoNR && (
        <div className="px-5 py-4">
          {/* Botão adicionar + form */}
          {!showFormNR ? (
            <button
              onClick={openNewNR}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold mb-4 transition-all hover:opacity-90"
              style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.35)' }}
            >
              <Plus className="w-4 h-4" /> Adicionar emenda não realizada
            </button>
          ) : (
            <div className="mb-4 rounded-xl p-4" style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-10)' }}>
              <p className="text-[11px] font-bold text-[color:var(--text-primary)] mb-3 uppercase tracking-widest">
                {editingNR ? 'Editar emenda' : 'Nova emenda não realizada'}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
                {([
                  { key: 'numero',    label: 'Nº',          placeholder: '0001' },
                  { key: 'tipo',      label: 'Tipo',        placeholder: 'Individual' },
                  { key: 'area',      label: 'Área',        placeholder: 'Saúde' },
                  { key: 'favorecido',label: 'Favorecido *',placeholder: 'Nome do favorecido' },
                  { key: 'municipio', label: 'Município',   placeholder: 'São Paulo' },
                  { key: 'uf',        label: 'UF',          placeholder: 'SP' },
                ] as const).map(({ key, label, placeholder }) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-500">{label}</label>
                    <input
                      value={formNR[key]}
                      onChange={(e) => setFormNR((f) => ({ ...f, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="h-8 px-2.5 rounded-lg text-[12px] text-[color:var(--text-primary)] placeholder-slate-500 outline-none"
                      style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-10)' }}
                      maxLength={key === 'uf' ? 2 : undefined}
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-500">Valor (R$)</label>
                  <input
                    value={formNR.valor}
                    onChange={(e) => setFormNR((f) => ({ ...f, valor: e.target.value }))}
                    placeholder="0,00"
                    type="text"
                    inputMode="decimal"
                    className="h-8 px-2.5 rounded-lg text-[12px] text-[color:var(--text-primary)] placeholder-slate-500 outline-none w-40"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-10)' }}
                  />
                </div>
              </div>
              {/* Observação */}
              <div className="flex flex-col gap-1 mb-3">
                <label className="text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-500">Observação</label>
                <textarea
                  value={formNR.observacao}
                  onChange={(e) => setFormNR((f) => ({ ...f, observacao: e.target.value }))}
                  placeholder="Descreva o motivo ou detalhes da emenda não realizada..."
                  rows={3}
                  className="px-2.5 py-2 rounded-lg text-[12px] text-[color:var(--text-primary)] placeholder-slate-500 outline-none resize-none w-full"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-10)' }}
                />
              </div>
              {/* Documento */}
              <div className="flex flex-col gap-1 mb-3">
                <label className="text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-500">Documento</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => docInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                    style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-10)', color: 'var(--text-secondary)' }}
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    {formNR.documentoBase64 ? 'Trocar documento' : 'Anexar documento'}
                  </button>
                  {formNR.documentoNome && (
                    <>
                      <span className="text-[11px] text-slate-500 truncate max-w-[200px]">{formNR.documentoNome}</span>
                      <button
                        type="button"
                        onClick={() => setFormNR((f) => ({ ...f, documentoBase64: '', documentoNome: '' }))}
                        className="text-slate-400 hover:text-red-400 transition-colors"
                        title="Remover documento"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
                <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={handleDocChange} className="hidden" />
              </div>
              {errNR && <p className="text-[11px] text-red-400 mb-2">{errNR}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={saveNR}
                  disabled={savingNR}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all disabled:opacity-50"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)' }}
                >
                  {savingNR ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Salvar
                </button>
                <button
                  onClick={() => { setShowFormNR(false); setEditingNR(null); setErrNR(''); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-slate-500 hover:text-slate-700 transition-all"
                  style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-08)' }}
                >
                  <X className="w-3.5 h-3.5" /> Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Tabela NR */}
          {loadingNR ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
            </div>
          ) : emendasNR.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-500">
              <AlertCircle className="w-6 h-6 opacity-40" />
              <p className="text-[12px]">Nenhuma emenda não realizada registrada para {ano}.</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-[12px] border-separate border-spacing-0">
                <thead>
                  <tr style={{ background: 'rgba(239,68,68,0.06)' }}>
                    {['Nº', 'Tipo', 'Área', 'Favorecido', 'Município', 'Valor', 'Ações'].map((h, i) => (
                      <th
                        key={h}
                        className={`py-2.5 px-3 text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-500 whitespace-nowrap ${i === 5 ? 'text-right' : i === 6 ? 'text-center' : 'text-left'}`}
                        style={{ borderBottom: '1px solid var(--tint-06)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {emendasNR.map((item, i) => (
                    <tr key={item.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--tint-04)' }}>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-500 whitespace-nowrap" style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        {item.numero ?? '—'}
                      </td>
                      <td className="py-2.5 px-3" style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        <div className="flex flex-col gap-0.5">
                          {item.tipo ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                              {item.tipo}
                            </span>
                          ) : <span className="text-slate-500">—</span>}
                          {item.estagio && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706', border: '1px solid rgba(245,158,11,0.3)' }}>
                              {item.estagio}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 truncate max-w-[100px] text-slate-700 dark:text-slate-300" style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        {item.area ?? '—'}
                      </td>
                      <td className="py-2.5 px-3 max-w-[200px]" style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate block">{item.favorecido}</span>
                        {item.observacao && (
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate block mt-0.5" title={item.observacao}>{item.observacao}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap" style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        {item.municipio ?? '—'}
                        {item.uf && <span className="text-slate-500 ml-1 text-[10px]">/ {item.uf}</span>}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold whitespace-nowrap" style={{ borderBottom: '1px solid var(--tint-04)', color: '#ef4444' }}>
                        {formatBRLCompact(item.valor)}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap" style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        {item.deletavel === false ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'var(--tint-04)', color: 'var(--text-secondary)', border: '1px solid var(--tint-08)' }}>
                            Portal
                          </span>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            {item.documentoBase64 && (
                              <a
                                href={item.documentoBase64}
                                download={item.documentoNome ?? 'documento'}
                                className="p-1 rounded hover:bg-green-500/10 text-slate-500 hover:text-green-500 transition-colors"
                                title={`Baixar ${item.documentoNome ?? 'documento'}`}
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                              </a>
                            )}
                            <button onClick={() => openEditNR(item)} className="p-1 rounded hover:bg-blue-500/10 text-slate-500 hover:text-blue-400 transition-colors" title="Editar">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteNR(item.id)} className="p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors" title="Excluir">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Barra de filtros ─────────────────────────────────────────────── */}
      {!modoNR && <div className="px-5 py-3 flex flex-wrap gap-2" style={{ borderBottom: '1px solid var(--tint-04)' }}>
        {/* Busca */}
        <div className="relative flex-1 min-w-[120px] md:min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 dark:text-slate-500 pointer-events-none" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={usandoFlat ? 'Buscar favorecido, município ou nº…' : 'Buscar município, função ou nº…'}
            className="w-full h-9 rounded-xl pl-9 pr-3 text-[12px] text-[color:var(--text-primary)] placeholder-slate-500 outline-none transition-all"
            style={{
              background: busca ? 'rgba(245,158,11,0.08)' : 'var(--tint-04)',
              border: busca ? '1px solid rgba(245,158,11,0.35)' : '1px solid var(--tint-08)',
            }}
          />
        </div>

        {/* Área — dropdown padrão do sistema (Radix, tematizado, com check) */}
        <Select
          className="min-w-[150px] max-w-[190px]"
          value={funcaoFiltro}
          onChange={(e) => setFuncaoFiltro(e.target.value)}
          options={[{ value: '', label: 'Todas as áreas' }, ...funcoes.map((f) => ({ value: f, label: f }))]}
        />

        {/* Tipo */}
        <Select
          className="min-w-[150px] max-w-[190px]"
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value)}
          options={[{ value: '', label: 'Todos os tipos' }, ...tiposCurtos.map((t) => ({ value: t, label: t }))]}
        />

        {/* Coluna de valor + faixa */}
        <div className="flex items-center gap-1.5">
          {/* Toggle Empenhado / Pago */}
          <div className="flex rounded-xl overflow-hidden border border-[var(--tint-10)] flex-shrink-0">
            {(['empenhado', 'pago'] as const).map((col) => (
              <button
                key={col}
                onClick={() => { setValorColuna(col); setValorMin(''); setValorMax(''); }}
                className="h-9 px-3 text-[11px] font-semibold transition-all whitespace-nowrap"
                style={{
                  background: valorColuna === col ? 'rgba(74,158,222,0.2)' : 'var(--tint-04)',
                  color: valorColuna === col ? '#4a9ede' : '#64748b',
                  borderRight: col === 'empenhado' ? '1px solid var(--tint-08)' : undefined,
                }}
              >
                {col === 'empenhado' ? 'Empenhado' : 'Pago'}
              </button>
            ))}
          </div>
          {/* Faixa de valor */}
          <div className="flex items-center gap-1.5 min-w-[160px]">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 dark:text-slate-500 font-medium pointer-events-none">R$</span>
              <input
                value={valorMin}
                onChange={(e) => setValorMin(e.target.value)}
                placeholder="Mín"
                type="number"
                min={0}
                className="w-full h-9 rounded-xl pl-7 pr-2 text-[12px] text-[color:var(--text-primary)] placeholder-slate-500 outline-none transition-all"
                style={{
                  background: valorMin ? 'rgba(74,158,222,0.1)' : 'var(--tint-04)',
                  border: valorMin ? '1px solid rgba(74,158,222,0.35)' : '1px solid var(--tint-08)',
                }}
              />
            </div>
            <div className="w-3 h-px bg-slate-600 flex-shrink-0" />
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 dark:text-slate-500 font-medium pointer-events-none">R$</span>
              <input
                value={valorMax}
                onChange={(e) => setValorMax(e.target.value)}
                placeholder="Máx"
                type="number"
                min={0}
                className="w-full h-9 rounded-xl pl-7 pr-2 text-[12px] text-[color:var(--text-primary)] placeholder-slate-500 outline-none transition-all"
                style={{
                  background: valorMax ? 'rgba(74,158,222,0.1)' : 'var(--tint-04)',
                  border: valorMax ? '1px solid rgba(74,158,222,0.35)' : '1px solid var(--tint-08)',
                }}
              />
            </div>
          </div>
        </div>
      </div>}

      {/* ── Tabelas ──────────────────────────────────────────────────────── */}
      {!modoNR && <div className="px-5 pb-4">
        {/* Vazio */}
        {((usandoFlat && destinosFiltrados.length === 0) || (!usandoFlat && emendasFiltradas.length === 0)) && (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Search className="w-5 h-5 text-slate-600" />
            <p className="text-[12px] text-slate-600 dark:text-slate-500">Nenhum resultado encontrado</p>
            {temFiltro && (
              <button onClick={limparFiltros} className="text-[11px] text-[color:var(--brand-cobalt)] hover:text-[color:var(--brand-cobalt-text)] mt-1 transition-colors">
                Limpar filtros
              </button>
            )}
          </div>
        )}

        {/* Flat */}
        {usandoFlat && destinosFiltrados.length > 0 && (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[12px] border-separate border-spacing-0">
              <thead>
                <tr style={{ background: 'var(--tint-04)' }}>
                  {(['Nº', 'Tipo', 'Área', 'Favorecido', 'Município', 'Empenhado', 'Pago', '%'] as const).map((h, i) => (
                    <th
                      key={h}
                      className={`py-2.5 px-3 text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-500 whitespace-nowrap ${i >= 5 ? 'text-right' : 'text-left'}`}
                      style={{ borderBottom: '1px solid var(--tint-06)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {destinosFiltrados.map((d, i) => {
                  const tipo = tipoCurtoInfo(d.tipoEmenda);
                  const pct  = d.valorEmpenhado > 0 ? (d.valorPago / d.valorEmpenhado) * 100 : 0;
                  const par  = i % 2 === 0;
                  return (
                    <tr
                      key={`${d.codigoEmenda}-${d.cnpjFavorecido ?? d.nomeFavorecido ?? i}`}
                      onClick={() => setEmendaSelecionada({
                        codigo: d.codigoEmenda,
                        titulo: d.numeroEmenda ? `Emenda nº ${d.numeroEmenda}` : `Emenda ${d.codigoEmenda}`,
                        filtroFavorecido: { cnpj: d.cnpjFavorecido, nome: d.nomeFavorecido, municipio: d.municipio, uf: d.uf },
                      })}
                      className="group cursor-pointer transition-colors hover:bg-[var(--brand-cobalt-soft)]"
                      style={{ background: par ? 'transparent' : 'var(--tint-04)' }}
                      title="Clique para ver todos os documentos desta emenda"
                    >
                      <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap transition-colors group-hover:text-[color:var(--brand-cobalt-text)]" style={{ borderBottom: '1px solid var(--tint-04)', color: isDark ? '#64748b' : '#475569' }}>
                        {d.numeroEmenda ?? '—'}
                      </td>
                      <td className="py-2.5 px-3" style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        <span
                          title={tipo.hint}
                          className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold cursor-help whitespace-nowrap"
                          style={{ background: isDark ? `${tipo.color}18` : `${tipo.color}22`, color: isDark ? tipo.color : tipo.colorLight, border: `1px solid ${isDark ? `${tipo.color}40` : `${tipo.color}70`}` }}
                        >
                          {tipo.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 truncate max-w-[80px] md:max-w-[110px] transition-colors group-hover:text-[color:var(--brand-cobalt-text)]" title={d.funcao ?? ''} style={{ borderBottom: '1px solid var(--tint-04)', color: isDark ? '#cbd5e1' : '#374151' }}>
                        {d.funcao ?? '—'}
                      </td>
                      <td className="py-2.5 px-3 truncate max-w-[140px] md:max-w-[220px]" title={d.nomeFavorecido ?? ''} style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        <span className="font-medium transition-colors group-hover:text-[color:var(--brand-cobalt-text)]" style={{ color: isDark ? '#f1f5f9' : '#111827' }}>
                          {d.nomeFavorecido ?? <span className="italic font-normal" style={{ color: isDark ? '#64748b' : '#6b7280' }}>sem favorecido</span>}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 truncate max-w-[100px] md:max-w-[150px]" style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        {d.municipio ? (
                          <span className="transition-colors group-hover:text-[color:var(--brand-cobalt-text)]" style={{ color: isDark ? '#94a3b8' : '#374151' }}>
                            {d.municipio}
                            {d.uf && <span className="ml-1 text-[10px]" style={{ color: isDark ? '#64748b' : '#6b7280' }}>/ {d.uf}</span>}
                          </span>
                        ) : <span style={{ color: isDark ? '#64748b' : '#9ca3af' }}>—</span>}
                      </td>
                      {d.semValorPublicado ? (
                        // SP: o governo deixou os campos de valor em branco
                        // (todas as transferências voluntárias de 2026) —
                        // "R$ 0 · R$ 0 · 0%" diria que a emenda vale zero.
                        <td colSpan={3} className="py-2.5 px-3 text-right text-[11px] italic whitespace-nowrap"
                          style={{ borderBottom: '1px solid var(--tint-04)', color: 'var(--text-tertiary)' }}
                          title="O governo do estado não divulgou o valor desta emenda">
                          Valor não publicado pelo governo do estado
                        </td>
                      ) : d.soValorDestinado ? (<>
                        <td className="py-2.5 px-3 text-right font-semibold whitespace-nowrap" style={{ borderBottom: '1px solid var(--tint-04)', color: isDark ? 'var(--text-primary)' : '#1e40af' }}>
                          {formatBRLCompact(d.valorProposto ?? d.valorEmpenhado)}
                          <span className="block text-[10px] font-normal" style={{ color: 'var(--text-tertiary)' }}>valor destinado</span>
                        </td>
                        <td colSpan={2} className="py-2.5 px-3 text-right text-[11px] italic whitespace-nowrap"
                          style={{ borderBottom: '1px solid var(--tint-04)', color: 'var(--text-tertiary)' }}
                          title="O governo do RJ não publica o empenho nem o pagamento de cada emenda estadual">
                          Execução não publicada
                        </td>
                      </>) : (<>
                        <td className="py-2.5 px-3 text-right font-semibold whitespace-nowrap transition-colors group-hover:text-[color:var(--brand-cobalt-text)]" style={{ borderBottom: '1px solid var(--tint-04)', color: isDark ? 'var(--text-primary)' : '#1e40af' }}>
                          {formatBRLCompact(d.valorEmpenhado)}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap font-semibold" style={{ borderBottom: '1px solid var(--tint-04)', color: isDark ? '#10b981' : '#047857' }}>
                          {formatBRLCompact(d.valorPago)}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap" style={{ borderBottom: '1px solid var(--tint-04)' }}>
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={{
                              background: pct >= 80 ? (isDark ? 'rgba(16,185,129,0.12)' : 'rgba(5,150,105,0.14)') : pct >= 40 ? (isDark ? 'rgba(245,158,11,0.12)' : 'rgba(180,83,9,0.12)') : (isDark ? 'rgba(100,116,139,0.12)' : 'rgba(71,85,105,0.1)'),
                              color:      pct >= 80 ? (isDark ? '#10b981' : '#047857') : pct >= 40 ? (isDark ? '#f59e0b' : '#b45309') : (isDark ? '#64748b' : '#475569'),
                            }}
                          >
                            {pct.toFixed(0)}%
                          </span>
                        </td>
                      </>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Fallback por emenda */}
        {!usandoFlat && emendasFiltradas.length > 0 && (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[12px] border-separate border-spacing-0">
              <thead>
                <tr style={{ background: 'var(--tint-04)' }}>
                  {(['Nº', 'Tipo', 'Área', 'Destino', 'Empenhado', 'Pago', '%'] as const).map((h, i) => (
                    <th
                      key={h}
                      className={`py-2.5 px-3 text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-slate-500 whitespace-nowrap ${i >= 4 ? 'text-right' : 'text-left'}`}
                      style={{ borderBottom: '1px solid var(--tint-06)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {emendasFiltradas.map((e, i) => {
                  const tipo = tipoCurtoInfo(e.tipo);
                  const pct  = e.valorEmpenhado > 0 ? (e.valorPago / e.valorEmpenhado) * 100 : 0;
                  const par  = i % 2 === 0;
                  return (
                    <tr
                      key={e.idPortal}
                      onClick={() => setEmendaSelecionada({ codigo: e.idPortal, titulo: e.numero ? `Emenda nº ${e.numero}` : `Emenda ${e.idPortal}` })}
                      className="group cursor-pointer transition-colors"
                      style={{ background: par ? 'transparent' : 'rgba(255,255,255,0.015)' }}
                      title="Clique para ver favorecidos e breakdown por fase"
                    >
                      <td className="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap transition-colors" style={{ borderBottom: '1px solid var(--tint-04)', color: isDark ? '#64748b' : '#475569' }}>{e.numero ?? '—'}</td>
                      <td className="py-2.5 px-3" style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        <span title={tipo.hint} className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold cursor-help whitespace-nowrap" style={{ background: isDark ? `${tipo.color}18` : `${tipo.color}22`, color: isDark ? tipo.color : tipo.colorLight, border: `1px solid ${isDark ? `${tipo.color}40` : `${tipo.color}70`}` }}>{tipo.label}</span>
                      </td>
                      <td className="py-2.5 px-3 truncate max-w-[100px] md:max-w-[140px] transition-colors" title={e.funcao ?? ''} style={{ borderBottom: '1px solid var(--tint-04)', color: isDark ? '#cbd5e1' : '#374151' }}>{e.funcao ?? '—'}</td>
                      <td className="py-2.5 px-3 truncate max-w-[200px] font-medium transition-colors" title={e.municipioNome ?? e.objeto ?? ''} style={{ borderBottom: '1px solid var(--tint-04)', color: isDark ? '#f1f5f9' : '#111827' }}>
                        {e.municipioNome ?? <span className="italic font-normal" style={{ color: isDark ? '#64748b' : '#6b7280' }}>{e.objeto ?? 'sem destino'}</span>}
                        {/* Em QUE o dinheiro pode ser gasto, logo abaixo do
                            destino. Texto simples e nao etiqueta: sao frases
                            inteiras ("Equipamentos e material permanente"),
                            que numa pilula de 9px ficariam cortadas. */}
                        {e.natureza && (
                          <span className="block text-[10px] font-normal leading-tight truncate"
                            title={e.natureza} style={{ color: 'var(--text-tertiary)' }}>
                            {e.natureza}
                          </span>
                        )}
                      </td>
                      {e.semValorPublicado ? (
                        <td colSpan={3} className="py-2.5 px-3 text-right text-[11px] italic whitespace-nowrap"
                          style={{ borderBottom: '1px solid var(--tint-04)', color: 'var(--text-tertiary)' }}
                          title="O governo do estado não divulgou o valor desta emenda">
                          Valor não publicado pelo governo do estado
                        </td>
                      ) : e.soValorDestinado ? (<>
                        {/* RJ: o governo publica só o valor destinado — sem
                            empenho nem pagamento por emenda. Pago "R$ 0" e
                            "0%" diriam que nada foi executado, o que não se
                            sabe. */}
                        <td className="py-2.5 px-3 text-right font-semibold whitespace-nowrap" style={{ borderBottom: '1px solid var(--tint-04)', color: isDark ? 'var(--text-primary)' : '#1e40af' }}>
                          {formatBRLCompact(e.valorProposto ?? e.valorEmpenhado)}
                          <span className="block text-[10px] font-normal" style={{ color: 'var(--text-tertiary)' }}>valor destinado</span>
                        </td>
                        <td colSpan={2} className="py-2.5 px-3 text-right text-[11px] italic whitespace-nowrap"
                          style={{ borderBottom: '1px solid var(--tint-04)', color: 'var(--text-tertiary)' }}
                          title="O governo do RJ não publica o empenho nem o pagamento de cada emenda estadual">
                          Execução não publicada
                        </td>
                      </>) : (<>
                      <td className="py-2.5 px-3 text-right font-semibold whitespace-nowrap group-hover:text-[color:var(--brand-cobalt-text)] transition-colors" style={{ borderBottom: '1px solid var(--tint-04)', color: isDark ? 'var(--text-primary)' : '#1e40af' }}>
                        {formatBRLCompact(e.valorEmpenhado)}
                        {/* Empenhar acima ou abaixo do que a emenda destinou e
                            comum — em 2025 aconteceu em 37% das do DF — e a
                            diferenca so aparece com os dois numeros juntos. */}
                        {e.valorEmpenhadoEmenda != null && e.municipiosNaEmenda ? (
                          <span className="block text-[10px] font-normal" style={{ color: 'var(--text-tertiary)' }}
                            title={`Esta emenda foi dividida entre ${e.municipiosNaEmenda} municípios; o valor acima é o desta cidade`}>
                            de {formatBRLCompact(e.valorEmpenhadoEmenda)} · {e.municipiosNaEmenda} municípios
                          </span>
                        ) : e.valorProposto != null && e.valorProposto !== e.valorEmpenhado && (
                          <span className="block text-[10px] font-normal" style={{ color: 'var(--text-tertiary)' }}
                            title="Valor destinado pelo parlamentar na emenda">
                            de {formatBRLCompact(e.valorProposto)}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap font-semibold" style={{ borderBottom: '1px solid var(--tint-04)', color: isDark ? '#10b981' : '#047857' }}>{formatBRLCompact(e.valorPago)}</td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap" style={{ borderBottom: '1px solid var(--tint-04)' }}>
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{
                          background: pct >= 80 ? (isDark ? 'rgba(16,185,129,0.12)' : 'rgba(5,150,105,0.14)') : pct >= 40 ? (isDark ? 'rgba(245,158,11,0.12)' : 'rgba(180,83,9,0.12)') : (isDark ? 'rgba(100,116,139,0.12)' : 'rgba(71,85,105,0.1)'),
                          color:      pct >= 80 ? (isDark ? '#10b981' : '#047857') : pct >= 40 ? (isDark ? '#f59e0b' : '#b45309') : (isDark ? '#64748b' : '#475569'),
                        }}>{pct.toFixed(0)}%</span>
                      </td>
                      </>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      <EmendaDocumentosModal
        codigoEmenda={emendaSelecionada?.codigo ?? null}
        tituloFallback={emendaSelecionada?.titulo}
        filtroUf={uf}
        filtroFavorecido={emendaSelecionada?.filtroFavorecido}
        onClose={() => setEmendaSelecionada(null)}
      />
    </div>
  );
}

// Extrai label curto do tipo de emenda (usado nos filtros e na tabela)
export function tipoCurtoLabel(tipo: string | null): string {
  const t = (tipo ?? '').toLowerCase();
  if (t.includes('individual') && t.includes('especial'))   return 'Individual / Especial';
  if (t.includes('individual') && t.includes('finalidade')) return 'Individual / Finalidade';
  if (t.includes('individual'))  return 'Individual';
  if (t.includes('bancada'))     return 'Bancada';
  if (t.includes('comiss'))      return 'Comissão';
  if (t.includes('relator'))     return 'Relator';
  return tipo ?? '—';
}

export function tipoCurtoInfo(tipo: string | null): { label: string; color: string; colorLight: string; hint: string } {
  const t = (tipo ?? '').toLowerCase();
  if (t.includes('individual') && t.includes('especial'))   return { label: 'Individual / Especial',   color: '#a855f7', colorLight: '#7c3aed', hint: 'Transferência Especial ("Emenda Pix") — parlamentar destina sem definir objeto.' };
  if (t.includes('individual') && t.includes('finalidade')) return { label: 'Individual / Finalidade', color: '#3b82f6', colorLight: '#1d4ed8', hint: 'Transferência com Finalidade Definida — destinação para objeto específico.' };
  if (t.includes('individual'))  return { label: 'Individual',  color: '#3b82f6', colorLight: '#1d4ed8', hint: 'Emenda Individual — cota anual de cada parlamentar.' };
  if (t.includes('bancada'))     return { label: 'Bancada',     color: '#10b981', colorLight: '#047857', hint: 'Emenda de Bancada Estadual — proposta coletiva.' };
  if (t.includes('comiss'))      return { label: 'Comissão',    color: '#f59e0b', colorLight: '#b45309', hint: 'Emenda de Comissão — proposta por comissão temática.' };
  if (t.includes('relator'))     return { label: 'Relator',     color: '#ec4899', colorLight: '#be185d', hint: 'Emenda do Relator (RP9) — perdeu eficácia após STF 2022.' };
  return { label: tipo ?? '—', color: '#94a3b8', colorLight: '#475569', hint: tipo ?? '' };
}

export function MunicipiosBeneficiadosCard({
  ano, porMunicipio, onClick,
}: {
  ano: number;
  porMunicipio: ParlamentarPorMunicipio[];
  onClick?: (m: ParlamentarPorMunicipio) => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const MAX_INICIAL = 8;
  const visiveis = expandido ? porMunicipio : porMunicipio.slice(0, MAX_INICIAL);
  const total = porMunicipio.reduce((s, m) => s + m.total, 0);

  return (
    <div
      className="mt-4 rounded-xl p-4"
      style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-04)' }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <p className="text-[10px] uppercase tracking-widest font-bold text-[color:var(--text-tertiary)]">
          Municípios beneficiados em {ano}
        </p>
        {porMunicipio.length > 0 && (
          <p className="text-[10px] text-slate-600 dark:text-slate-500">
            {porMunicipio.length} {porMunicipio.length === 1 ? 'município' : 'municípios'} ·{' '}
            <span className="text-[color:var(--brand-cobalt-text)] font-semibold">{formatBRLCompact(total)}</span>
          </p>
        )}
      </div>

      {porMunicipio.length === 0 ? (
        <p className="text-xs text-slate-600 dark:text-slate-500 text-center py-6">
          Nenhuma emenda com município identificado em {ano}.
          <br />
          <span className="text-slate-600 text-[10px]">
            (emendas com destino &ldquo;Nacional&rdquo; ou &ldquo;UF&rdquo; não aparecem aqui)
          </span>
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {visiveis.map((m, i) => (
              <button
                key={m.codigoIbge}
                onClick={onClick ? () => onClick(m) : undefined}
                disabled={!onClick}
                className="w-full text-left px-3 py-2.5 rounded-xl transition-colors group disabled:cursor-default"
                style={{
                  background: 'var(--bg-card-subtle)',
                  border: '1px solid var(--tint-04)',
                }}
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 w-5 flex-shrink-0">{i + 1}.</span>
                    <span className="text-[color:var(--text-primary)] text-sm font-semibold truncate group-hover:text-[color:var(--brand-cobalt-text)] transition-colors">
                      {m.nome}
                    </span>
                    {m.uf && (
                      <span className="text-[10px] text-slate-600 dark:text-slate-500 flex-shrink-0">/ {m.uf}</span>
                    )}
                  </div>
                  <span className="text-[color:var(--brand-cobalt-text)] font-bold text-sm whitespace-nowrap">
                    {formatBRLCompact(m.total)}
                  </span>
                </div>
                {/* Chips de áreas */}
                <div className="flex flex-wrap gap-1.5 pl-7">
                  {m.areas.map(({ area, valor }) => (
                    <span
                      key={area}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium"
                      style={{
                        background: `${AREA_COLORS[area]}22`,
                        color: AREA_COLORS[area],
                        border: `1px solid ${AREA_COLORS[area]}44`,
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: AREA_COLORS[area] }} />
                      {AREA_LABELS[area]}
                      <span className="text-[color:var(--text-primary)]/70 font-semibold">{formatBRLCompact(valor)}</span>
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>

          {porMunicipio.length > MAX_INICIAL && (
            <button
              onClick={() => setExpandido((v) => !v)}
              className="mt-3 w-full text-center text-[11px] text-[color:var(--brand-cobalt-text)] hover:text-[color:var(--brand-cobalt-text)] font-semibold transition-colors py-1.5 rounded-lg hover:bg-amber-300/5"
            >
              {expandido
                ? `Mostrar apenas os ${MAX_INICIAL} maiores`
                : `Ver todos os ${porMunicipio.length} municípios`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// Lista de municípios que receberam Transferência Especial (Pix) do parlamentar.
// Aparece quando as emendas originais foram cadastradas a nível UF e o destino
// real só foi resolvido depois via repasse Pix (modalidade EC 105/2019).
export function MunicipiosPixCard({
  ano, pixPorMunicipio, pixTotal, onClick,
}: {
  ano: number;
  pixPorMunicipio: { codigoIbge: string; nome: string; uf: string | null; total: number; qtd: number }[];
  pixTotal: number;
  onClick?: (m: { codigoIbge: string; nome: string; uf: string | null; total: number; qtd: number }) => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const MAX_INICIAL = 8;
  const visiveis = expandido ? pixPorMunicipio : pixPorMunicipio.slice(0, MAX_INICIAL);
  return (
    <div
      className="mt-4 rounded-xl p-4"
      style={{
        background: 'linear-gradient(135deg, rgba(168,85,247,0.06), var(--bg-card-subtle))',
        border: '1px solid rgba(168,85,247,0.25)',
      }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest"
            style={{ background: 'rgba(168,85,247,0.18)', color: 'var(--acento-violeta)', border: '1px solid rgba(168,85,247,0.35)' }}
          >
            Pix
          </span>
          <p className="text-[10px] uppercase tracking-widest font-bold text-[color:var(--text-tertiary)]">
            Municípios que receberam Pix em {ano}
          </p>
        </div>
        <p className="text-[10px] text-slate-600 dark:text-slate-500">
          {pixPorMunicipio.length} {pixPorMunicipio.length === 1 ? 'município' : 'municípios'} ·{' '}
          <span className="text-violet-300 font-semibold">{formatBRLCompact(pixTotal)}</span>
        </p>
      </div>

      <p className="text-[10px] text-slate-600 dark:text-slate-500 italic mb-3 leading-snug">
        Transferências Especiais (EC 105/2019) — destinos reais dos repasses Pix do parlamentar
        quando a emenda original foi cadastrada só a nível UF.
      </p>

      <div className="space-y-2">
        {visiveis.map((m, i) => (
          <button
            key={m.codigoIbge}
            onClick={onClick ? () => onClick(m) : undefined}
            disabled={!onClick}
            className="w-full text-left px-3 py-2.5 rounded-xl transition-colors group disabled:cursor-default"
            style={{
              background: 'var(--bg-card-subtle)',
              border: '1px solid var(--tint-04)',
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 w-5 flex-shrink-0">{i + 1}.</span>
                <span className="text-[color:var(--text-primary)] text-sm font-semibold truncate group-hover:text-violet-300 transition-colors">
                  {m.nome}
                </span>
                {m.uf && (
                  <span className="text-[10px] text-slate-600 dark:text-slate-500 flex-shrink-0">/ {m.uf}</span>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-violet-300 font-bold text-sm whitespace-nowrap">{formatBRLCompact(m.total)}</p>
                <p className="text-[10px] text-slate-600 dark:text-slate-500">
                  {m.qtd} {m.qtd === 1 ? 'transferência' : 'transferências'}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {pixPorMunicipio.length > MAX_INICIAL && (
        <button
          onClick={() => setExpandido((v) => !v)}
          className="mt-3 w-full text-center text-[11px] text-violet-300 hover:text-violet-200 font-semibold transition-colors py-1.5 rounded-lg hover:bg-violet-300/5"
        >
          {expandido
            ? `Mostrar apenas os ${MAX_INICIAL} maiores`
            : `Ver todos os ${pixPorMunicipio.length} municípios`}
        </button>
      )}
    </div>
  );
}

export function ComparativoAreasCard({
  ano, escopo, areasAtual, areasAnterior,
}: {
  ano: number;
  escopo: string;
  areasAtual: { area: EmendaArea; total: number }[];
  areasAnterior: Map<string, number>;
}) {
  // Cada card mostra UMA área literal (mesmo critério do donut acima).
  // O card "OUTRAS ÁREAS" soma tudo que não é Saúde/Educação/Segurança —
  // legendado como tal pra evitar confusão com a área literal "OUTROS".
  const principais: EmendaArea[] = ['SAUDE', 'EDUCACAO', 'SEGURANCA', 'OUTROS'];

  const principaisSomadas: { area: EmendaArea; label: string; atual: number; anterior: number }[] =
    principais.map((area) => {
      if (area === 'OUTROS') {
        // "Outras áreas" — agrega tudo que não é uma das 3 principais
        const principaisSet = new Set<EmendaArea>(['SAUDE', 'EDUCACAO', 'SEGURANCA']);
        const atual = areasAtual.reduce((s, a) => s + (principaisSet.has(a.area) ? 0 : a.total), 0);
        const anterior = Array.from(areasAnterior.entries()).reduce(
          (s, [k, v]) => s + (principaisSet.has(k as EmendaArea) ? 0 : v),
          0,
        );
        return { area, label: 'Outras áreas', atual, anterior };
      }
      const atual = areasAtual.find((a) => a.area === area)?.total ?? 0;
      const anterior = areasAnterior.get(area) ?? 0;
      return { area, label: AREA_LABELS[area], atual, anterior };
    });

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <p className="text-[10px] uppercase tracking-widest font-bold text-[color:var(--text-tertiary)]">
          Comparativo por Área
        </p>
        <p className="text-[10px] text-slate-600 dark:text-slate-500">
          {ano} vs. {ano - 1}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {principaisSomadas.map(({ area, label, atual, anterior }) => {
          const delta = anterior > 0 ? ((atual - anterior) / anterior) * 100 : atual > 0 ? 100 : 0;
          const isUp = delta >= 0;
          const color = AREA_COLORS[area];
          return (
            <div
              key={area}
              className="rounded-xl p-3.5"
              style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--tint-04)' }}
              title={area === 'OUTROS' ? 'Soma de Assistência Social, Transporte, Cultura, Esporte e outras áreas que não são Saúde, Educação ou Segurança' : undefined}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
                  <Landmark className="w-4 h-4" />
                </div>
                <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color }}>
                  {label}
                </span>
              </div>
              <p className="text-[color:var(--text-primary)] font-bold text-lg">{formatBRLCompact(atual)}</p>
              <div className="flex items-center gap-1.5 text-[11px] mt-1">
                <span className={isUp ? 'text-[color:var(--success)]' : 'text-rose-400'}>
                  {isUp ? <TrendingUp className="w-3 h-3 inline -mt-0.5" /> : <TrendingDown className="w-3 h-3 inline -mt-0.5" />}
                  {' '}
                  {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                </span>
                <span className="text-slate-600 dark:text-slate-500">vs {ano - 1}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DestaqueDoAnoCard({
  municipio, ano, stateName, topParlamentar,
}: {
  municipio: { codigoIbge: string; nome: string; total: number };
  ano: number;
  stateName: string;
  topParlamentar?: { nome: string; cargo: string; partido: string | null; total: number };
}) {
  return (
    <div
      className="rounded-2xl px-5 py-2.5 flex items-center gap-5 flex-wrap"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      {/* Label */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Trophy className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--brand-cobalt-text)' }} />
        <p className="text-[10px] uppercase tracking-widest font-bold text-[color:var(--brand-cobalt-text)]/70 whitespace-nowrap">
          Destaque {ano} · {stateName}
        </p>
      </div>

      {/* Divider */}
      <div className="w-px h-6 flex-shrink-0" style={{ background: 'var(--tint-08)' }} />

      <div className="flex items-center gap-3 flex-wrap flex-1">
        {/* Top município */}
        <div
          className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(6,182,212,0.08), rgba(6,182,212,0.03))',
            border: '1px solid rgba(6,182,212,0.2)',
          }}
        >
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] uppercase tracking-widest font-semibold text-[color:var(--brand-cobalt)]/60">Município</span>
            <span className="text-[color:var(--text-primary)] font-bold text-[13px] truncate max-w-[120px] md:max-w-[180px] leading-tight">{municipio.nome}</span>
          </div>
          <div
            className="px-2 py-0.5 rounded-lg"
            style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.25)' }}
          >
            <span className="text-[color:var(--brand-cobalt-text)] font-bold text-[11px] whitespace-nowrap">{formatBRLCompact(municipio.total)}</span>
          </div>
        </div>

        {/* Top parlamentar */}
        {topParlamentar && (
          <div
            className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(37,99,235,0.03))',
              border: '1px solid rgba(37,99,235,0.2)',
            }}
          >
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] uppercase tracking-widest font-semibold text-[color:var(--brand-cobalt-text)]/60">Parlamentar</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[color:var(--text-primary)] font-bold text-[13px] truncate max-w-[120px] md:max-w-[200px] leading-tight" title={nomeExibicao(topParlamentar.nome)}>{nomeExibicao(topParlamentar.nome)}</span>
                <span className="text-[10px] text-slate-600 dark:text-slate-500 whitespace-nowrap hidden sm:block">
                  {cargoExibicao(topParlamentar.nome, topParlamentar.cargo)}
                  {topParlamentar.partido && !ehBancada(topParlamentar.nome) ? ` · ${topParlamentar.partido}` : ''}
                </span>
              </div>
            </div>
            <div
              className="px-2 py-0.5 rounded-lg"
              style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(37,99,235,0.25)' }}
            >
              <span className="text-[color:var(--brand-cobalt-text)] font-bold text-[11px] whitespace-nowrap">{formatBRLCompact(topParlamentar.total)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
