'use client';

/**
 * Modal de detalhes de uma emenda — favorecido(s), descrição rica e breakdown
 * por fase (Empenho/Liquidação/Pagamento).
 *
 * Lazy-load via GET /api/emendas-portal/emenda/[codigo]/documentos.
 * Se a emenda ainda não foi enriquecida (cron de enrich não chegou nela),
 * mostra mensagem orientando.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Building2, FileText, ExternalLink, Clock, MapPin } from 'lucide-react';
import { formatBRL } from '@/lib/portal-transparencia';

interface DocumentoApi {
  codigoDocumento: string;
  codigoDocumentoResumido: string | null;
  fase: string;
  data: string | null;
  valor: number;
  cnpjFavorecido: string | null;
  nomeFavorecido: string | null;
  ufFavorecido: string | null;
  municipioFavorecido: string | null;
  codigoIbgeFavorecido: string | null;
  subTitulo: string | null;
  observacao: string | null;
  programa: string | null;
  acao: string | null;
  orgao: string | null;
  orgaoSuperior: string | null;
}

interface FavorecidoBreakdown {
  cnpj: string | null;
  nome: string;
  uf: string | null;
  municipio: string | null;
  codigoIbge: string | null;
  total: number;
  qtdDocumentos: number;
}

interface FaseBreakdown {
  fase: string;
  total: number;
  qtd: number;
}

interface ApiResponse {
  emenda: { codigoEmenda: string; ano: number; numero: string | null; tipo: string | null; esfera: string; valorEmpenhado: number; valorPago: number } | null;
  documentos: DocumentoApi[];
  breakdown: { favorecidos: FavorecidoBreakdown[]; fases: FaseBreakdown[] };
  pendingEnrich: boolean;
  semExecucaoNoEstado?: boolean;
  notFound?: boolean;
  total?: number;
}

interface Props {
  codigoEmenda: string | null;
  tituloFallback?: string;
  filtroUf?: string;
  filtroFavorecido?: { cnpj: string | null; nome: string | null; municipio: string | null; uf: string | null };
  onClose: () => void;
}

const FASE_COLORS: Record<string, string> = {
  Empenho:    '#f59e0b',
  Liquidação: '#3b82f6',
  Liquidacao: '#3b82f6',
  Pagamento:  '#10b981',
};

function corFase(fase: string): string {
  return FASE_COLORS[fase] ?? '#94a3b8';
}

function formatDataBR(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

function formatCnpj(cnpj: string | null): string {
  if (!cnpj) return '—';
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function EmendaDocumentosModal({ codigoEmenda, tituloFallback, filtroUf, filtroFavorecido, onClose }: Props) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Quando há filtroFavorecido, restringe docs/favorecidos/fases ao favorecido clicado
  const docsFiltrados = useMemo(() => {
    if (!data || !filtroFavorecido) return data?.documentos ?? [];
    const { cnpj, nome } = filtroFavorecido;
    return data.documentos.filter((d) =>
      cnpj ? d.cnpjFavorecido === cnpj : d.nomeFavorecido === nome,
    );
  }, [data, filtroFavorecido]);

  const fasesFiltradas = useMemo(() => {
    if (!data) return [];
    if (!filtroFavorecido) return data.breakdown.fases;
    const map = new Map<string, { total: number; qtd: number }>();
    docsFiltrados.forEach((d) => {
      const cur = map.get(d.fase) ?? { total: 0, qtd: 0 };
      cur.total += d.valor;
      cur.qtd++;
      map.set(d.fase, cur);
    });
    return Array.from(map.entries()).map(([fase, { total, qtd }]) => ({ fase, total, qtd }));
  }, [data, filtroFavorecido, docsFiltrados]);

  const favorecidosFiltrados = useMemo(() => {
    if (!data || !filtroFavorecido) return data?.breakdown.favorecidos ?? [];
    const { cnpj, nome } = filtroFavorecido;
    return data.breakdown.favorecidos.filter((f) =>
      cnpj ? f.cnpj === cnpj : f.nome === nome,
    );
  }, [data, filtroFavorecido]);

  useEffect(() => {
    if (!codigoEmenda) return;
    let aborted = false;
    setLoading(true);
    setErro(null);
    setData(null);

    const ufQuery = filtroUf ? `?uf=${encodeURIComponent(filtroUf)}` : '';
    fetch(`/api/emendas-portal/emenda/${encodeURIComponent(codigoEmenda)}/documentos${ufQuery}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as ApiResponse;
      })
      .then((j) => {
        if (!aborted) setData(j);
      })
      .catch((e) => {
        if (!aborted) setErro(e.message ?? String(e));
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });

    return () => {
      aborted = true;
    };
  }, [codigoEmenda, filtroUf]);

  return (
    <AnimatePresence>
      {codigoEmenda && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 pb-8 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        >
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-4xl rounded-2xl p-6 shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, rgba(7,29,54,0.98) 0%, rgba(15,40,75,0.98) 100%)',
              border: '1px solid rgba(74,158,222,0.2)',
            }}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-amber-300" />
                  <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
                    Detalhes da Emenda
                  </p>
                </div>
                <h2 className="text-lg font-bold text-white">
                  {data?.emenda?.numero ? `Emenda nº ${data.emenda.numero}` : (tituloFallback ?? `Código ${codigoEmenda}`)}
                  {data?.emenda?.ano && <span className="text-slate-400 font-normal text-sm ml-2">({data.emenda.ano})</span>}
                </h2>
                {data?.emenda?.tipo && (
                  <p className="text-xs text-slate-400 mt-0.5">{data.emenda.tipo}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="Fechar"
              >
                <X className="h-4 w-4 text-slate-300" />
              </button>
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-amber-300" />
              </div>
            )}

            {/* Erro */}
            {erro && (
              <div className="rounded-lg p-4 text-sm text-red-300 bg-red-950/40 border border-red-500/30">
                Erro ao carregar detalhes: {erro}
              </div>
            )}

            {/* Pendente enrich */}
            {data && data.pendingEnrich && !data.notFound && (
              <div className="rounded-lg p-6 text-sm text-slate-400 bg-slate-900/40 border border-white/5 text-center">
                {data.emenda?.esfera === 'ESTADUAL'
                  ? 'Os dados detalhados desta emenda não são disponibilizados no portal estadual.'
                  : 'Os dados detalhados desta emenda ainda não estão disponíveis.'}
              </div>
            )}

            {/* Sem execução no estado filtrado */}
            {data && data.semExecucaoNoEstado && !data.notFound && (
              <div className="rounded-lg p-6 text-sm text-slate-400 bg-slate-900/40 border border-white/5 text-center">
                Esta emenda não possui execução registrada neste estado.
              </div>
            )}

            {/* Not found */}
            {data && data.notFound && (
              <div className="rounded-lg p-6 text-sm text-slate-400 bg-slate-900/40 border border-white/5">
                Emenda não encontrada no banco. Pode estar em fonte ao vivo ainda não persistida.
              </div>
            )}

            {/* Conteúdo */}
            {data && !data.pendingEnrich && !data.notFound && !data.semExecucaoNoEstado && (
              <div className="space-y-5">
                {/* Breakdown por fase */}
                {fasesFiltradas.length > 0 && (
                  <section>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-2">
                      Execução por fase
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {fasesFiltradas.map((f) => (
                        <div
                          key={f.fase}
                          className="rounded-lg p-3"
                          style={{
                            background: `${corFase(f.fase)}11`,
                            border: `1px solid ${corFase(f.fase)}33`,
                          }}
                        >
                          <p className="text-[10px] uppercase font-semibold" style={{ color: corFase(f.fase) }}>
                            {f.fase}
                          </p>
                          <p className="text-base font-bold text-white mt-0.5">{formatBRL(f.total)}</p>
                          <p className="text-[10px] text-slate-400">{f.qtd} doc{f.qtd === 1 ? '' : 's'}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Favorecidos */}
                {favorecidosFiltrados.length > 0 && (
                  <section>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-2">
                      {filtroFavorecido ? 'Favorecido' : `Favorecidos (${favorecidosFiltrados.length})`}
                    </p>
                    <div className="space-y-2">
                      {favorecidosFiltrados.slice(0, 10).map((f) => (
                        <div
                          key={f.cnpj ?? f.nome}
                          className="rounded-lg p-3 flex items-start justify-between gap-3"
                          style={{ background: 'rgba(7,29,54,0.6)', border: '1px solid rgba(255,255,255,0.05)' }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <Building2 className="h-3 w-3 text-cyan-300 flex-shrink-0" />
                              <p className="text-xs font-semibold text-white truncate">{f.nome}</p>
                            </div>
                            <p className="text-[10px] text-slate-400 font-mono">{formatCnpj(f.cnpj)}</p>
                            {(f.municipio || f.uf) && (
                              <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                                <MapPin className="h-2.5 w-2.5" />
                                {[f.municipio, f.uf].filter(Boolean).join(' / ')}
                              </p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-emerald-300 whitespace-nowrap">{formatBRL(f.total)}</p>
                            <p className="text-[10px] text-slate-500">{f.qtdDocumentos} doc{f.qtdDocumentos === 1 ? '' : 's'}</p>
                          </div>
                        </div>
                      ))}
                      {favorecidosFiltrados.length > 10 && (
                        <p className="text-[10px] text-slate-500 text-center">
                          + {favorecidosFiltrados.length - 10} outros favorecidos
                        </p>
                      )}
                    </div>
                  </section>
                )}

                {/* Lista de documentos com observação */}
                <section>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-2">
                    Documentos ({docsFiltrados.length})
                  </p>
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {docsFiltrados.map((d) => (
                      <div
                        key={d.codigoDocumento}
                        className="rounded-lg p-2.5"
                        style={{ background: 'rgba(7,29,54,0.4)', border: '1px solid rgba(255,255,255,0.04)' }}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase whitespace-nowrap"
                              style={{
                                background: `${corFase(d.fase)}22`,
                                color: corFase(d.fase),
                              }}
                            >
                              {d.fase}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono truncate">
                              {d.codigoDocumentoResumido ?? d.codigoDocumento}
                            </span>
                            <span className="text-[10px] text-slate-500 whitespace-nowrap">
                              {formatDataBR(d.data)}
                            </span>
                          </div>
                          <span className="text-xs font-semibold text-white whitespace-nowrap">
                            {formatBRL(d.valor)}
                          </span>
                        </div>
                        {d.observacao && (
                          <p className="text-[10px] text-slate-300 mt-1 leading-relaxed line-clamp-3">
                            {d.observacao}
                          </p>
                        )}
                        {d.orgao && (
                          <p className="text-[10px] text-slate-500 mt-1">
                            Órgão: {d.orgao}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                {/* Link Portal */}
                {data.emenda && (
                  <div className="pt-2 border-t border-white/5">
                    <a
                      href={`https://portaldatransparencia.gov.br/emendas/consulta?de=${data.emenda.codigoEmenda}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[11px] text-amber-300 hover:text-amber-200"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Ver no Portal da Transparência
                    </a>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
