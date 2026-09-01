'use client';

// Rota do dia sobre o Mapa do Gabinete.
//
// Liga os compromissos de um dia que já têm coordenada e mostra distância e
// tempo de cada trecho. O que dá utilidade real ao painel não é a quilometragem
// — é o AVISO de deslocamento que não cabe no intervalo entre um compromisso e
// o seguinte. É a conta que a assessoria faz no olho hoje (aquele
// "DESLOC.: 30' a 50'" escrito à mão na planilha).
//
// A ordem é EDITÁVEL: dá para arrastar, mover com as setas e inserir paradas
// que não estão na agenda (almoço, abastecer, deixar alguém em casa). Essas
// paradas vivem só nesta tela — não vão para o banco. O uso real é montar a
// rota do dia na hora, e persistir exigiria mudança de schema sem ganho claro.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Route, X, Loader2, AlertTriangle, Clock, MapPin, Wand2, ExternalLink,
  ChevronDown, ChevronUp, Plus, GripVertical, Trash2, RotateCcw, Search,
  Building2, LocateFixed, CornerDownLeft,
} from 'lucide-react';
import { Select } from '@/components/ui/select';
import { corDoTrecho } from '@/lib/maps/cores-rota';

interface EventoMapa {
  id: string;
  titulo: string;
  data: string;
  dataFim?: string | null;
  local?: string | null;
  lat?: number | null;
  lng?: number | null;
}

/** Um ponto da rota: compromisso da agenda ou parada acrescentada à mão. */
interface Parada {
  chave: string;
  nome: string;
  lat: number;
  lng: number;
  avulsa: boolean;
  /** Sede do gabinete ou posição do aparelho: de onde o dia começa. */
  origem?: boolean;
  /** Só compromissos têm horário. */
  inicio?: string;
  fim?: string | null;
}

interface Trecho {
  de: string; para: string; distanciaKm: number; duracaoMin: number;
  /** O caminho deste trecho sozinho — e o que ganha cor propria no mapa. */
  linha?: Array<[number, number]>;
}

interface RotaCalculada {
  trechos: Trecho[];
  distanciaTotalKm: number;
  duracaoTotalMin: number;
  linha: Array<[number, number]>;
  ordem: number[] | null;
}

const FUSO = 'America/Sao_Paulo';

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

/**
 * Os caminhos na ordem dos trechos, para o mapa colorir um a um.
 *
 * Se o servico de rotas nao mandar a geometria separada, sobra a linha inteira
 * como um trecho unico — o mapa volta a ser de uma cor so, mas continua ali.
 */
function linhasPorTrecho(r: RotaCalculada): Array<Array<[number, number]>> | undefined {
  const porTrecho = (r.trechos ?? [])
    .map(t => t.linha ?? [])
    .filter(l => l.length >= 2);
  if (porTrecho.length > 0) return porTrecho;
  return r.linha?.length >= 2 ? [r.linha] : undefined;
}

function duracao(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}

