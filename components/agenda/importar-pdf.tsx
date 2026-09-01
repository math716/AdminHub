'use client';

// Importação da agenda a partir de um PDF (grade semanal).
//
// O fluxo tem DOIS passos de propósito: primeiro o documento é lido e os
// compromissos aparecem numa lista editável; só depois de a pessoa conferir é
// que algo entra na agenda. Leitura automática erra, e compromisso errado no
// calendário do parlamentar é pior do que compromisso nenhum.

import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload, X, Loader2, FileText, AlertTriangle, Check, Trash2, Info, MapPin,
} from 'lucide-react';

const TIPOS = ['REUNIAO', 'VISITA', 'EVENTO', 'COMPROMISSO'] as const;
const TIPO_LABELS: Record<string, string> = {
  REUNIAO: 'Reunião', VISITA: 'Visita', EVENTO: 'Evento', COMPROMISSO: 'Compromisso',
};

interface EventoLido {
  titulo: string;
  descricao: string | null;
  data: string;
  diaSemana: string | null;
  horaInicio: string;
  horaFim: string | null;
  local: string | null;
  endereco: string | null;
  tipo: string;
  lat?: number | null;
  lng?: number | null;
  /** Lugar que o mapa encontrou — é o que a pessoa confere, lendo. */
  localizadoEm?: string | null;
  /** Caiu longe dos outros compromissos: provável cidade homônima. */
  longe?: boolean;
  jaExiste?: boolean;
}

interface Linha extends EventoLido {
  incluir: boolean;
}

type Fase = 'inicial' | 'lendo' | 'conferencia' | 'gravando';

const DIA_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "2026-08-25" -> "terça, 25/08" (sem depender do fuso do navegador). */
function rotuloData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, a, mes, d] = m;
  const dow = new Date(Date.UTC(Number(a), Number(mes) - 1, Number(d))).getUTCDay();
  return `${DIA_SEMANA[dow]}, ${d}/${mes}`;
}

/**
 * Regiões administrativas do DF.
 *
 * Endereço de Brasília não tem rua: tem "SHIS QI 25 Conjunto 3", "SQN 210
 * Bloco B". O serviço de mapas só encontra esses formatos quando a cidade vem
 * junto — "QI 25, Lago Sul" falha, "QI 25, Lago Sul, Brasília, DF" acerta.
 */
const REGIOES_DF = [
  'plano piloto', 'asa norte', 'asa sul', 'gama', 'taguatinga', 'brazlandia',
  'sobradinho', 'planaltina', 'paranoa', 'nucleo bandeirante', 'ceilandia',
  'guara', 'cruzeiro', 'samambaia', 'santa maria', 'sao sebastiao',
  'recanto das emas', 'lago sul', 'lago norte', 'riacho fundo',
  'candangolandia', 'aguas claras', 'sudoeste', 'octogonal', 'varjao',
  'park way', 'scia', 'estrutural', 'jardim botanico', 'itapoa', 'sia',
  'vicente pires', 'fercal', 'sol nascente', 'arniqueira', 'agua quente',
];

