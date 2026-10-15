'use client';

// Comparador de candidatos do Mapa Eleitoral.
//
// Escolhe-se de 2 a 4 candidatos do mesmo ano e turno; o mapa pinta cada
// estado (presidente) ou cidade com a cor de quem venceu ali ENTRE OS
// ESCOLHIDOS — mais forte quanto maior a vantagem. Ao lado, o resumo (votos e
// áreas vencidas) e a tabela completa por área.
//
// Brasil → estado → cidade: clicar num estado (presidente) abre as cidades;
// clicar numa cidade abre a comparação dentro dela — por local de votação,
// bairro e zona (comparacao-cidade). Prefeito e vereador abrem direto na
// cidade. Os votos por estado/cidade vêm de /api/tse/candidato.

import { useMemo, useRef, useState } from 'react';
import { Plus, X, Loader2, Search, AlertTriangle, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ESTADOS_BRASIL } from '@/lib/types';
import { campoDoPartido, coresDosCandidatos, NOME_CAMPO } from '@/lib/partidos-espectro';
import { MapaComparacao, type AparenciaArea } from '@/components/mapa/mapa-comparacao';
import {
  type CandidatoNaComparacao, type Linha, DestaquesComparacao, LegendaComparacao, PainelVitorias, PlacarComparacao,
  TabelaComparacao, corDoResultado, fmt, htmlComparacao, opacidadePorFolga, resultado, semAcento,
} from '@/components/mapa/comparacao-comum';
import { ComparacaoCidade } from '@/components/mapa/comparacao-cidade';
import { BotaoPdfComparacao } from '@/components/mapa/pdf-comparacao';
import { Avatar, CartaoMapa, EstadoVazio, GradeMapa, Painel, Trilha, comAlfa, type Passo } from '@/components/mapa/comparacao-visual';

const MAX_CANDIDATOS = 4;
const ANOS = ['2026', '2024', '2022', '2020', '2018'];
const ehAnoMunicipal = (ano: string) => (parseInt(ano, 10) - 2020) % 4 === 0;
const nomeDaUf = (uf: string) => ESTADOS_BRASIL.find(e => e.sigla === uf)?.nome ?? uf;

interface DadosCandidato {
  candidatoId: string;
  candidateName: string;
  nomeUrna?: string;
  cargo: string;
  partido: string;
  situacao?: string;
  uf: string;
  totalVotos: number;
  votosPorMunicipio?: Record<string, number>;
  votosPorNomeMunicipio?: Record<string, number>;
  votosPorEstado?: Record<string, number>;
  zonas?: Array<{ municipio: string; zona: number; votos: number }>;
}

interface Candidato {
  id: string;
  nome: string;
  partido: string;
  cargo: string;
  /** null = não tem votos neste turno (ex.: não foi ao 2º turno). */
  dados: DadosCandidato | null;
}

interface Homonimo {
  id: string;
  nome: string;
  nomeUrna: string;
  partido: string;
  cargo: string;
  totalVotos: number;
  municipioPrincipal?: string;
}

function cidadePrincipal(d: DadosCandidato): string | null {
  const porCidade: Record<string, number> = {};
  for (const z of d.zonas ?? []) porCidade[z.municipio] = (porCidade[z.municipio] ?? 0) + z.votos;
  const [cidade] = Object.entries(porCidade).sort((a, b) => b[1] - a[1])[0] ?? [];
  return cidade ?? null;
}

async function carregarCandidato(id: string, ano: string, uf: string, turno: number): Promise<DadosCandidato | null> {
  const params = new URLSearchParams({ candidatoId: id, ano, uf, turno: String(turno) });
  const res = await fetch(`/api/tse/candidato?${params}`);
  if (!res.ok) return null;
  const d = await res.json();
  return d?.candidatoId ? d : null;
}