export function RotaDoDia({ eventos, onLinhaChange, onAbertoChange }: {
  eventos: EventoMapa[];
  /** Um caminho por trecho, na ordem da rota: o mapa pinta cada um de uma cor. */
  onLinhaChange: (trechos: Array<Array<[number, number]>> | undefined) => void;
  /** A tela precisa saber, para os balões de detalhe não caírem em cima. */
  onAbertoChange?: (aberto: boolean) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [dia, setDia] = useState('');
  const [paradas, setParadas] = useState<Parada[]>([]);
  const [rota, setRota] = useState<RotaCalculada | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  // Acrescentar parada
  const [addAberto, setAddAberto] = useState(false);
  const [addTexto, setAddTexto] = useState('');
  const [addBuscando, setAddBuscando] = useState(false);

  // Sede do gabinete (Configurações). É a origem padrão do dia — sem ela a
  // rota ignorava o trajeto de saída, que costuma ser o mais longo.
  const [sede, setSede] = useState<Parada | null>(null);
  const [usarOrigem, setUsarOrigem] = useState(true);
  const [voltar, setVoltar] = useState(false);
  const [buscandoGps, setBuscandoGps] = useState(false);

  // Partir de outro endereco. O dia nem sempre comeca no gabinete: quem dorme
  // fora, quem sai de um compromisso da vespera, quem pega alguem no caminho.
  const [saidaAberta, setSaidaAberta] = useState(false);
  const [saidaTexto, setSaidaTexto] = useState('');
  const [saidaBuscando, setSaidaBuscando] = useState(false);
  // A sede cadastrada, guardada a parte: trocar a origem sobrescreve `sede`, e
  // sem isto nao havia caminho de volta — nem pelo GPS, que ja fazia o mesmo.
  const sedeCadastrada = useRef<Parada | null>(null);

  const arrastando = useRef<number | null>(null);

  useEffect(() => {
    fetch('/api/gabinete/sede')
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (j?.lat != null && j?.lng != null) {
          const daSede: Parada = {
            chave: 'origem', nome: j.endereco || 'Sede do gabinete',
            lat: j.lat, lng: j.lng, avulsa: true, origem: true,
          };
          sedeCadastrada.current = daSede;
          setSede(daSede);
        }
      })
      .catch(() => {});
  }, []);

  const dias = useMemo(() => {
    const porDia = new Map<string, number>();
    for (const e of eventos) {
      if (e.lat == null || e.lng == null) continue;
      const d = diaDe(e.data);
      porDia.set(d, (porDia.get(d) ?? 0) + 1);
    }
    return [...porDia.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, n]) => ({ dia: d, quantidade: n }));
  }, [eventos]);

  /** Compromissos do dia, na ordem dos horários. É o ponto de partida da rota. */
  const doDia = useMemo((): Parada[] => {
    if (!dia) return [];
    return eventos
      .filter(e => e.lat != null && e.lng != null && diaDe(e.data) === dia)
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
      .map(e => ({
        chave: e.id,
        nome: e.local || e.titulo,
        lat: e.lat as number,
        lng: e.lng as number,
        avulsa: false,
        inicio: e.data,
        fim: e.dataFim ?? null,
      }));
  }, [eventos, dia]);

  /** Compromissos do dia com a origem na frente e, se pedido, o retorno no fim. */
  const comOrigem = useMemo((): Parada[] => {
    if (doDia.length === 0) return [];
    const partida = usarOrigem && sede ? [sede] : [];
    // O retorno é uma cópia com chave própria: React precisa de chaves únicas,
    // e sem isso a última parada não renderizaria.
    const retorno = voltar && sede
      ? [{ ...sede, chave: 'retorno', nome: `Retorno — ${sede.nome}` }]
      : [];
    return [...partida, ...doDia, ...retorno];
  }, [doDia, sede, usarOrigem, voltar]);

  const semLocal = useMemo(() => {
    if (!dia) return 0;
    return eventos.filter(e => diaDe(e.data) === dia && (e.lat == null || e.lng == null)).length;
  }, [eventos, dia]);

  const calcular = useCallback(async (lista: Parada[], otimizar: boolean) => {
    if (lista.length < 2) { setRota(null); onLinhaChange(undefined); return; }
    setCarregando(true);
    setErro('');
    try {
      const res = await fetch('/api/rotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otimizar,
          pontos: lista.map(p => ({ lat: p.lat, lng: p.lng, nome: p.nome })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json?.error ?? 'Não foi possível calcular a rota.');
        setRota(null);
        onLinhaChange(undefined);
        return;
      }
      // Otimizar reordena de fato a lista, para a tela refletir a rota traçada.
      if (otimizar && Array.isArray(json.ordem)) {
        setParadas(json.ordem.map((i: number) => lista[i]));
      }
      setRota(json);
      onLinhaChange(linhasPorTrecho(json));
    } catch {
      setErro('Falha de conexão ao calcular a rota.');
    } finally {
      setCarregando(false);
    }
  }, [onLinhaChange]);

  // Troca de dia, ou mudança na origem/retorno: recomeça da ordem dos horários.
  useEffect(() => {
    setParadas(comOrigem);
    setRota(null);
    onLinhaChange(undefined);
    if (comOrigem.length >= 2) calcular(comOrigem, false);
  }, [dia, comOrigem.length, sede?.chave, usarOrigem, voltar]); // eslint-disable-line react-hooks/exhaustive-deps

  const reordenar = (de: number, para: number) => {
    if (de === para || para < 0 || para >= paradas.length) return;
    const nova = [...paradas];
    const [item] = nova.splice(de, 1);
    nova.splice(para, 0, item);
    setParadas(nova);
    calcular(nova, false);
  };

  const remover = (i: number) => {
    const nova = paradas.filter((_, n) => n !== i);
    setParadas(nova);
    calcular(nova, false);
  };

  const restaurar = () => {
    setParadas(comOrigem);
    calcular(comOrigem, false);
  };

  /**
   * Substitui a origem pela posição do aparelho — para quem já está na rua.
   * Não vira padrão: no computador a posição vem por IP e erra o bairro, e a
   * rota é montada com antecedência, quando o aparelho não está onde o dia
   * vai começar.
   */
  const usarGps = () => {
    if (!navigator.geolocation) { setErro('Este navegador não informa a localização.'); return; }
    setBuscandoGps(true);
    setErro('');
    navigator.geolocation.getCurrentPosition(
      pos => {
        trocarOrigem({
          chave: 'origem', nome: 'Minha localização', avulsa: true, origem: true,
          lat: pos.coords.latitude, lng: pos.coords.longitude,
        });
        setBuscandoGps(false);
      },
      () => {
        setErro('Não consegui obter sua localização. Verifique a permissão do navegador.');
        setBuscandoGps(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  /**
   * Troca de onde o dia comeca, recalculando na hora.
   *
   * Vale para as tres portas de entrada: o GPS, um endereco digitado e a volta
   * para a sede cadastrada. Todas mexem na mesma peca, entao mexem por aqui.
   */
  const trocarOrigem = useCallback((nova: Parada | null) => {
    const semAntiga = paradas.filter(p => !p.origem);
    const lista = nova ? [nova, ...semAntiga] : semAntiga;
    setSede(nova);
    setUsarOrigem(Boolean(nova));
    setParadas(lista);
    if (lista.length >= 2) calcular(lista, false);
  }, [paradas, calcular]);

  /** Busca o endereço digitado e passa a sair dele. */
  const usarEnderecoDeSaida = async () => {
    const texto = saidaTexto.trim();
    if (!texto) return;
    setSaidaBuscando(true);
    setErro('');
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(texto)}`);
      const json = await res.json();
      const r = json?.results?.[0];
      if (!r) {
        setErro(`Não localizei "${texto}". Tente com a rua e a cidade.`);
        return;
      }
      trocarOrigem({
        chave: 'origem', avulsa: true, origem: true, lat: r.lat, lng: r.lng,
        // O nome que o servico devolveu, e nao o que foi digitado: e assim que
        // se confere que entrou o lugar certo.
        nome: (r.endereco || r.displayName || texto).split(',').slice(0, 2).join(',').trim(),
      });
      setSaidaTexto('');
      setSaidaAberta(false);
    } catch {
      setErro('Falha ao buscar o endereço.');
    } finally {
      setSaidaBuscando(false);
    }
  };

  /** Busca o endereço digitado e insere como parada no fim da lista. */
  const adicionarParada = async () => {
    const texto = addTexto.trim();
    if (!texto) return;
    setAddBuscando(true);
    setErro('');
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(texto)}`);
      const json = await res.json();
      const r = json?.results?.[0];
      if (!r) {
        setErro(`Não localizei "${texto}". Tente com a rua e a cidade.`);
        return;
      }
      const nova = [...paradas, {
        chave: `avulsa-${Date.now()}`,
        // O nome que o serviço devolveu deixa claro QUAL lugar entrou na rota.
        nome: (r.endereco || r.displayName || texto).split(',').slice(0, 2).join(',').trim(),
        lat: r.lat, lng: r.lng, avulsa: true,
      }];
      setParadas(nova);
      setAddTexto('');
      setAddAberto(false);
      calcular(nova, false);
    } catch {
      setErro('Falha ao buscar o endereço.');
    } finally {
      setAddBuscando(false);
    }
  };

  // Lida uma vez: a volta para a sede aparece em dois blocos da tela.
  const sedeOriginal = sedeCadastrada.current;
  // Calculado aqui e nao no JSX: la dentro os dois ramos de `sede ? ... : ...`
  // ja restringiram o tipo, e a comparacao nao compila.
  const podeVoltarASede = Boolean(sedeOriginal && sede?.nome !== sedeOriginal.nome);

  useEffect(() => { onAbertoChange?.(aberto); }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const fechar = () => {
    setAberto(false);
    setDia('');
    setParadas([]);
    setRota(null);
    onLinhaChange(undefined);
  };

  /**
   * Deslocamentos que não cabem no intervalo entre dois compromissos.
   *
   * O tempo é acumulado desde o último compromisso com hora de término, para
   * que paradas avulsas no meio do caminho entrem na conta — inserir um almoço
   * entre duas reuniões é justamente o que costuma estourar o horário.
   */
  const avisos = useMemo(() => {
    if (!rota) return [];
    const out: Array<{ nome: string; folga: number; viagem: number }> = [];
    let fimAnterior: Date | null = null;
    let acumulado = 0;

    paradas.forEach((p, i) => {
      if (i > 0) acumulado += rota.trechos[i - 1]?.duracaoMin ?? 0;
      if (p.avulsa || !p.inicio) return;

      if (fimAnterior) {
        const folga = Math.round((new Date(p.inicio).getTime() - fimAnterior.getTime()) / 60000);
        if (acumulado > folga) out.push({ nome: p.nome, folga, viagem: acumulado });
      }
      fimAnterior = p.fim ? new Date(p.fim) : null;
      acumulado = 0;
    });
    return out;
  }, [rota, paradas]);

  const linkMaps = useMemo(() => {
    if (paradas.length < 2) return null;
    const p = paradas.map(e => `${e.lat},${e.lng}`);
    return 'https://www.google.com/maps/dir/?api=1'
      + `&origin=${p[0]}&destination=${p[p.length - 1]}`
      + (p.length > 2 ? `&waypoints=${p.slice(1, -1).join('|')}` : '');
  }, [paradas]);

  const alterada = paradas.length !== comOrigem.length
    || paradas.some((p, i) => p.chave !== comOrigem[i]?.chave);

  if (dias.length === 0) return null;

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
        <div className="absolute bottom-0 left-0 right-0 md:bottom-auto md:top-3 md:right-16 md:left-auto md:w-[21rem] w-full z-[1000] overflow-hidden md:rounded-2xl border-t md:border max-h-[76vh] overflow-y-auto"
          style={{ background: 'var(--bg-page)', borderColor: 'var(--tint-14)', boxShadow: '0 8px 40px rgba(0,0,0,0.45)' }}>

          <div className="flex items-center justify-between px-4 py-3 sticky top-0 z-10"
            style={{ borderBottom: '1px solid var(--tint-14)', background: 'var(--bg-page)' }}>
            <div className="flex items-center gap-2">
              <Route className="w-4 h-4" style={{ color: '#2563EB' }} />
              <span className="font-bold text-[13.5px]" style={{ color: 'var(--text-primary)' }}>Rota do dia</span>
            </div>
            <button onClick={fechar} className="p-1 rounded-lg hover:opacity-70">
              <X className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            </button>
          </div>

          <div className="px-4 py-3 space-y-3">
            {/* A lista do sistema, e nao um <select> nativo: no Windows o nativo
                abre o menu do sistema operacional, com outra fonte e outras
                cores, destoando de todas as outras listas do AdminHub. */}
            <Select
              value={dia}
              onChange={e => setDia(e.target.value)}
              options={dias.map(d => ({
                value: d.dia,
                label: `${rotuloDia(d.dia)} — ${d.quantidade} ${d.quantidade === 1 ? 'compromisso' : 'compromissos'}`,
              }))}
            />

            {/* Origem do dia */}
            {sede ? (
              <div className="rounded-xl px-3 py-2.5 space-y-2"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-14)' }}>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={usarOrigem}
                    onChange={e => setUsarOrigem(e.target.checked)}
                    className="mt-0.5 w-3.5 h-3.5 flex-shrink-0" style={{ accentColor: '#2563EB' }} />
                  <span className="flex-1 min-w-0">
                    <span className="text-[12.5px] font-semibold block truncate" style={{ color: 'var(--text-primary)' }}>
                      Partir de {sede.nome}
                    </span>
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={voltar} disabled={!usarOrigem}
                    onChange={e => setVoltar(e.target.checked)}
                    className="w-3.5 h-3.5 flex-shrink-0" style={{ accentColor: '#2563EB' }} />
                  <span className="text-[12px] flex items-center gap-1"
                    style={{ color: usarOrigem ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
                    <CornerDownLeft className="w-3 h-3" /> Voltar no fim do dia
                  </span>
                </label>
                <button onClick={usarGps} disabled={buscandoGps}
                  className="flex items-center gap-1.5 text-[11.5px] transition-all hover:opacity-70 disabled:opacity-40"
                  style={{ color: 'var(--text-tertiary)' }}>
                  {buscandoGps
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <LocateFixed className="w-3 h-3" />}
                  Partir da minha localização
                </button>
                {/* Sair de outro lugar. O dia nem sempre comeca no gabinete,
                    e ate aqui a unica alternativa era o GPS — que so serve se a
                    pessoa JA estiver no ponto de partida. */}
                {saidaAberta ? (
                  <div className="flex gap-1.5 pt-0.5">
                    <input
                      autoFocus value={saidaTexto}
                      onChange={e => setSaidaTexto(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') usarEnderecoDeSaida();
                        if (e.key === 'Escape') { setSaidaAberta(false); setSaidaTexto(''); }
                      }}
                      placeholder="Endereço de onde o dia começa"
                      className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-[12px] outline-none"
                      style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                    />
                    <button onClick={usarEnderecoDeSaida} disabled={saidaBuscando || !saidaTexto.trim()}
                      className="px-2.5 rounded-lg text-[12px] font-semibold disabled:opacity-40 flex-shrink-0"
                      style={{ background: 'var(--brand-cobalt)', color: '#FFFFFF' }}>
                      {saidaBuscando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Usar'}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <button onClick={() => setSaidaAberta(true)}
                      className="flex items-center gap-1.5 text-[11.5px] transition-all hover:opacity-70"
                      style={{ color: 'var(--text-tertiary)' }}>
                      <Search className="w-3 h-3" /> Partir de outro endereço
                    </button>
                    {/* Trocar a origem sobrescreve a sede; sem esta volta, o unico
                        jeito de recuperar seria recarregar a tela. */}
                    {podeVoltarASede && sedeOriginal && (
                      <button onClick={() => trocarOrigem(sedeOriginal)}
                        className="flex items-center gap-1.5 text-[11.5px] transition-all hover:opacity-70"
                        style={{ color: 'var(--text-tertiary)' }}>
                        <Building2 className="w-3 h-3" /> Voltar para a sede
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl px-3 py-2.5 space-y-2"
                style={{ background: 'var(--bg-card)', border: '1px dashed var(--tint-14)' }}>
                <p className="text-[11.5px] flex items-start gap-1.5 mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                  <Building2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  A rota começa no primeiro compromisso. Cadastre a sede em Configurações
                  para incluir o trajeto de saída.
                </p>
                <button onClick={usarGps} disabled={buscandoGps}
                  className="flex items-center gap-1.5 text-[11.5px] transition-all hover:opacity-70 disabled:opacity-40"
                  style={{ color: 'var(--text-secondary)' }}>
                  {buscandoGps
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <LocateFixed className="w-3 h-3" />}
                  Partir da minha localização
                </button>
                {/* Sair de outro lugar. O dia nem sempre comeca no gabinete,
                    e ate aqui a unica alternativa era o GPS — que so serve se a
                    pessoa JA estiver no ponto de partida. */}
                {saidaAberta ? (
                  <div className="flex gap-1.5 pt-0.5">
                    <input
                      autoFocus value={saidaTexto}
                      onChange={e => setSaidaTexto(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') usarEnderecoDeSaida();
                        if (e.key === 'Escape') { setSaidaAberta(false); setSaidaTexto(''); }
                      }}
                      placeholder="Endereço de onde o dia começa"
                      className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-[12px] outline-none"
                      style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                    />
                    <button onClick={usarEnderecoDeSaida} disabled={saidaBuscando || !saidaTexto.trim()}
                      className="px-2.5 rounded-lg text-[12px] font-semibold disabled:opacity-40 flex-shrink-0"
                      style={{ background: 'var(--brand-cobalt)', color: '#FFFFFF' }}>
                      {saidaBuscando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Usar'}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <button onClick={() => setSaidaAberta(true)}
                      className="flex items-center gap-1.5 text-[11.5px] transition-all hover:opacity-70"
                      style={{ color: 'var(--text-tertiary)' }}>
                      <Search className="w-3 h-3" /> Partir de outro endereço
                    </button>
                    {/* Trocar a origem sobrescreve a sede; sem esta volta, o unico
                        jeito de recuperar seria recarregar a tela. */}
                    {podeVoltarASede && sedeOriginal && (
                      <button onClick={() => trocarOrigem(sedeOriginal)}
                        className="flex items-center gap-1.5 text-[11.5px] transition-all hover:opacity-70"
                        style={{ color: 'var(--text-tertiary)' }}>
                        <Building2 className="w-3 h-3" /> Voltar para a sede
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {carregando && (
              <div className="flex items-center gap-2 py-2 text-[12.5px]" style={{ color: 'var(--text-tertiary)' }}>
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

            {rota && (
              <div className="flex gap-2">
                <Total rotulo="Distância" valor={`${rota.distanciaTotalKm} km`} />
                <Total rotulo="Ao volante" valor={duracao(rota.duracaoTotalMin)} />
              </div>
            )}

            {avisos.length > 0 && (
              <div className="rounded-xl px-3 py-2.5"
                style={{ background: 'color-mix(in srgb, var(--warning) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5" style={{ color: 'var(--warning)' }} />
                  <span className="text-[12px] font-bold" style={{ color: 'var(--warning)' }}>
                    {avisos.length === 1 ? 'Um deslocamento não cabe' : `${avisos.length} deslocamentos não cabem`}
                  </span>
                </div>
                {avisos.map((a, i) => (
                  <p key={i} className="text-[11.5px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                    Até <strong>{a.nome}</strong>: {duracao(a.viagem)} de trajeto com{' '}
                    {a.folga < 0 ? 'sobreposição de horários' : `apenas ${duracao(a.folga)} livres`}.
                  </p>
                ))}
              </div>
            )}

            {/* Lista reordenável */}
            <div className="space-y-0.5">
              {paradas.map((p, i) => (
                <div key={p.chave}>
                  <div
                    draggable
                    onDragStart={() => { arrastando.current = i; }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      if (arrastando.current !== null) reordenar(arrastando.current, i);
                      arrastando.current = null;
                    }}
                    className="flex items-start gap-2 py-1.5 px-1 rounded-lg group"
                    style={{ cursor: 'grab' }}
                  >
                    <GripVertical className="w-3.5 h-3.5 flex-shrink-0 mt-1 opacity-40"
                      style={{ color: 'var(--text-tertiary)' }} />

                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                      style={{
                        background: p.origem ? '#0f9d58' : p.avulsa ? 'var(--text-tertiary)' : '#2563EB',
                        color: '#fff',
                      }}>
                      {p.origem ? <Building2 className="w-3 h-3" /> : i + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {p.nome}
                      </p>
                      <p className="text-[11.5px] flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                        {p.inicio ? (
                          <><Clock className="w-3 h-3" />{horaDe(p.inicio)}{p.fim ? ` – ${horaDe(p.fim)}` : ''}</>
                        ) : p.origem ? (
                          <><Building2 className="w-3 h-3" />{p.chave === 'retorno' ? 'fim do dia' : 'início do dia'}</>
                        ) : (
                          <><MapPin className="w-3 h-3" />parada acrescentada</>
                        )}
                      </p>
                    </div>

                    {/* Setas: no celular arrastar não funciona bem */}
                    <div className="flex flex-col flex-shrink-0">
                      <button onClick={() => reordenar(i, i - 1)} disabled={i === 0}
                        title="Subir" className="p-0.5 rounded hover:opacity-70 disabled:opacity-20">
                        <ChevronUp className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                      </button>
                      <button onClick={() => reordenar(i, i + 1)} disabled={i === paradas.length - 1}
                        title="Descer" className="p-0.5 rounded hover:opacity-70 disabled:opacity-20">
                        <ChevronDown className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                      </button>
                    </div>

                    <button onClick={() => remover(i)}
                      title={p.avulsa ? 'Remover parada' : 'Tirar da rota'}
                      className="p-1 rounded hover:opacity-70 flex-shrink-0 mt-0.5">
                      <Trash2 className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
                    </button>
                  </div>

                  {/* A mesma cor que este trecho tem no mapa. E o que liga
                      a lista ao tracado: sem isso a cor no mapa nao diz nada. */}
                  {rota?.trechos[i] && (
                    <div className="pl-[26px] py-0.5"
                      style={{ borderLeft: `2px dashed ${corDoTrecho(i)}`, marginLeft: 15 }}>
                      <span className="text-[11px] pl-3" style={{ color: 'var(--text-tertiary)' }}>
                        {rota.trechos[i].distanciaKm} km · {duracao(rota.trechos[i].duracaoMin)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Acrescentar parada */}
            {addAberto ? (
              <div className="flex gap-1.5">
                <input
                  autoFocus value={addTexto}
                  onChange={e => setAddTexto(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') adicionarParada(); if (e.key === 'Escape') setAddAberto(false); }}
                  placeholder="Endereço da parada"
                  className="flex-1 rounded-xl px-3 py-2 text-[12.5px] outline-none"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-14)', color: 'var(--text-primary)' }}
                />
                <button onClick={adicionarParada} disabled={addBuscando || !addTexto.trim()}
                  className="px-3 rounded-xl text-[12px] font-semibold disabled:opacity-40"
                  style={{ background: '#2563EB', color: '#fff' }}>
                  {addBuscando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Ok'}
                </button>
              </div>
            ) : (
              <button onClick={() => setAddAberto(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-all hover:opacity-80"
                style={{ background: 'var(--bg-card)', border: '1px dashed var(--tint-14)', color: 'var(--text-secondary)' }}>
                <Plus className="w-3.5 h-3.5" />
                Acrescentar parada
              </button>
            )}

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
                onClick={() => calcular(paradas, true)}
                disabled={paradas.length < 4 || carregando}
                title={paradas.length < 4
                  ? 'Com 3 paradas a ordem do meio já é a única possível'
                  : 'Reordenar para gastar menos tempo'}
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

            {/* Botao apagado sem motivo visivel confunde: o tooltip so aparece no
                hover, e no celular nunca. */}
            {paradas.length === 3 && (
              <p className="text-[11.5px] leading-snug" style={{ color: 'var(--text-tertiary)' }}>
                Otimizar fica disponível a partir de 4 paradas — o primeiro e o último
                compromisso ficam no lugar, então com 3 sobra um só no meio.
              </p>
            )}

            {alterada && (
              <button onClick={restaurar}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11.5px] transition-all hover:opacity-70"
                style={{ color: 'var(--text-tertiary)' }}>
                <RotateCcw className="w-3 h-3" />
                Voltar à ordem dos horários
              </button>
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
