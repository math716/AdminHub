'use client';

// Dashboard — a central do gabinete. É a primeira tela de todo mundo, então
// mostra um pouco de cada área que a pessoa usa (cada bloco só aparece para
// quem tem acesso àquela área): agenda de hoje, demandas, emendas do ano,
// atalhos e uma pergunta direta para a Gabi.

import { useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FileText, CheckCircle, Clock, TrendingUp, BarChart3, AlertTriangle, CalendarDays, BookUser, MapPin, Map as MapaIcone,
  Target, Landmark, Sparkles, ArrowRight, ArrowUpRight, Inbox, Send, Users, Mic, Briefcase,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { STATUS_COLORS, PRIORITY_COLORS, PRIORITY_LABELS, STATUS_LABELS } from '@/lib/types';
import { PERMISSIONS, hasPermission, type Permission } from '@/lib/permissions';
import { DemandPriority, DemandStatus } from '@/lib/prisma-gerado/enums';
import { Painel, Rosca, BarraSimples, comAlfa, pctBR } from '@/components/mapa/comparacao-visual';
import { Indicador } from '@/components/mapa-campanha/projecao-visual';
import { Esqueleto, EstadoVazioPadrao } from '@/components/ui/esqueleto';
import { ehDataComemorativaGoogle, getFeriados } from '@/lib/agenda-datas';

const DemandsTimelineChart = dynamic(() => import('@/components/charts/demands-timeline'), { ssr: false });
const DemandsByCategoryChart = dynamic(() => import('@/components/charts/demands-by-category'), { ssr: false });

interface DashboardStats {
  total: number;
  pendentes: number;
  emAndamento: number;
  resolvidas: number;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  recentDemands: any[];
  timeline: { date: string; count: number; resolved: number }[];
  lastResolvedDate: string | null;
}

interface EventoAgenda {
  id: string;
  titulo: string;
  data: string;
  dataFim?: string | null;
  local?: string | null;
  tipo: 'REUNIAO' | 'VISITA' | 'EVENTO' | 'COMPROMISSO';
  cor?: string | null;
  googleEventId?: string | null;
}

const TIPO_EVENTO: Record<EventoAgenda['tipo'], { rotulo: string; cor: string; icone: LucideIcon }> = {
  REUNIAO: { rotulo: 'Reunião', cor: '#2563EB', icone: Users },
  VISITA: { rotulo: 'Visita', cor: '#16A34A', icone: MapPin },
  EVENTO: { rotulo: 'Evento', cor: '#6366F1', icone: Mic },
  COMPROMISSO: { rotulo: 'Compromisso', cor: '#EA580C', icone: Briefcase },
};

const ATALHOS: Array<{ href: string; rotulo: string; texto: string; icone: LucideIcon; cor: string; permissao: Permission }> = [
  { href: '/dashboard/demandas', rotulo: 'Demandas', texto: 'Pedidos da população', icone: FileText, cor: '#2563eb', permissao: PERMISSIONS.DEMANDAS },
  { href: '/dashboard/agenda', rotulo: 'Agenda', texto: 'Compromissos do gabinete', icone: CalendarDays, cor: '#16a34a', permissao: PERMISSIONS.AGENDA },
  { href: '/dashboard/contatos', rotulo: 'Contatos', texto: 'Lideranças e apoiadores', icone: BookUser, cor: '#0891b2', permissao: PERMISSIONS.CONTATOS },
  { href: '/dashboard/mapa-demandas', rotulo: 'Mapa do Gabinete', texto: 'Demandas e rotas no mapa', icone: MapPin, cor: '#7c3aed', permissao: PERMISSIONS.MAPA_GABINETE },
  { href: '/dashboard/mapa', rotulo: 'Mapa Eleitoral', texto: 'Votos por cidade e bairro', icone: MapaIcone, cor: '#db2777', permissao: PERMISSIONS.MAPA_ELEITORAL },
  { href: '/dashboard/mapa-campanha', rotulo: 'Projeto de Campanha', texto: 'Metas para a próxima eleição', icone: Target, cor: '#d97706', permissao: PERMISSIONS.PROJETO_CAMPANHA },
  { href: '/dashboard/emendas', rotulo: 'Emendas', texto: 'Para onde vai o dinheiro', icone: Landmark, cor: '#059669', permissao: PERMISSIONS.EMENDAS_MAPA },
];

const SIGLA_NOME: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');
const reais = (v: number) => v >= 1e9 ? `R$ ${(v / 1e9).toFixed(1).replace('.', ',')} bi` : v >= 1e6 ? `R$ ${(v / 1e6).toFixed(1).replace('.', ',')} mi` : `R$ ${fmt(v)}`;

function saudacao(hora: number) {
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Abre a Gabi já com a pergunta enviada (components/gabi/gabi-fab.tsx escuta o evento). */
function perguntarAGabi(pergunta: string) {
  window.dispatchEvent(new CustomEvent('gabi:perguntar', { detail: { pergunta } }));
}

export default function DashboardPage() {
  const { data: session, status: sessionStatus } = useSession() || {};
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === 'dark';
  const usuario = session?.user as any;
  const userRole = usuario?.role || 'ASSESSOR';
  const gabineteId = usuario?.gabineteId as string | undefined;
  const gabineteNome = (usuario?.gabineteNome as string | undefined) ?? null;
  const primeiroNome = String(usuario?.name ?? '').trim().split(/\s+/)[0] || '';
  const pode = (p: Permission) => hasPermission({ role: userRole, permissions: usuario?.permissions ?? [] }, p);
  const temGabinete = !!gabineteId;

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventos, setEventos] = useState<EventoAgenda[] | null>(null);
  const [emendas, setEmendas] = useState<Record<string, number> | null>(null);
  const [pergunta, setPergunta] = useState('');
  const agora = useMemo(() => new Date(), []);
  const anoAtual = agora.getFullYear();

  useEffect(() => {
    // Aguarda sessão autenticada para garantir que gabineteId já está resolvido
    if (sessionStatus !== 'authenticated') return;
    const fetchStats = async () => {
      setLoading(true);
      setStats(null);
      try {
        const res = await fetch('/api/dashboard/stats', { cache: 'no-store' });
        if (res.ok) setStats(await res.json());
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [sessionStatus, gabineteId]);

  // Agenda: o mês atual e o próximo (para "próximos compromissos" na virada do mês).
  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !temGabinete || !pode(PERMISSIONS.AGENDA)) return;
    const prox = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
    Promise.all([
      fetch(`/api/agenda?mes=${agora.getMonth() + 1}&ano=${agora.getFullYear()}`).then(r => (r.ok ? r.json() : [])),
      fetch(`/api/agenda?mes=${prox.getMonth() + 1}&ano=${prox.getFullYear()}`).then(r => (r.ok ? r.json() : [])),
    ])
      .then(([a, b]) => {
        const todos = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])] as EventoAgenda[];
        setEventos([...new Map(todos.map(e => [e.id, e])).values()]);
      })
      .catch(() => setEventos([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, gabineteId]);

  // Emendas do ano: total por estado (resumo pronto, leve).
  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !pode(PERMISSIONS.EMENDAS_MAPA)) return;
    fetch(`/api/emendas-portal/brasil?ano=${anoAtual}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => setEmendas(d?.totaisPorUF ?? {}))
      .catch(() => setEmendas({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, anoAtual]);

  const verDemandas = pode(PERMISSIONS.DEMANDAS) && temGabinete;
  const atalhos = ATALHOS.filter(a => pode(a.permissao));

  // ── Demandas ───────────────────────────────────────────────────────────────
  const total = stats?.total ?? 0;
  const emAberto = (stats?.pendentes ?? 0) + (stats?.emAndamento ?? 0);
  const taxa = total ? (stats?.resolvidas ?? 0) / total : 0;
  const novas30 = (stats?.timeline ?? []).reduce((s, t) => s + t.count, 0);
  const resolvidas30 = (stats?.timeline ?? []).reduce((s, t) => s + t.resolved, 0);
  const fatiasStatus = [
    { chave: 'PENDENTE', valor: stats?.pendentes ?? 0, cor: STATUS_COLORS?.PENDENTE ?? '#FFC107' },
    { chave: 'EM_ANDAMENTO', valor: stats?.emAndamento ?? 0, cor: STATUS_COLORS?.EM_ANDAMENTO ?? '#2196F3' },
    { chave: 'RESOLVIDA', valor: stats?.resolvidas ?? 0, cor: STATUS_COLORS?.RESOLVIDA ?? '#4CAF50' },
  ];
  const prioridades = Object.entries(stats?.byPriority ?? {})
    .map(([k, v]) => ({ chave: k, rotulo: PRIORITY_LABELS?.[k as DemandPriority] ?? k, valor: v ?? 0, cor: PRIORITY_COLORS?.[k as DemandPriority] ?? '#9E9E9E' }))
    .sort((a, b) => b.valor - a.valor);
  const maiorPrioridade = Math.max(1, ...prioridades.map(p => p.valor));

  // ── Agenda ─────────────────────────────────────────────────────────────────
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  const fimHoje = inicioHoje + 86_400_000;
  // Feriados e datas comemorativas que o Google põe na agenda ("Dia do
  // Servidor Público") não são compromissos: viram etiqueta do dia, como na
  // tela da Agenda, junto com os feriados nacionais do próprio sistema.
  const ehHoje = (e: EventoAgenda) => { const t = new Date(e.data).getTime(); return t >= inicioHoje && t < fimHoje; };
  const compromissos = (eventos ?? []).filter(e => !ehDataComemorativaGoogle(e.googleEventId));
  const deHoje = compromissos.filter(ehHoje)
    .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  const proximos = compromissos.filter(e => new Date(e.data).getTime() >= fimHoje)
    .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime()).slice(0, 4);
  const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  const datasDeHoje: string[] = [];
  const feriadoOficial = getFeriados(agora.getFullYear())[`${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`];
  if (feriadoOficial) datasDeHoje.push(feriadoOficial);
  for (const e of eventos ?? []) {
    if (ehDataComemorativaGoogle(e.googleEventId) && ehHoje(e) && !datasDeHoje.some(n => semAcento(n) === semAcento(e.titulo))) datasDeHoje.push(e.titulo);
  }

  // ── Emendas ────────────────────────────────────────────────────────────────
  const emendasOrdenadas = Object.entries(emendas ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const totalEmendas = emendasOrdenadas.reduce((s, [, v]) => s + v, 0);

  const dataExtenso = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-5">
      {/* ── Abertura: saudação, data e pergunta para a Gabi ── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl p-5 sm:p-6"
        style={{ background: 'linear-gradient(135deg, #0a1a33 0%, #0f2547 55%, #17335c 100%)', border: '1px solid rgba(74,158,222,0.25)', boxShadow: 'var(--shadow-card)' }}
      >
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 w-72 h-72 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.22), transparent 65%)' }} />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 w-80 h-80 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.25), transparent 65%)' }} />
        <div className="relative flex flex-col lg:flex-row lg:items-end gap-5">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: 'rgba(147,197,253,0.9)' }}>
              {dataExtenso}
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mt-1">
              {saudacao(agora.getHours())}{primeiroNome ? `, ${primeiroNome}` : ''}
            </h1>
            <p className="text-sm mt-1" style={{ color: 'rgba(226,232,240,0.72)' }}>
              {gabineteNome ? `Resumo do ${gabineteNome}` : 'Resumo do seu gabinete'}
              {verDemandas && !loading && stats ? ` · ${fmt(emAberto)} ${emAberto === 1 ? 'demanda em aberto' : 'demandas em aberto'}` : ''}
              {deHoje.length > 0 ? ` · ${deHoje.length} ${deHoje.length === 1 ? 'compromisso hoje' : 'compromissos hoje'}` : ''}
            </p>
          </div>
        </div>

        {/* Pergunta direta para a Gabi */}
        <form
          className="relative mt-5 flex items-center gap-2 rounded-2xl p-1.5 pl-4"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', backdropFilter: 'blur(6px)' }}
          onSubmit={e => { e.preventDefault(); const q = pergunta.trim(); if (!q) return; perguntarAGabi(q); setPergunta(''); }}
        >
          <Sparkles className="h-4 w-4 flex-shrink-0" style={{ color: '#22d3ee' }} />
          <input
            value={pergunta}
            onChange={e => setPergunta(e.target.value)}
            placeholder="Pergunte à Gabi — emendas, votos, demandas…"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm py-2 text-white placeholder:text-slate-400"
          />
          <button type="submit"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50"
            disabled={!pergunta.trim()}
            style={{ background: 'linear-gradient(135deg, #2563eb, #38bdf8)', boxShadow: '0 4px 14px -4px rgba(56,189,248,0.6)' }}>
            <Send className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Perguntar</span>
          </button>
        </form>
      </motion.section>

      {/* ── Atalhos ── */}
      {atalhos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          {atalhos.map((a, i) => (
            <motion.div key={a.href} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i }}>
              <Link href={a.href}
                className="group relative flex flex-row items-center sm:flex-col sm:items-stretch gap-2.5 h-full rounded-2xl p-2.5 sm:p-3.5 transition-all hover:-translate-y-0.5 overflow-hidden"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-card)' }}>
                <span aria-hidden className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none"
                  style={{ boxShadow: `inset 0 0 0 1px ${comAlfa(a.cor, 0.5)}` }} />
                <span className="flex items-center justify-between flex-shrink-0">
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: comAlfa(a.cor, 0.12), color: a.cor, border: `1px solid ${comAlfa(a.cor, 0.22)}` }}>
                    <a.icone className="h-4 w-4" />
                  </span>
                  <ArrowUpRight className="hidden sm:block h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: a.cor }} />
                </span>
                <span>
                  <span className="block text-[13px] sm:text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>{a.rotulo}</span>
                  <span className="hidden sm:block text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{a.texto}</span>
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Números das demandas ── */}
      {verDemandas && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {loading ? (
            [0, 1, 2, 3].map(i => <Esqueleto key={i} className="h-[104px]" />)
          ) : (
            <>
              <Indicador icone={FileText} rotulo="Demandas" cor="#2563eb" valor={fmt(total)}
                detalhe={novas30 > 0 ? `${fmt(novas30)} novas nos últimos 30 dias` : 'nenhuma nova em 30 dias'} />
              <Indicador icone={Clock} rotulo="Em aberto" cor="#d97706" valor={fmt(emAberto)}
                detalhe={`${fmt(stats?.pendentes ?? 0)} pendentes · ${fmt(stats?.emAndamento ?? 0)} em andamento`} />
              <Indicador icone={CheckCircle} rotulo="Resolvidas" cor="#16a34a" valor={fmt(stats?.resolvidas ?? 0)}
                detalhe={stats?.lastResolvedDate ? `última em ${stats.lastResolvedDate}` : 'nenhuma ainda'} />
              <Indicador icone={TrendingUp} rotulo="Resolução" cor="#7c3aed" valor={pctBR(taxa, 0)}
                detalhe={resolvidas30 > 0 ? `${fmt(resolvidas30)} resolvidas em 30 dias` : 'sem resoluções em 30 dias'}>
                <BarraSimples fracao={taxa} cor="#7c3aed" altura={5} />
              </Indicador>
            </>
          )}
        </div>
      )}

      {/* ── Agenda de hoje + situação das demandas ── */}
      {(pode(PERMISSIONS.AGENDA) && temGabinete) || verDemandas ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {pode(PERMISSIONS.AGENDA) && temGabinete && (
            <Painel titulo="Agenda de hoje" icone={CalendarDays} className={verDemandas ? 'xl:col-span-5' : 'xl:col-span-12'}
              direita={<Link href="/dashboard/agenda" className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: 'var(--brand-cobalt-text)' }}>Abrir agenda <ArrowRight className="h-3.5 w-3.5" /></Link>}>
              {eventos === null ? (
                <div className="space-y-2.5">{[0, 1, 2].map(i => <Esqueleto key={i} className="h-14" />)}</div>
              ) : deHoje.length === 0 && proximos.length === 0 && datasDeHoje.length === 0 ? (
                <EstadoVazioPadrao icone={CalendarDays} titulo="Agenda livre" texto="Nenhum compromisso hoje nem nos próximos dias." />
              ) : (
                <div className="space-y-4">
                  {datasDeHoje.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {datasDeHoje.map(nome => (
                        <span key={nome} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                          style={{ background: 'var(--tint-06)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                          <CalendarDays className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                          Hoje: {nome}
                        </span>
                      ))}
                    </div>
                  )}
                  {deHoje.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Nenhum compromisso hoje.</p>
                  ) : (
                    <ol className="relative space-y-2.5 pl-4">
                      <span aria-hidden className="absolute left-[5px] top-2 bottom-2 w-px" style={{ background: 'var(--border-default)' }} />
                      {deHoje.map(e => <ItemAgenda key={e.id} e={e} agora={agora.getTime()} />)}
                    </ol>
                  )}
                  {proximos.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: 'var(--text-tertiary)' }}>Próximos</p>
                      <ul className="space-y-1.5">
                        {proximos.map(e => {
                          const t = TIPO_EVENTO[e.tipo] ?? TIPO_EVENTO.REUNIAO;
                          const d = new Date(e.data);
                          return (
                            <li key={e.id} className="flex items-center gap-2.5 text-xs">
                              <span className="w-12 flex-shrink-0 font-semibold tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                                {d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                              </span>
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: e.cor || t.cor }} />
                              <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text-primary)' }} title={e.titulo}>{e.titulo}</span>
                              <span className="tabular-nums flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                                {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Painel>
          )}

          {verDemandas && (
            <Painel titulo="Situação das demandas" icone={BarChart3} className={pode(PERMISSIONS.AGENDA) && temGabinete ? 'xl:col-span-7' : 'xl:col-span-12'}
              direita={<Link href="/dashboard/demandas" className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: 'var(--brand-cobalt-text)' }}>Abrir demandas <ArrowRight className="h-3.5 w-3.5" /></Link>}>
              {loading ? (
                <Esqueleto className="h-44" />
              ) : total === 0 ? (
                <EstadoVazioPadrao icone={Inbox} titulo="Nenhuma demanda ainda" texto="As demandas cadastradas aparecem aqui com status e prioridade." />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div className="flex items-center gap-5">
                    <Rosca fatias={fatiasStatus} centro={fmt(total)} rotuloCentro="demandas" tamanho={136} espessura={15} />
                    <ul className="flex-1 space-y-2.5">
                      {fatiasStatus.map(f => (
                        <li key={f.chave} className="flex items-center gap-2 text-xs">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: f.cor }} />
                          <span className="flex-1" style={{ color: 'var(--text-secondary)' }}>{STATUS_LABELS?.[f.chave as DemandStatus] ?? f.chave}</span>
                          <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmt(f.valor)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold mb-2.5 flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
                      <AlertTriangle className="h-3 w-3" /> Por prioridade
                    </p>
                    <ul className="space-y-2.5">
                      {prioridades.map(p => (
                        <li key={p.chave}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span style={{ color: 'var(--text-secondary)' }}>{p.rotulo}</span>
                            <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmt(p.valor)}</span>
                          </div>
                          <BarraSimples fracao={p.valor / maiorPrioridade} cor={p.cor} altura={6} />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </Painel>
          )}
        </div>
      ) : null}

      {/* ── Demandas recentes + emendas do ano ── */}
      {(verDemandas || pode(PERMISSIONS.EMENDAS_MAPA)) && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {verDemandas && (
            <Painel titulo="Demandas recentes" icone={FileText} className={pode(PERMISSIONS.EMENDAS_MAPA) ? 'xl:col-span-7' : 'xl:col-span-12'} corpo="p-0 pt-3">
              {loading ? (
                <div className="p-4 space-y-2">{[0, 1, 2, 3].map(i => <Esqueleto key={i} className="h-11" />)}</div>
              ) : !stats?.recentDemands?.length ? (
                <div className="p-4"><EstadoVazioPadrao icone={Inbox} titulo="Nenhuma demanda recente" texto="Quando o gabinete registrar demandas, as últimas aparecem aqui." /></div>
              ) : (
                <ul>
                  {stats.recentDemands.slice(0, 6).map((d: any, i: number) => {
                    const corStatus = STATUS_COLORS?.[d.status as DemandStatus] || '#6B7280';
                    const corPrioridade = PRIORITY_COLORS?.[d.priority as DemandPriority] || '#6B7280';
                    return (
                      <li key={d.id || i}>
                        <Link href="/dashboard/demandas" className="flex items-center gap-3 px-4 sm:px-5 py-3 transition-colors hover:bg-[var(--bg-hover)]"
                          style={{ borderTop: '1px solid var(--tint-06)' }}>
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: corStatus }} />
                          <span className="flex-1 min-w-0 text-sm truncate" style={{ color: 'var(--text-primary)' }} title={d.title}>{d.title}</span>
                          <span className="hidden sm:inline text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: comAlfa(corStatus.length === 7 ? corStatus : '#6B7280', 0.14), color: corStatus }}>
                            {STATUS_LABELS?.[d.status as DemandStatus] || d.status}
                          </span>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: comAlfa(corPrioridade.length === 7 ? corPrioridade : '#6B7280', 0.14), color: corPrioridade }}>
                            {PRIORITY_LABELS?.[d.priority as DemandPriority] || d.priority}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Painel>
          )}

          {pode(PERMISSIONS.EMENDAS_MAPA) && (
            <Painel titulo={`Emendas federais · ${anoAtual}`} icone={Landmark} className={verDemandas ? 'xl:col-span-5' : 'xl:col-span-12'}
              direita={<Link href="/dashboard/emendas" className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: 'var(--brand-cobalt-text)' }}>Abrir emendas <ArrowRight className="h-3.5 w-3.5" /></Link>}>
              {emendas === null ? (
                <div className="space-y-2.5">{[0, 1, 2, 3].map(i => <Esqueleto key={i} className="h-8" />)}</div>
              ) : totalEmendas === 0 ? (
                <EstadoVazioPadrao icone={Landmark} titulo="Sem emendas no ano" texto={`Ainda não há emendas de ${anoAtual} no sistema.`} />
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>Empenhado no Brasil</p>
                    <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{reais(totalEmendas)}</p>
                  </div>
                  <ul className="space-y-2.5">
                    {emendasOrdenadas.slice(0, 5).map(([uf, v], i) => (
                      <li key={uf}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span style={{ color: 'var(--text-secondary)' }}>
                            <span className="tabular-nums mr-1.5" style={{ color: 'var(--text-tertiary)' }}>{i + 1}.</span>{SIGLA_NOME[uf] ?? uf}
                          </span>
                          <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{reais(v)}</span>
                        </div>
                        <BarraSimples fracao={v / emendasOrdenadas[0][1]} cor="linear-gradient(90deg, rgba(5,150,105,0.5), #059669)" altura={6} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Painel>
          )}
        </div>
      )}

      {/* ── Categorias e evolução das demandas ── */}
      {verDemandas && !loading && total > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Painel titulo="Demandas por categoria" icone={BarChart3}>
            <div className="h-[260px]">
              <DemandsByCategoryChart data={stats?.byCategory} darkMode={isDarkTheme} />
            </div>
          </Painel>
          <Painel titulo="Evolução nos últimos 30 dias" icone={TrendingUp}>
            <div className="h-[260px]">
              <DemandsTimelineChart data={stats?.timeline} darkMode={isDarkTheme} />
            </div>
          </Painel>
        </div>
      )}
    </div>
  );
}

function ItemAgenda({ e, agora }: { e: EventoAgenda; agora: number }) {
  const t = TIPO_EVENTO[e.tipo] ?? TIPO_EVENTO.REUNIAO;
  const inicio = new Date(e.data).getTime();
  const fim = e.dataFim ? new Date(e.dataFim).getTime() : inicio + 3_600_000;
  const estado = agora > fim ? 'passou' : agora >= inicio ? 'agora' : 'depois';
  const cor = e.cor || t.cor;
  return (
    <li className={`relative flex items-start gap-3 rounded-xl px-3 py-2.5 ${estado === 'passou' ? 'opacity-55' : ''}`}
      style={{ background: estado === 'agora' ? comAlfa(cor, 0.1) : 'var(--bg-card-subtle)', border: `1px solid ${estado === 'agora' ? comAlfa(cor, 0.45) : 'var(--border-default)'}` }}>
      <span aria-hidden className="absolute -left-[15px] top-4 w-2.5 h-2.5 rounded-full" style={{ background: cor, boxShadow: '0 0 0 3px var(--bg-card)' }} />
      <span className="w-11 flex-shrink-0 text-xs font-bold tabular-nums pt-0.5" style={{ color: 'var(--text-primary)' }}>
        {new Date(e.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold break-words" style={{ color: 'var(--text-primary)' }}>{e.titulo}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          <span style={{ color: cor }}>{t.rotulo}</span>
          {e.local && <span className="inline-flex items-center gap-1 min-w-0"><MapPin className="h-3 w-3 flex-shrink-0" />{e.local}</span>}
        </span>
      </span>
      {estado === 'agora' && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: cor, color: '#fff' }}>AGORA</span>
      )}
    </li>
  );
}
