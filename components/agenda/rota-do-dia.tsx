'use client';

// Rota do dia sobre o Mapa do Gabinete.
//
// Pega os compromissos de um dia que já têm coordenada, liga-os na ordem dos
// horários e mostra distância e tempo de cada trecho. O que dá utilidade real
// ao painel não é a quilometragem — é o AVISO de deslocamento que não cabe no
// intervalo entre um compromisso e o seguinte. É a conta que a assessoria faz
// no olho hoje (aquele "DESLOC.: 30' a 50'" escrito à mão na planilha).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Route, X, Loader2, AlertTriangle, Clock, MapPin, Wand2, ExternalLink, ChevronDown,
} from 'lucide-react';

interface EventoMapa {
  id: string;
  titulo: string;
  data: string;
  dataFim?: string | null;
  local?: string | null;
  lat?: number | null;
  lng?: number | null;
}

interface Trecho {
  de: string;
  para: string;
  distanciaKm: number;
  duracaoMin: number;
}

interface RotaCalculada {
  trechos: Trecho[];
  distanciaTotalKm: number;
  duracaoTotalMin: number;
  linha: Array<[number, number]>;
  ordem: number[] | null;
}

const FUSO = 'America/Sao_Paulo';

/** AAAA-MM-DD do evento no horário de Brasília (não no fuso do navegador). */
function diaDe(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}