export function ComparadorCandidatos() {
  const [ano, setAno] = useState('2022');
  const [turno, setTurno] = useState<1 | 2>(1);
  const [abrangencia, setAbrangencia] = useState('BR');
  const [busca, setBusca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const [homonimos, setHomonimos] = useState<Homonimo[]>([]);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const buscaRef = useRef<HTMLInputElement>(null);

  // Presidente: clicar num estado abre as cidades dele.
  const [ufAberta, setUfAberta] = useState<string | null>(null);
  const [dadosUf, setDadosUf] = useState<Record<string, DadosCandidato | null>>({});
  const [carregandoUf, setCarregandoUf] = useState(false);
  // Cidade aberta a partir do mapa ou da tabela do estado.
  const [cidadeAberta, setCidadeAberta] = useState<string | null>(null);

  const municipal = ehAnoMunicipal(ano);
  const escopo = municipal && abrangencia === 'BR' ? '' : abrangencia;

  const voltarAoInicio = () => { setUfAberta(null); setDadosUf({}); setCidadeAberta(null); };
  const limpar = () => { setCandidatos([]); setHomonimos([]); setErro(''); voltarAoInicio(); };

  // ── Adicionar ────────────────────────────────────────────────────────────
  const adicionarPorId = async (id: string) => {
    setHomonimos([]);
    if (candidatos.some(c => c.id === id)) { setErro('Esse candidato já está na comparação.'); return; }
    if (candidatos.length >= MAX_CANDIDATOS) { setErro(`A comparação aceita até ${MAX_CANDIDATOS} candidatos.`); return; }
    setBuscando(true);
    try {
      const dados = await carregarCandidato(id, ano, escopo, turno);
      if (!dados) { setErro(turno === 2 ? 'Esse candidato não disputou o 2º turno.' : 'Não foi possível carregar esse candidato agora.'); return; }
      // Prefeito e vereador só se comparam com quem disputou a mesma cidade.
      const outroMunicipal = candidatos.find(c => c.dados && /PREFEITO|VEREADOR/i.test(c.cargo));
      if (/PREFEITO|VEREADOR/i.test(dados.cargo) && outroMunicipal?.dados) {
        const a = cidadePrincipal(dados), b = cidadePrincipal(outroMunicipal.dados);
        if (a && b && semAcento(a) !== semAcento(b)) {
          setErro(`${dados.nomeUrna ?? dados.candidateName} disputou em ${a}, e a comparação está em ${b}. Prefeitos e vereadores só se comparam dentro da mesma cidade.`);
          return;
        }
      }
      setErro('');
      setBusca('');
      setCandidatos(prev => [...prev, {
        id, nome: dados.nomeUrna || dados.candidateName, partido: dados.partido, cargo: dados.cargo, dados,
      }]);
      voltarAoInicio();
    } finally { setBuscando(false); }
  };

  const buscar = async () => {
    const nome = busca.trim();
    if (!nome) { setErro('Digite o nome do candidato.'); return; }
    if (!escopo) { setErro(`Em ${ano} a eleição foi municipal: escolha o estado da cidade.`); return; }
    if (candidatos.length >= MAX_CANDIDATOS) { setErro(`A comparação aceita até ${MAX_CANDIDATOS} candidatos.`); return; }
    setBuscando(true);
    setErro('');
    setHomonimos([]);
    try {
      const res = await fetch(`/api/tse/candidato?${new URLSearchParams({ candidato: nome, ano, uf: escopo })}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(escopo === 'BR'
          ? 'Em "Brasil" só aparecem candidatos a presidente. Para outros cargos, escolha o estado.'
          : (d?.error ?? 'Candidato não encontrado.'));
        return;
      }
      if (d?.multiplos) { setHomonimos(d.candidatos ?? []); return; }
      if (d?.candidatoId) await adicionarPorId(d.candidatoId);
    } catch { setErro('Não foi possível buscar agora. Tente de novo.'); }
    finally { setBuscando(false); }
  };

  const remover = (id: string) => {
    setCandidatos(prev => prev.filter(c => c.id !== id));
    voltarAoInicio();
  };

  // Trocar o turno recarrega todos (o id é o mesmo nos dois turnos) e mantém
  // a cidade aberta, se houver.
  const trocarTurno = async (t: 1 | 2) => {
    if (t === turno) return;
    setTurno(t);
    if (candidatos.length === 0) return;
    setBuscando(true);
    const novos = await Promise.all(candidatos.map(async c => ({ ...c, dados: await carregarCandidato(c.id, ano, escopo, t) })));
    setCandidatos(novos);
    if (ufAberta) {
      const pares = await Promise.all(novos.filter(c => c.dados).map(async c => [c.id, await carregarCandidato(c.id, ano, ufAberta, t)] as const));
      setDadosUf(Object.fromEntries(pares));
    }
    setBuscando(false);
  };

  const abrirUf = async (uf: string) => {
    setUfAberta(uf);
    setCidadeAberta(null);
    setCarregandoUf(true);
    const pares = await Promise.all(ativos.map(async c => [c.id, await carregarCandidato(c.id, ano, uf, turno)] as const));
    setDadosUf(Object.fromEntries(pares));
    setCarregandoUf(false);
  };

  // ── Cores e candidatos ativos ────────────────────────────────────────────
  const cores = useMemo(() => coresDosCandidatos(candidatos.map(c => c.partido)), [candidatos]);
  const ativos = candidatos.filter(c => c.dados);
  const coresAtivas = candidatos.map((c, i) => (c.dados ? cores[i] : null)).filter((c): c is string => !!c);
  const candsAtivos: CandidatoNaComparacao[] = ativos.map((c, i) => ({ id: c.id, nome: c.nome, partido: c.partido, cor: coresAtivas[i] }));

  // ── Nível ────────────────────────────────────────────────────────────────
  const ehMunicipal = ativos.some(c => /PREFEITO|VEREADOR/i.test(c.cargo));
  const dadosNoNivel = (c: Candidato): DadosCandidato | null =>
    escopo === 'BR' && ufAberta ? dadosUf[c.id] ?? null : c.dados;
  const cidadeDaComparacao = ehMunicipal && ativos[0]?.dados ? cidadePrincipal(ativos[0].dados) : null;
  const cidadeAtual = ehMunicipal ? cidadeDaComparacao : cidadeAberta;
  const nivel: 'brasil' | 'estado' | 'cidade' =
    cidadeAtual ? 'cidade' : escopo === 'BR' && !ufAberta ? 'brasil' : 'estado';
  const ufAtual = ufAberta ?? escopo;

  // ── Linhas (Brasil e estado; a cidade calcula as suas) ─────────────────────
  const linhas: Linha[] = useMemo(() => {
    if (ativos.length === 0 || nivel === 'cidade') return [];
    if (nivel === 'brasil') {
      const ufs = new Set(ativos.flatMap(c => Object.keys(c.dados?.votosPorEstado ?? {})));
      return [...ufs].map(uf => ({
        chave: uf,
        // ZZ é como o TSE identifica os votos dados no exterior.
        nome: uf === 'ZZ' ? 'Exterior' : nomeDaUf(uf),
        votos: ativos.map(c => c.dados?.votosPorEstado?.[uf] ?? 0),
      }));
    }
    const porCidade = ativos.map(c => dadosNoNivel(c)?.votosPorNomeMunicipio ?? {});
    const cidades = new Set(porCidade.flatMap(m => Object.keys(m)));
    return [...cidades].map(nome => ({ chave: nome, nome, votos: porCidade.map(m => m[nome] ?? 0) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatos, nivel, ufAberta, dadosUf]);

  const temExterior = nivel === 'brasil' && linhas.some(l => l.chave === 'ZZ' && l.votos.some(v => v > 0));

  // ── Mapa (Brasil e estado) ───────────────────────────────────────────────
  // No estado, a chave do mapa é o código IBGE (votosPorMunicipio).
  const porCodigo = useMemo(() => {
    if (nivel !== 'estado') return null;
    const listas = ativos.map(c => dadosNoNivel(c)?.votosPorMunicipio ?? {});
    // Reserva pelo nome da cidade (sem acento): se o código do IBGE não vier
    // na resposta, o mapa ainda pinta — como o mapa do modo Resultado faz.
    const porNome = ativos.map(c => {
      const m: Record<string, number> = {};
      for (const [nome, v] of Object.entries(dadosNoNivel(c)?.votosPorNomeMunicipio ?? {})) m[semAcento(nome)] = v;
      return m;
    });
    return (codigo: string, nome?: string): number[] => {
      const porCod = listas.map(m => m[codigo] ?? m[codigo.slice(0, 6)]);
      if (porCod.some(v => v !== undefined)) return porCod.map(v => v ?? 0);
      const k = nome ? semAcento(nome) : '';
      return porNome.map(m => m[k] ?? 0);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatos, nivel, ufAberta, dadosUf]);

  const aparencia = (chave: string, nome: string): AparenciaArea | null => {
    const votos = nivel === 'brasil'
      ? ativos.map(c => c.dados?.votosPorEstado?.[chave] ?? 0)
      : porCodigo?.(chave, nome) ?? [];
    const r = resultado(votos);
    if (!r) return null;
    return {
      cor: corDoResultado(r, coresAtivas),
      opacidade: r.vencedor === -1 ? 0.5 : opacidadePorFolga(r.folga),
      html: htmlComparacao(nome, nivel === 'estado' ? 'Clique para ver dentro da cidade' : null, candsAtivos, votos, r),
    };
  };
  const versaoMapa = `${candidatos.map(c => `${c.id}:${c.dados ? 1 : 0}`).join(',')}|${turno}|${ufAberta}|${Object.keys(dadosUf).length}`;

  const opcoesAbrangencia = [
    ...(municipal ? [] : [{ value: 'BR', label: 'Brasil (presidente)' }]),
    ...ESTADOS_BRASIL.map(e => ({ value: e.sigla, label: e.nome })),
  ];

  const passos: Passo[] = [
    ...(escopo === 'BR' ? [{ rotulo: 'Brasil', onClick: voltarAoInicio }] : []),
    ...(nivel !== 'brasil' ? [{ rotulo: nomeDaUf(ufAtual), onClick: ehMunicipal ? undefined : () => setCidadeAberta(null) }] : []),
    ...(nivel === 'cidade' ? [{ rotulo: cidadeAtual! }] : []),
  ];

  return (
    <div className="space-y-4">
      {/* ── Montar a comparação ── */}
      <Painel titulo="Montar a comparação" icone={Scale} direita={<CamposPoliticos />}>
        <div className="grid grid-cols-2 lg:grid-cols-12 gap-3">
          <Campo rotulo="Ano" className="lg:col-span-2">
            <Select value={ano} onChange={(e) => { setAno(e.target.value); limpar(); if (ehAnoMunicipal(e.target.value) && abrangencia === 'BR') setAbrangencia('SP'); }}
              options={ANOS.map(a => ({ value: a, label: a }))} />
          </Campo>
          <Campo rotulo="Turno" className="lg:col-span-2">
            <div className="flex rounded-lg p-0.5 text-xs h-9" style={{ background: 'var(--bg-card-subtle)', border: '1px solid var(--border-default)' }}>
              {([1, 2] as const).map(t => (
                <button key={t} type="button" onClick={() => trocarTurno(t)}
                  className="flex-1 rounded-md font-semibold transition-all"
                  style={turno === t ? { background: 'var(--brand-cobalt)', color: '#fff', boxShadow: '0 4px 12px -4px rgba(37,99,235,0.6)' } : { color: 'var(--text-secondary)' }}>
                  {t}º turno
                </button>
              ))}
            </div>
          </Campo>
          <Campo rotulo="Onde comparar" className="col-span-2 lg:col-span-3">
            <Select value={escopo || abrangencia} onChange={(e) => { setAbrangencia(e.target.value); limpar(); }} options={opcoesAbrangencia} />
          </Campo>
          <Campo rotulo="Candidato" className="col-span-2 lg:col-span-5">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
                <Input
                  ref={buscaRef}
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') buscar(); }}
                  placeholder={candidatos.length >= MAX_CANDIDATOS ? 'Limite de 4 candidatos' : 'Digite o nome e tecle Enter'}
                  disabled={candidatos.length >= MAX_CANDIDATOS}
                  className="pl-8"
                />
              </div>
              <Button onClick={buscar} disabled={buscando || candidatos.length >= MAX_CANDIDATOS}>
                {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                <span className="hidden sm:inline ml-1">Adicionar</span>
              </Button>
            </div>
          </Campo>
        </div>

        {erro && (
          <p className="mt-3 text-xs flex items-start gap-1.5 rounded-lg px-3 py-2" style={{ color: 'var(--danger)', background: 'var(--danger-soft)' }}>
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px" /> {erro}
          </p>
        )}

        {homonimos.length > 0 && (
          <div className="mt-3 rounded-xl p-2 space-y-1" style={{ border: '1px solid var(--border-default)', background: 'var(--bg-card-subtle)' }}>
            <p className="text-[10px] uppercase tracking-widest font-bold px-1 pt-1" style={{ color: 'var(--text-tertiary)' }}>Mais de um encontrado — escolha</p>
            <div className="max-h-56 overflow-y-auto scrollbar-dark">
              {homonimos.map(h => (
                <button key={h.id} type="button" onClick={() => adicionarPorId(h.id)}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-[var(--tint-06)]">
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{h.nomeUrna}</span>
                    <span className="block text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                      {h.partido} · {h.cargo}{h.municipioPrincipal ? ` · ${h.municipioPrincipal}` : ''}
                    </span>
                  </span>
                  <span className="text-xs font-semibold flex-shrink-0 tabular-nums" style={{ color: 'var(--acento-azul)' }}>{fmt(h.totalVotos)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Vagas: os escolhidos e as que faltam */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {Array.from({ length: MAX_CANDIDATOS }, (_, i) => {
            const c = candidatos[i];
            if (!c) {
              return (
                <button key={`vaga-${i}`} type="button" onClick={() => buscaRef.current?.focus()}
                  className="rounded-xl px-3 py-3 flex items-center gap-3 text-left transition-colors hover:bg-[var(--tint-04)]"
                  style={{ border: '1.5px dashed var(--border-strong)' }}>
                  <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--tint-06)', color: 'var(--text-tertiary)' }}>
                    <Plus className="w-4 h-4" />
                  </span>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
                    {i < 2 ? `Candidato ${i + 1}` : `Candidato ${i + 1} (opcional)`}
                  </span>
                </button>
              );
            }
            return (
              <div key={c.id} className="relative rounded-xl px-3 py-3 flex items-center gap-3 min-w-0"
                style={{
                  background: `linear-gradient(135deg, ${comAlfa(cores[i], 0.10)}, transparent 70%)`,
                  border: `1px solid ${comAlfa(cores[i], 0.35)}`,
                  opacity: c.dados ? 1 : 0.55,
                }}>
                <Avatar nome={c.nome} cor={cores[i]} tamanho={40} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold leading-tight break-words" style={{ color: 'var(--text-primary)' }}>{c.nome}</span>
                  <span className="block text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    {c.partido} · {NOME_CAMPO[campoDoPartido(c.partido)]}
                  </span>
                  <span className="block text-[11px]" style={{ color: c.dados ? 'var(--text-tertiary)' : 'var(--warning)' }}>
                    {c.dados ? c.cargo : 'Sem votos neste turno'}
                  </span>
                </span>
                <button type="button" onClick={() => remover(c.id)} className="self-start p-1 rounded-md hover:bg-[var(--tint-08)]" aria-label={`Tirar ${c.nome} da comparação`}>
                  <X className="h-3.5 w-3.5" style={{ color: 'var(--text-tertiary)' }} />
                </button>
              </div>
            );
          })}
        </div>
      </Painel>

      {ativos.length < 2 ? (
        <EstadoVazio
          titulo={candidatos.length === 0 ? 'Escolha quem vai para o confronto' : 'Falta mais um candidato'}
          texto={candidatos.length === 0
            ? 'Com dois ou mais candidatos, o mapa mostra onde cada um venceu.'
            : 'Adicione mais um candidato com votos neste turno.'}
        />
      ) : (
        <>
          <Trilha
            passos={passos}
            meta={`${ano} · ${turno}º turno`}
            acoes={nivel !== 'cidade' && (
              <BotaoPdfComparacao
                tipo="comparacao"
                titulo={`${candsAtivos.map(c => c.nome).join(' × ')} — ${ano}`}
                subtitulo={`${nivel === 'brasil' ? 'Brasil — por estado' : `${nomeDaUf(ufAtual)} — por cidade`} · ${turno}º turno`}
                colunas={candsAtivos.map(c => c.nome)}
                cores={candsAtivos.map(c => c.cor)}
                rotuloArea={nivel === 'brasil' ? 'Estado' : 'Cidade'}
                linhas={linhas.map(l => ({ nome: l.nome, valores: l.votos }))}
                mapa={{ tipo: nivel === 'brasil' ? 'brasil' : 'estado', uf: nivel === 'estado' ? ufAtual : undefined }}
                // Chave: sigla da UF (Brasil) ou nome da cidade (estado).
                coresMapa={Object.fromEntries(linhas.flatMap(l => {
                  const r = resultado(l.votos);
                  if (!r) return [];
                  return [[nivel === 'brasil' ? l.chave : l.nome, {
                    cor: corDoResultado(r, coresAtivas), opacidade: r.vencedor === -1 ? 0.5 : opacidadePorFolga(r.folga),
                  }] as const];
                }))}
              />
            )}
          />

          {nivel === 'cidade' ? (
            <ComparacaoCidade
              uf={ufAtual}
              municipio={cidadeAtual!}
              ano={ano}
              turno={turno}
              cands={ativos.map((c, i) => ({ ...candsAtivos[i], zonas: dadosNoNivel(c)?.zonas ?? [] }))}
            />
          ) : (
            <>
              <PlacarComparacao cands={candsAtivos} linhas={linhas} nomeArea={nivel === 'brasil' ? 'estados' : 'cidades'} />
              <GradeMapa
                mapa={(
                  <CartaoMapa
                    titulo={nivel === 'brasil' ? 'Quem venceu em cada estado' : `Quem venceu em cada cidade de ${nomeDaUf(ufAtual)}`}
                    dica={nivel === 'brasil' ? 'Clique num estado para ver as cidades' : 'Clique numa cidade para ver por local de votação, bairro e zona'}
                    legenda={<LegendaComparacao cands={candsAtivos} />}
                  >
                    <MapaComparacao
                      tipo={nivel === 'brasil' ? 'brasil' : 'estado'}
                      uf={nivel === 'estado' ? ufAtual : undefined}
                      aparencia={aparencia}
                      versao={versaoMapa}
                      altura="100%"
                      onClickArea={nivel === 'brasil' ? (uf) => abrirUf(uf) : (_codigo, nome) => setCidadeAberta(nome)}
                    />
                    {carregandoUf && (
                      <div className="absolute inset-0 z-[500] flex items-center justify-center" style={{ background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(2px)' }}>
                        <Loader2 className="h-7 w-7 animate-spin text-white" />
                      </div>
                    )}
                  </CartaoMapa>
                )}
                lateral={(
                  <PainelVitorias
                    cands={candsAtivos}
                    linhas={linhas}
                    nomeArea={nivel === 'brasil' ? 'estados' : 'cidades'}
                    extra={temExterior ? { descontar: 1, texto: ' + exterior' } : undefined}
                  />
                )}
              />
              <DestaquesComparacao cands={candsAtivos} linhas={linhas} />
              <TabelaComparacao
                cands={candsAtivos}
                linhas={linhas}
                rotuloArea={nivel === 'brasil' ? 'Estado' : 'Cidade'}
                todasAsAreas={nivel === 'brasil' ? 'Todos os estados' : 'Todas as cidades'}
                onClickLinha={nivel === 'brasil'
                  ? (l) => { if (l.chave !== 'ZZ') abrirUf(l.chave); }
                  : (l) => setCidadeAberta(l.nome)}
                dicaClique={nivel === 'brasil' ? 'Clique num estado para abrir' : 'Clique numa cidade para abrir'}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function Campo({ rotulo, className = '', children }: { rotulo: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1 min-w-0 ${className}`}>
      <label className="block text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--text-tertiary)' }}>{rotulo}</label>
      {children}
    </div>
  );
}

/** As cores seguem o campo político do partido. */
function CamposPoliticos() {
  return (
    <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-tertiary)' }} title="As cores seguem o campo político do partido">
      {([['Esquerda', '#dc2626'], ['Centro', '#ca8a04'], ['Direita', '#2563eb']] as const).map(([r, c]) => (
        <span key={r} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />{r}</span>
      ))}
    </div>
  );
}