const semAcento = (t: string) =>
  t.normalize('NFD').replace(new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g'), '').toLowerCase();

/** O texto parece do Distrito Federal? */
function pareceDF(texto: string): boolean {
  const alvo = semAcento(texto);
  return REGIOES_DF.some(r => alvo.includes(r))
    || /(sh[ic]n?s?|sqn|sqs|cln|cls|qi|qe|ql|qnl|scia|srpn|ae)/.test(alvo);
}

/**
 * A cidade vem do LOTE, não de cada endereço.
 *
 * Uma agenda é de uma cidade só. Quando vários compromissos são claramente de
 * Brasília, os demais também são — e sem a cidade escrita o serviço de mapas
 * escolhe outro estado: "MANÉ GARRINCHA" resolvia para Boa Vista/RR e
 * "COMITÊ" para Teófilo Otoni/MG. Com ", Brasília, DF" no fim, o primeiro
 * acha a Arena BRB Mané Garrincha e o segundo não acha nada — os dois certos.
 */
function cidadeDoLote(linhas: Linha[]): string | null {
  const doDF = linhas.filter(l => pareceDF([l.endereco, l.local].filter(Boolean).join(' '))).length;
  return doDF >= 2 ? 'Brasília, DF' : null;
}

/** Endereço + região do compromisso. A cidade vai à parte, na chamada. */
function consultaDeBusca(endereco: string | null, local: string | null): string {
  return ([endereco, local].filter(Boolean) as string[]).join(', ');
}

/** Distância em km entre dois pontos (fórmula de Haversine). */
function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function ImportarPdf({ onImportou }: { onImportou: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [fase, setFase] = useState<Fase>('inicial');
  const [erro, setErro] = useState('');
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [resultado, setResultado] = useState<{ importados: number } | null>(null);
  // Progresso da localização dos endereços, feita AQUI e não no servidor: a
  // função tem teto de 60 s e o Nominatim aceita uma consulta por segundo —
  // vinte compromissos estouravam o limite. No navegador não há esse teto, e
  // a pessoa acompanha o avanço.
  const [geo, setGeo] = useState<{ feitos: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fechar = useCallback(() => {
    setAberto(false);
    setFase('inicial');
    setErro('');
    setLinhas([]);
    setResultado(null);
    setNomeArquivo('');
  }, []);

  /**
   * Localiza os endereços um por vez, respeitando o limite do Nominatim, e vai
   * preenchendo a lista conforme encontra. Falha em um endereço não interrompe
   * os demais — o compromisso entra sem pino, o que já é o comportamento.
   */
  const localizarEnderecos = useCallback(async (lista: Linha[]) => {
    // A cidade sai do conjunto: um compromisso isolado sem referência ganha o
    // contexto dos outros da mesma agenda.
    const cidade = cidadeDoLote(lista);
    const alvos = lista
      .map((l, i) => ({ i, texto: consultaDeBusca(l.endereco, l.local) }))
      .filter(a => a.texto.trim().length > 2);
    if (alvos.length === 0) return;

    setGeo({ feitos: 0, total: alvos.length });
    const achados: Array<{ i: number; lat: number; lng: number }> = [];

    for (let n = 0; n < alvos.length; n++) {
      const { i, texto } = alvos[n];
      try {
        // SEM o corte por distância da região do gabinete. Ele descartava
        // endereços legítimos: um gabinete com demandas em São Paulo importando
        // a agenda de Brasília via TUDO ser rejeitado, porque são 867 km entre
        // as duas regiões. A coerência que vale aqui é a do próprio lote, e ela
        // é conferida no fim.
        const res = await fetch(
          `/api/geocode?lote=1&address=${encodeURIComponent(texto)}`
          + (cidade ? `&cidade=${encodeURIComponent(cidade)}` : ''));
        const json = await res.json();
        const r = json?.results?.[0];
        if (r) {
          achados.push({ i, lat: r.lat, lng: r.lng });
          // Guarda o nome do lugar: pedir para "conferir o alfinete" não faz
          // sentido numa tela que não tem mapa. Lendo "Lago Sul, Brasília" a
          // pessoa sabe na hora se está certo.
          const onde = (r.endereco || r.displayName || '').split(',').slice(0, 3).join(',').trim();
          setLinhas(ls => ls.map((l, k) => (k === i ? { ...l, lat: r.lat, lng: r.lng, localizadoEm: onde } : l)));
        }
      } catch { /* segue para o próximo */ }
      setGeo({ feitos: n + 1, total: alvos.length });
      // O Nominatim admite uma consulta por segundo.
      if (n < alvos.length - 1) await new Promise(r => setTimeout(r, 1100));
    }

    // Uma agenda é de UMA região. Quem cai longe dos demais é quase sempre um
    // homônimo de outra cidade — "Guará" existe no DF e no interior de SP.
    // Não apagamos a coordenada: apenas avisamos, porque pode ser uma viagem
    // de verdade, e quem sabe é quem está conferindo.
    if (achados.length >= 3) {
      const meio = (ns: number[]) => {
        const o = [...ns].sort((a, b) => a - b);
        const m = Math.floor(o.length / 2);
        return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
      };
      const centro = { lat: meio(achados.map(a => a.lat)), lng: meio(achados.map(a => a.lng)) };
      // Marca a LINHA que destoa, em vez de um aviso geral pedindo para
      // "conferir os alfinetes" — não existe mapa nesta tela, e a pessoa não
      // teria como saber de qual compromisso se trata.
      const distantes = new Set(
        achados.filter(a => distanciaKm(centro, a) > 150).map(a => a.i));
      if (distantes.size > 0) {
        setLinhas(ls => ls.map((l, k) => (distantes.has(k) ? { ...l, longe: true } : l)));
      }
    }

    setGeo(null);
  }, []);

  const enviar = useCallback(async (arquivo: File) => {
    setErro('');
    setResultado(null);
    setFase('lendo');
    setNomeArquivo(arquivo.name);
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      const res = await fetch('/api/agenda/importar-pdf', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        setErro(json?.error ?? 'Não foi possível ler o documento.');
        setFase('inicial');
        return;
      }
      // Já existente vem desmarcado: quem quiser duplicar, marca de propósito.
      const lista = (json.eventos as EventoLido[]).map(e => ({ ...e, incluir: !e.jaExiste }));
      setLinhas(lista);
      setFase('conferencia');
      // A conferência já aparece; os endereços vão sendo localizados em segundo
      // plano, e os alfinetes surgem um a um.
      localizarEnderecos(lista);
    } catch {
      setErro('Falha de conexão ao enviar o arquivo.');
      setFase('inicial');
    }
  }, [localizarEnderecos]);

  const confirmar = useCallback(async () => {
    const escolhidos = linhas.filter(l => l.incluir);
    if (escolhidos.length === 0) { setErro('Marque ao menos um compromisso.'); return; }
    setErro('');
    setFase('gravando');
    try {
      const res = await fetch('/api/agenda/importar-pdf/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventos: escolhidos }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json?.error ?? 'Não foi possível gravar.');
        setFase('conferencia');
        return;
      }
      setResultado({ importados: json.importados ?? 0 });
      onImportou();
      setFase('conferencia');
    } catch {
      setErro('Falha de conexão ao gravar.');
      setFase('conferencia');
    }
  }, [linhas, onImportou]);

  const editar = (i: number, campo: keyof Linha, valor: any) =>
    setLinhas(ls => ls.map((l, n) => (n === i ? { ...l, [campo]: valor } : l)));

  const marcados = linhas.filter(l => l.incluir).length;
  const duplicados = linhas.filter(l => l.jaExiste).length;
  const semLocal = linhas.filter(l => l.lat == null).length;

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          color: 'var(--text-primary)',
        }}
      >
        <Upload className="w-4 h-4" />
        Importar PDF
      </button>

      {aberto && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(2, 6, 23, 0.55)', backdropFilter: 'blur(3px)' }}
          onClick={e => { if (e.target === e.currentTarget && fase !== 'lendo' && fase !== 'gravando') fechar(); }}
        >
          <div
            className="w-full max-w-4xl rounded-2xl overflow-hidden flex flex-col"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', maxHeight: '88vh' }}
          >
            {/* ── Cabeçalho ── */}
            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid var(--border-default)' }}>
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5" style={{ color: '#2563EB' }} />
                <div>
                  <h2 className="font-bold text-[15px]" style={{ color: 'var(--text-primary)' }}>
                    Importar agenda em PDF
                  </h2>
                  {nomeArquivo && (
                    <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>{nomeArquivo}</p>
                  )}
                </div>
              </div>
              <button onClick={fechar} disabled={fase === 'lendo' || fase === 'gravando'}
                className="p-1.5 rounded-lg transition-colors hover:opacity-70 disabled:opacity-30">
                <X className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4">
              {erro && (
                <div className="flex items-start gap-2 rounded-xl px-3.5 py-3 mb-4"
                  style={{ background: 'color-mix(in srgb, var(--danger) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 35%, transparent)' }}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
                  <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>{erro}</p>
                </div>
              )}

              {/* ── Passo 1: escolher o arquivo ── */}
              {(fase === 'inicial' || fase === 'lendo') && (
                <div className="text-center py-6">
                  <input
                    ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) enviar(f); e.target.value = ''; }}
                  />

                  {fase === 'lendo' ? (
                    <div className="py-8">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" style={{ color: '#2563EB' }} />
                      <p className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>
                        Lendo a agenda…
                      </p>
                      <p className="text-[12.5px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        Costuma levar alguns segundos.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div
                        onClick={() => inputRef.current?.click()}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => {
                          e.preventDefault();
                          const f = e.dataTransfer.files?.[0];
                          if (f) enviar(f);
                        }}
                        className="rounded-2xl px-6 py-10 cursor-pointer transition-all hover:opacity-80"
                        style={{ border: '2px dashed var(--border-default)' }}
                      >
                        <Upload className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-tertiary)' }} />
                        <p className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                          Escolha o PDF da agenda ou arraste aqui
                        </p>
                        <p className="text-[12.5px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                          Arquivo com os dados da agenda · até 4 MB
                        </p>
                      </div>

                      <div className="flex items-start gap-2 text-left rounded-xl px-3.5 py-3 mt-4"
                        style={{ background: 'var(--bg-page)', border: '1px solid var(--border-default)' }}>
                        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--text-tertiary)' }} />
                        <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                          O documento é processado para leitura automática dos compromissos.
                          Nada entra na agenda antes de você conferir a lista.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Passo 2: conferência ── */}
              {(fase === 'conferencia' || fase === 'gravando') && (
                <>
                  {resultado ? (
                    <div className="text-center py-10">
                      <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
                        style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)' }}>
                        <Check className="w-6 h-6" style={{ color: 'var(--success)' }} />
                      </div>
                      <p className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {resultado.importados} compromisso{resultado.importados !== 1 ? 's' : ''} na agenda
                      </p>
                      <p className="text-[13px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        Já aparecem no calendário.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{linhas.length}</strong> encontrado{linhas.length !== 1 ? 's' : ''} ·{' '}
                          <strong style={{ color: 'var(--text-primary)' }}>{marcados}</strong> marcado{marcados !== 1 ? 's' : ''}
                        </p>
                        {duplicados > 0 && (
                          <span className="text-[12px] px-2 py-0.5 rounded-md"
                            style={{ background: 'color-mix(in srgb, var(--warning) 15%, transparent)', color: 'var(--warning)' }}>
                            {duplicados} já {duplicados !== 1 ? 'estão' : 'está'} na agenda
                          </span>
                        )}
                        {geo ? (
                          <span className="text-[12px] px-2 py-0.5 rounded-md flex items-center gap-1.5"
                            style={{ background: 'var(--bg-page)', color: 'var(--text-tertiary)' }}>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            localizando endereços {geo.feitos}/{geo.total}
                          </span>
                        ) : semLocal > 0 && (
                          <span className="text-[12px] px-2 py-0.5 rounded-md"
                            style={{ background: 'var(--bg-page)', color: 'var(--text-tertiary)' }}>
                            {semLocal} sem local no mapa
                          </span>
                        )}
                      </div>


                      <div className="space-y-2">
                        {linhas.map((l, i) => (
                          <div key={i} className="rounded-xl p-3"
                            style={{
                              background: l.incluir ? 'var(--bg-page)' : 'transparent',
                              border: '1px solid var(--border-default)',
                              opacity: l.incluir ? 1 : 0.55,
                            }}>
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox" checked={l.incluir}
                                onChange={e => editar(i, 'incluir', e.target.checked)}
                                className="mt-1 w-4 h-4 flex-shrink-0 cursor-pointer"
                                style={{ accentColor: '#2563EB' }}
                              />

                              <div className="flex-1 min-w-0 space-y-2">
                                <input
                                  value={l.titulo}
                                  onChange={e => editar(i, 'titulo', e.target.value)}
                                  className="w-full text-[13.5px] font-semibold bg-transparent rounded px-1.5 py-1 outline-none"
                                  style={{ color: 'var(--text-primary)', border: '1px solid transparent' }}
                                  onFocus={e => (e.currentTarget.style.border = '1px solid var(--border-default)')}
                                  onBlur={e => (e.currentTarget.style.border = '1px solid transparent')}
                                />

                                <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                                  <CampoData valor={l.data} onChange={v => editar(i, 'data', v)} />
                                  <CampoHora valor={l.horaInicio} onChange={v => editar(i, 'horaInicio', v)} />
                                  <span style={{ color: 'var(--text-tertiary)' }}>às</span>
                                  <CampoHora valor={l.horaFim ?? ''} onChange={v => editar(i, 'horaFim', v || null)} />
                                  <select
                                    value={l.tipo}
                                    onChange={e => editar(i, 'tipo', e.target.value)}
                                    className="rounded-md px-2 py-1 text-[12.5px] outline-none cursor-pointer"
                                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
                                  >
                                    {TIPOS.map(t => <option key={t} value={t}>{TIPO_LABELS[t]}</option>)}
                                  </select>
                                  {l.jaExiste && (
                                    <span className="px-1.5 py-0.5 rounded text-[11.5px]"
                                      style={{ background: 'color-mix(in srgb, var(--warning) 15%, transparent)', color: 'var(--warning)' }}>
                                      já na agenda
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <CampoTexto placeholder="Local" valor={l.local ?? ''} onChange={v => editar(i, 'local', v || null)} />
                                  <CampoTexto placeholder="Endereço" valor={l.endereco ?? ''} onChange={v => editar(i, 'endereco', v || null)} largo />
                                </div>

                                {/* O lugar encontrado, por extenso: é assim que
                                    se confere sem precisar de um mapa. */}
                                {l.localizadoEm && (
                                  <p className="text-[12px] px-1.5 flex items-start gap-1"
                                    style={{ color: l.longe ? 'var(--warning)' : 'var(--success)' }}>
                                    <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                    <span>
                                      {l.localizadoEm}
                                      {l.longe && ' — bem longe dos outros compromissos do dia'}
                                    </span>
                                  </p>
                                )}
                                {l.descricao && (
                                  <p className="text-[12px] px-1.5" style={{ color: 'var(--text-tertiary)' }}>{l.descricao}</p>
                                )}
                              </div>

                              <button
                                onClick={() => setLinhas(ls => ls.filter((_, n) => n !== i))}
                                className="p-1.5 rounded-lg transition-colors hover:opacity-70 flex-shrink-0"
                                title="Descartar"
                              >
                                <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* ── Rodapé ── */}
            {fase === 'conferencia' && !resultado && (
              <div className="flex items-center justify-end gap-2 px-5 py-3.5"
                style={{ borderTop: '1px solid var(--border-default)' }}>
                <button onClick={fechar}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80"
                  style={{ background: 'var(--bg-page)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
                  Cancelar
                </button>
                <button onClick={confirmar} disabled={marcados === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#FFFFFF' }}>
                  <Check className="w-4 h-4" />
                  Adicionar {marcados} à agenda
                </button>
              </div>
            )}
            {(fase === 'gravando' || (fase === 'conferencia' && resultado)) && (
              <div className="flex items-center justify-end gap-2 px-5 py-3.5"
                style={{ borderTop: '1px solid var(--border-default)' }}>
                {fase === 'gravando' ? (
                  <span className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
                    <Loader2 className="w-4 h-4 animate-spin" /> Gravando…
                  </span>
                ) : (
                  <button onClick={fechar}
                    className="px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#FFFFFF' }}>
                    Concluir
                  </button>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ─── Campos da linha ──────────────────────────────────────────────────────────

function CampoData({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <label className="relative inline-flex items-center rounded-md px-2 py-1 cursor-pointer"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{rotuloData(valor)}</span>
      <input type="date" value={valor} onChange={e => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer" />
    </label>
  );
}

function CampoHora({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time" value={valor} onChange={e => onChange(e.target.value)}
      className="rounded-md px-2 py-1 text-[12.5px] outline-none"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
    />
  );
}

function CampoTexto({ placeholder, valor, onChange, largo }: {
  placeholder: string; valor: string; onChange: (v: string) => void; largo?: boolean;
}) {
  return (
    <input
      value={valor} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className={`rounded-md px-2 py-1 text-[12.5px] outline-none ${largo ? 'flex-1 min-w-[200px]' : 'w-[140px]'}`}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
    />
  );
}