function horaDe(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

function rotuloDia(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  const semana = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'short' }).format(dt);
  return `${semana.replace('.', '')}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function duracao(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}

export function RotaDoDia({ eventos, onLinhaChange }: {
  eventos: EventoMapa[];
  onLinhaChange: (linha: Array<[number, number]> | undefined) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [dia, setDia] = useState<string>('');
  const [rota, setRota] = useState<RotaCalculada | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  // Dias que têm ao menos dois compromissos localizados — abaixo disso não há
  // rota a traçar, e oferecer o dia só geraria frustração.
  const dias = useMemo(() => {
    const porDia = new Map<string, EventoMapa[]>();
    for (const e of eventos) {
      if (e.lat == null || e.lng == null) continue;
      const d = diaDe(e.data);
      porDia.set(d, [...(porDia.get(d) ?? []), e]);
    }
    return [...porDia.entries()]
      .filter(([, evs]) => evs.length >= 2)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, evs]) => ({ dia: d, quantidade: evs.length }));
  }, [eventos]);

  const doDia = useMemo(() => {
    if (!dia) return [];
    return eventos
      .filter(e => e.lat != null && e.lng != null && diaDe(e.data) === dia)
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  }, [eventos, dia]);

  // Sem coordenada no dia escolhido — vale dizer quantos ficaram de fora.
  const semLocal = useMemo(() => {
    if (!dia) return 0;
    return eventos.filter(e => diaDe(e.data) === dia && (e.lat == null || e.lng == null)).length;
  }, [eventos, dia]);

  const calcular = useCallback(async (otimizar: boolean) => {
    if (doDia.length < 2) return;
    setCarregando(true);
    setErro('');
    try {
      const res = await fetch('/api/rotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otimizar,
          pontos: doDia.map(e => ({ lat: e.lat, lng: e.lng, nome: e.local || e.titulo })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json?.error ?? 'Não foi possível calcular a rota.');
        setRota(null);
        onLinhaChange(undefined);
        return;
      }
      setRota(json);
      onLinhaChange(json.linha);
    } catch {
      setErro('Falha de conexão ao calcular a rota.');
    } finally {
      setCarregando(false);
    }
  }, [doDia, onLinhaChange]);

  // Troca de dia: limpa o que estava desenhado e calcula o novo.
  useEffect(() => {
    setRota(null);
    onLinhaChange(undefined);
    if (dia) calcular(false);
  }, [dia]); // eslint-disable-line react-hooks/exhaustive-deps

  const fechar = () => {
    setAberto(false);
    setDia('');
    setRota(null);
    onLinhaChange(undefined);
  };

  // Ordem em que os compromissos aparecem na rota (muda ao otimizar).
  const sequencia = rota?.ordem ? rota.ordem.map(i => doDia[i]) : doDia;

  /**
   * Avisos de deslocamento que não cabe. Só existe quando o compromisso
   * anterior tem hora de término — sem isso não há de onde contar a folga.
   */
  const avisos = useMemo(() => {
    if (!rota) return [];
    const out: Array<{ i: number; folga: number; viagem: number }> = [];
    rota.trechos.forEach((t, i) => {
      const anterior = sequencia[i];
      const seguinte = sequencia[i + 1];
      if (!anterior?.dataFim || !seguinte) return;
      const folga = Math.round(
        (new Date(seguinte.data).getTime() - new Date(anterior.dataFim).getTime()) / 60000);
      if (folga < t.duracaoMin) out.push({ i, folga, viagem: t.duracaoMin });
    });
    return out;
  }, [rota, sequencia]);

  /** Link do Google Maps com TODAS as paradas, não só o destino. */
  const linkMaps = useMemo(() => {
    if (sequencia.length < 2) return null;
    const p = sequencia.map(e => `${e.lat},${e.lng}`);
    return 'https://www.google.com/maps/dir/?api=1'
      + `&origin=${p[0]}&destination=${p[p.length - 1]}`
      + (p.length > 2 ? `&waypoints=${p.slice(1, -1).join('|')}` : '');
  }, [sequencia]);

  if (dias.length === 0) return null;   // nada a rotear: o botão nem aparece

  return (
    <>
      {!aberto && (
        <button
          onClick={() => { setAberto(true); if (!dia) setDia(dias[0].dia); }}
          title="Traçar rota entre os compromissos do dia"
          className="absolute top-3 right-16 z-[1000] flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition-colors"
          style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--tint-14)' }}
        >
          <Route className="w-4 h-4" style={{ color: '#2563EB' }} />
          Rota do dia
        </button>
      )}

      {aberto && (
        <div className="absolute bottom-0 left-0 right-0 md:bottom-auto md:top-3 md:right-16 md:left-auto md:w-80 w-full z-[1000] overflow-hidden md:rounded-2xl border-t md:border max-h-[70vh] overflow-y-auto"
          style={{ background: 'var(--bg-page)', borderColor: 'var(--tint-14)', boxShadow: '0 8px 40px rgba(0,0,0,0.45)' }}>

          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--tint-14)' }}>
            <div className="flex items-center gap-2">
              <Route className="w-4 h-4" style={{ color: '#2563EB' }} />
              <span className="font-bold text-[13.5px]" style={{ color: 'var(--text-primary)' }}>Rota do dia</span>
            </div>
            <button onClick={fechar} className="p-1 rounded-lg hover:opacity-70">
              <X className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            </button>
          </div>

          <div className="px-4 py-3 space-y-3">
            {/* Seletor de dia */}
            <div className="relative">
              <select
                value={dia}
                onChange={e => setDia(e.target.value)}
                className="w-full appearance-none rounded-xl px-3 py-2 pr-8 text-[13px] outline-none cursor-pointer"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-14)', color: 'var(--text-primary)' }}
              >
                {dias.map(d => (
                  <option key={d.dia} value={d.dia}>
                    {rotuloDia(d.dia)} — {d.quantidade} compromissos
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-tertiary)' }} />
            </div>

            {carregando && (
              <div className="flex items-center gap-2 py-3 text-[12.5px]" style={{ color: 'var(--text-tertiary)' }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Calculando a rota…
              </div>
            )}

            {erro && (
              <div className="flex items-start gap-2 rounded-xl px-3 py-2.5"
                style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }}>
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
                <p className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>{erro}</p>
              </div>
            )}

            {rota && !carregando && (
              <>
                {/* Totais */}
                <div className="flex gap-2">
                  <Total rotulo="Distância" valor={`${rota.distanciaTotalKm} km`} />
                  <Total rotulo="Ao volante" valor={duracao(rota.duracaoTotalMin)} />
                </div>

                {avisos.length > 0 && (
                  <div className="rounded-xl px-3 py-2.5"
                    style={{ background: 'color-mix(in srgb, var(--warning) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--warning)' }} />
                      <span className="text-[12px] font-bold" style={{ color: 'var(--warning)' }}>
                        {avisos.length === 1 ? 'Um deslocamento não cabe' : `${avisos.length} deslocamentos não cabem`}
                      </span>
                    </div>
                    {avisos.map(a => (
                      <p key={a.i} className="text-[11.5px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                        Até <strong>{sequencia[a.i + 1]?.local || sequencia[a.i + 1]?.titulo}</strong>:{' '}
                        {duracao(a.viagem)} de viagem com {a.folga < 0 ? 'sobreposição de horários' : `apenas ${duracao(a.folga)} livres`}.
                      </p>
                    ))}
                  </div>
                )}

                {/* Trechos */}
                <div className="space-y-0.5">
                  {sequencia.map((e, i) => (
                    <div key={e.id}>
                      <div className="flex items-start gap-2.5 py-1.5">
                        <div className="flex flex-col items-center pt-0.5">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                            style={{ background: '#2563EB', color: '#fff' }}>{i + 1}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                            {e.local || e.titulo}
                          </p>
                          <p className="text-[11.5px] flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                            <Clock className="w-3 h-3" />
                            {horaDe(e.data)}{e.dataFim ? ` – ${horaDe(e.dataFim)}` : ''}
                          </p>
                        </div>
                      </div>
                      {rota.trechos[i] && (
                        <div className="flex items-center gap-1.5 pl-[9px] ml-0.5 py-1"
                          style={{ borderLeft: '2px dashed var(--tint-14)' }}>
                          <span className="text-[11px] pl-3.5" style={{ color: 'var(--text-tertiary)' }}>
                            {rota.trechos[i].distanciaKm} km · {duracao(rota.trechos[i].duracaoMin)}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {semLocal > 0 && (
                  <p className="text-[11.5px] flex items-start gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {semLocal === 1
                      ? 'Um compromisso deste dia ficou de fora por não ter endereço localizado.'
                      : `${semLocal} compromissos deste dia ficaram de fora por não terem endereço localizado.`}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => calcular(true)}
                    disabled={doDia.length < 4}
                    title={doDia.length < 4 ? 'A partir de 4 compromissos' : 'Reordenar para gastar menos tempo'}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all hover:opacity-90 disabled:opacity-40"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-14)', color: 'var(--text-primary)' }}
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    Otimizar
                  </button>
                  {linkMaps && (
                    <a href={linkMaps} target="_blank" rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all hover:opacity-90"
                      style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)', color: '#fff' }}>
                      <ExternalLink className="w-3.5 h-3.5" />
                      Abrir no Maps
                    </a>
                  )}
                </div>

                {rota.ordem && (
                  <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    Ordem otimizada — o primeiro e o último compromisso foram mantidos no lugar.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Total({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex-1 rounded-xl px-3 py-2"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-14)' }}>
      <p className="text-[10.5px] uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>{rotulo}</p>
      <p className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>{valor}</p>
    </div>
  );
}
